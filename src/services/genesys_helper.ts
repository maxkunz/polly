import { useAppStore } from "@/stores/appStore";
import { Domain } from "@/domain/Domain";
import { Meta } from "@/domain/Meta";
import { Questions } from "@/domain/Questions";
import type { LockObject, LockRow } from "@/services/lockingService";

export type QuestionAnswerStats = {
	tenantId: string;
	questionId: string;
	counts: Record<string, number>;
	totalResponses: number;
	updatedAt: string | null;
	lastValue?: number | null;
};

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
	redirectUri: string
): Promise<void> {
	if (!clientId) {
		throw new Error("Missing clientId for Genesys login.");
	}

	const app = getApp();
	app.initGenesysClients();
	const genesys = app.genesys;

	genesys.client.setEnvironment("mypurecloud.de");

	await genesys.client.loginImplicitGrant(clientId, redirectUri);

	const accessToken = genesys.client?.authData?.accessToken ?? null;
	if (accessToken) {
		genesys.client.setAccessToken(accessToken);
	}
	app.genesys.accessToken = accessToken;

	const user = await genesys.usersApi.getUsersMe();
	app.currentUser = {
		id: String(user?.id ?? ""),
		name: String(user?.name ?? ""),
		email: (user?.email as string | undefined) ?? undefined
	};
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

function buildMetaRows(meta: { setup: Record<string, any> | null }): Record<string, string>[] {
	const setup = meta.setup && typeof meta.setup === "object" ? meta.setup : {};
	const rawRows = (setup as Record<string, unknown>)?.datatableMetaRows;
	if (!rawRows || typeof rawRows !== "object") return [];

	return Object.entries(rawRows as Record<string, unknown>)
		.filter(([key]) => key.startsWith("__") && key !== "__meta" && key !== "__lock")
		.map(([key, value]) => ({
			key,
			meta: JSON.stringify(value ?? {}),
			name: "",
			prompt: "",
			reprompt: "",
			min_value: "",
			max_value: "",
			enabled: ""
		}));
}

function parseBooleanString(value: unknown, fallback = true): boolean {
	if (typeof value !== "string") return fallback;
	if (value.toLowerCase() === "true") return true;
	if (value.toLowerCase() === "false") return false;
	return fallback;
}

function isSpecialConfigRow(key: string): boolean {
	return key === "__lock" || key.startsWith("__");
}

export async function syncConfigurationToGenesys(datatableId: string | null): Promise<void> {
	if (!datatableId) {
		console.error("syncConfigurationToGenesys requires a datatableId.");
		return;
	}

	const app = getApp();
	const architectApi = useAppStore().genesys.architectApi;
	const existingRowsResponse = await architectApi.getFlowsDatatableRows(datatableId, {
		pageSize: 500,
		showbrief: false
	});
	const existingRows = existingRowsResponse?.entities ?? [];
	const existingKeys = new Set(existingRows.map((row: any) => String(row?.key ?? "")).filter(Boolean));

	const desiredRows = [
		{
			key: "__meta",
			meta: JSON.stringify(app.domain.meta.toJSON()),
			name: "",
			prompt: "",
			reprompt: "",
			min_value: "",
			max_value: "",
			enabled: ""
		},
		...buildMetaRows(app.domain.meta),
		...app.domain.questions.all().map(question => ({
			key: question.id,
			meta: "",
			name: question.name ?? "",
			prompt: question.prompt ?? "",
			reprompt: question.reprompt ?? "",
			min_value: String(question.minValue ?? 1),
			max_value: String(question.maxValue ?? 5),
			enabled: question.enabled ? "true" : "false"
		}))
	];

	for (const row of desiredRows) {
		if (existingKeys.has(row.key)) {
			await architectApi.putFlowsDatatableRow(datatableId, row.key, { body: row });
			continue;
		}

		await architectApi.postFlowsDatatableRows(datatableId, row);
	}

	const desiredKeys = new Set(desiredRows.map(row => row.key));
	for (const existing of existingRows) {
		const key = String(existing?.key ?? "");
		if (!key || isSpecialConfigRow(key) || desiredKeys.has(key)) {
			continue;
		}
		await architectApi.deleteFlowsDatatableRow(datatableId, key);
	}
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
	const rawMeta = safeParse(metaRow?.meta ?? metaRow?.values?.meta ?? "{}", {});
	const datatableMetaRows: Record<string, unknown> = {};

	for (const row of entities) {
		const key = String(row?.key ?? "");
		if (!key.startsWith("__") || key === "__lock" || key === "__meta") continue;
		const raw = row?.values && typeof row.values === "object" ? row.values : row;
		datatableMetaRows[key] = safeParse(raw?.meta ?? "{}", {});
	}

	const mergedMeta =
		rawMeta && typeof rawMeta === "object"
			? {
					...rawMeta,
					setup: {
						...((rawMeta as Record<string, any>)?.setup ?? {}),
						datatableMetaRows
					}
			  }
			: rawMeta;

	const questionsMap: Record<string, unknown> = {};
	for (const row of entities) {
		const key = String(row?.key ?? "");
		if (!key || isSpecialConfigRow(key)) continue;

		const raw = row?.values && typeof row.values === "object" ? row.values : row;
		questionsMap[key] = {
			id: key,
			name: raw?.name ?? "",
			prompt: raw?.prompt ?? "",
			reprompt: raw?.reprompt ?? "",
			minValue: Number(raw?.min_value ?? 1),
			maxValue: Number(raw?.max_value ?? 5),
			enabled: parseBooleanString(raw?.enabled, true)
		};
	}

	const app = getApp();
	app.domain = new Domain({
		meta: Meta.fromJSON(mergedMeta),
		questions: Questions.fromJSON(questionsMap)
	});
}

export async function getQuestionAnswers(): Promise<QuestionAnswerStats[]> {
	const app = getApp();
	const accessToken = app.genesys.accessToken;
	if (!accessToken) {
		throw new Error("Missing Genesys access token.");
	}

	const response = await fetch("/api/question-answers", {
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			"x-genesys-region": "mypurecloud.de"
		}
	});

	if (!response.ok) {
		throw new Error(`Loading question answers failed (${response.status}).`);
	}

	let body: { items?: QuestionAnswerStats[] } | null = null;
	try {
		body = (await response.json()) as { items?: QuestionAnswerStats[] };
	} catch (error) {
		console.warn("Question answers endpoint did not return valid JSON.", error);
		return [];
	}

	return Array.isArray(body.items) ? body.items : [];
}
