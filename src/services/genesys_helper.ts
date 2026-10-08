import { useAppStore } from "@/stores/appStore";
import { Domain } from "@/domain/Domain";
import { Meta } from "@/domain/Meta";
import type { LockObject, LockRow } from "@/services/lockingService";
import { genesysAuthStoragePrefix } from "@/services/genesys/region";
import { getGenesysRegion } from "@/services/genesysRegion";

function getApp() {
	return useAppStore();
}

export function safeParse<T = unknown>(json: unknown, fallback: T): T {
	try {
		if (typeof json !== "string") {
			return fallback;
		}
		return JSON.parse(json) as T;
	} catch (error) {
		console.warn("JSON parse error:", json, error);
		return fallback;
	}
}

export async function login(
	clientId: string | null,
	redirectUri: string,
	region: string
): Promise<void> {
	if (!clientId) {
		throw new Error("Missing clientId for Genesys login.");
	}

	const app = getApp();
	app.initGenesysClients();
	const genesys = app.genesys;

	genesys.client.setEnvironment(region);
	genesys.client.setPersistSettings(true, genesysAuthStoragePrefix(clientId, region));

	await genesys.client.loginPKCEGrant(clientId, redirectUri);

	const accessToken = genesys.client?.authData?.accessToken ?? null;
	if (accessToken) {
		genesys.client.setAccessToken(accessToken);
	}
	app.genesys.accessToken = accessToken;

	const user = await genesys.usersApi.getUsersMe();
	app.currentUser = {
		id: String(user?.id ?? ""),
		name: String(user?.name ?? ""),
		email: (user?.email as string | undefined) ?? undefined,
		// Fehler beim Laden ⇒ keine Rollen, der User arbeitet nur lesend
		roles: (await loadCurrentUserRoles()) ?? []
	};
	app.rolesLoadedAt = Date.now();
}

// Lädt die Rollennamen des eingeloggten Users. Liefert null, wenn der Abruf
// fehlschlägt (z. B. fehlender OAuth-Scope).
export async function loadCurrentUserRoles(): Promise<string[] | null> {
	try {
		const me = await getApp().genesys.usersApi.getUsersMe({ expand: ["authorization"] });
		const roles: Array<{ name?: string }> = me?.authorization?.roles ?? [];
		return roles.map(role => String(role?.name ?? "")).filter(Boolean);
	} catch (error) {
		console.warn("Could not load Genesys roles of current user.", error);
		return null;
	}
}

export async function getLockRow(
	datatableId: string,
	lockRowKey = "__lock"
): Promise<LockRow> {
	const row = await useAppStore().genesys.architectApi.getFlowsDatatableRow(datatableId, lockRowKey, {
		showbrief: false
	});

	const meta = row?.values?.meta ?? row?.meta ?? "{}";
	return {
		key: lockRowKey,
		columns: safeParse<Record<string, LockObject | null>>(meta, {})
	};
}

export async function putLockRow(
	datatableId: string,
	lockRow: LockRow
): Promise<void> {
	const body: Record<string, string> = {
		key: lockRow.key,
		meta: JSON.stringify(lockRow.columns ?? {}),
		name: "",
		prompt: "",
		reprompt: "",
		min_value: "",
		max_value: "",
		enabled: ""
	};

	await useAppStore().genesys.architectApi.putFlowsDatatableRow(datatableId, lockRow.key, { body });
}

export async function getConfigurationDataFromGenesys(datatableId: string | null): Promise<void> {
	if (!datatableId) {
		console.error("getConfigurationDataFromGenesys requires a datatableId.");
		return;
	}

	const res = await useAppStore().genesys.architectApi.getFlowsDatatableRows(datatableId, {
		pageSize: 500,
		showbrief: false
	});
	const entities = res?.entities ?? [];
	const metaRow = entities.find((row: any) => row?.key === "__meta");
	const rawMeta = safeParse(metaRow?.Draft ?? "{}", {});

	const app = getApp();
	app.domain = new Domain({
		meta: Meta.fromJSON(rawMeta)
	});
}
