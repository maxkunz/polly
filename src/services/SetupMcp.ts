import { useAppStore } from "@/stores/appStore";
import { createCodeGrantClient, deleteBackend, inactivateCodeGrantClient } from "@/services/genesys/oauth_backend";
import { getErrorStatus, getErrorMessage, sleep } from "@/services/genesys/retry";
import { loadSetupMcpClient, saveSetupMcpClient } from "@/services/metaSettingsService";
import { activateMcp, deactivateMcp, getMcpSettings, type McpSettings } from "@/services/mcpSettingsService";

/**
 * MCP ein- und ausschalten (siehe `documentation/polly_mcp.md`, „Abschalt-Semantik“). Der Genesys-Client der
 * MCP-Anmeldung entsteht erst hier (nicht im Setup), weil nur Installationen mit Feature `mcp` ihn brauchen. Er wird
 * in `meta.setup.mcpClient` gemerkt; Deaktivieren und Uninstall löschen ihn wieder.
 */

/** Minimale Scopes: `users/me` und `tokens/me` (user-basic-info), Data-Table-Zeilen lesen und schreiben (architect). */
export const MCP_GENESYS_SCOPES = ["architect", "user-basic-info"];

/** Gültigkeit der Genesys-Access-Tokens; mit Refresh bestimmt das nur, wie oft im Hintergrund erneuert wird. */
export const MCP_CLIENT_TOKEN_VALIDITY_SECONDS = 3600;

type McpClientRef = { id: string; name: string };

function mcpClientName(projectTag: string | undefined): string {
	return `${projectTag || "app"}_polly_mcp_client`;
}

/**
 * Löscht den Genesys-Client; ein bereits entfernter Client (404) gilt als erledigt. Wie beim Backend-Client im
 * Uninstall erst deaktivieren und kurz warten, Genesys löscht aktive Clients nicht.
 */
async function deleteMcpGenesysClient(clientId: string): Promise<void> {
	try {
		await inactivateCodeGrantClient(clientId);
		await sleep(2000);
		await deleteBackend(clientId);
	} catch (error) {
		if (getErrorStatus(error) !== 404) throw error;
	}
}

/**
 * Aktiviert MCP: Redirect-URI vom Backend holen, Genesys-Client (CODE mit Secret) anlegen, in `__meta` merken und
 * mit Client-ID und Secret an `PUT /mcp-settings` übergeben. Scheitert ein Schritt nach dem Anlegen, wird der Client
 * wieder gelöscht. Braucht in Genesys die Rechte `oauth:client:add/delete`.
 */
export async function enableMcp(): Promise<McpSettings> {
	const app = useAppStore();
	app.initGenesysClients();
	const datatableId = await app.ensureDataTableId();
	const projectTag: string | undefined = app.domain.meta.setup?.projectTag;

	const current = await getMcpSettings();
	if (current.enabled) return current;

	// Rest eines früheren, abgebrochenen Versuchs entfernen, damit kein zweiter Client verwaist
	const leftover = await loadSetupMcpClient(datatableId);
	if (leftover?.id) {
		await deleteMcpGenesysClient(leftover.id);
		app.domain.meta.setup = (await saveSetupMcpClient(datatableId, null)).setup;
	}

	const created = await createCodeGrantClient(
		mcpClientName(projectTag),
		current.redirectUri,
		MCP_GENESYS_SCOPES,
		MCP_CLIENT_TOKEN_VALIDITY_SECONDS,
		"Polly MCP"
	);
	const client: McpClientRef = { id: created.id as string, name: created.name as string };
	try {
		// Zuerst merken, dann übergeben: Ein Abbruch dazwischen lässt sich beim nächsten Versuch aufräumen
		app.domain.meta.setup = (await saveSetupMcpClient(datatableId, client)).setup;
		return await activateMcp(client.id, created.secret as string);
	} catch (error) {
		// Der PUT kann gespeichert haben, obwohl die Antwort fehlt: Dann nutzt das Backend den Client, nicht löschen
		try {
			const status = await getMcpSettings();
			if (status.enabled && status.clientId === client.id) return status;
		} catch (statusError) {
			console.warn("MCP-Status nach dem Fehler nicht lesbar:", getErrorMessage(statusError));
			throw error;
		}
		try {
			await deleteMcpGenesysClient(client.id);
			app.domain.meta.setup = (await saveSetupMcpClient(datatableId, null)).setup;
		} catch (cleanupError) {
			console.warn("MCP-Client konnte nach dem Fehler nicht entfernt werden:", getErrorMessage(cleanupError));
		}
		throw error;
	}
}

/**
 * Deaktiviert MCP: zuerst im Backend (Sitzungen sofort ungültig, Einträge gelöscht), dann den Genesys-Client löschen,
 * damit auch seine Tokens ungültig sind. Ohne `setup` (Einstellungen) wird `meta.setup.mcpClient` am Ende aus `__meta`
 * entfernt; mit `setup` (Uninstall) wird nur dessen Zwischenstand angepasst, die Data Table verschwindet danach.
 * `ignoreBackendErrors`: Der Uninstall macht mit dem Löschen weiter, das Backend räumt dort serverseitig selbst ab.
 */
export async function disableMcp(options: {
	setup?: Record<string, any>;
	onProgress?: (message: string) => void;
	ignoreBackendErrors?: boolean;
} = {}): Promise<void> {
	const app = useAppStore();
	app.initGenesysClients();
	// Ohne `setup` frisch aus `__meta`: Eine andere Sitzung kann den Client angelegt haben, der Store kennt ihn dann nicht
	const client = options.setup
		? (options.setup.mcpClient as McpClientRef | undefined)
		: ((await loadSetupMcpClient(await app.ensureDataTableId())) ?? undefined);
	const progress = options.onProgress ?? (() => {});

	progress("Disabling MCP in the backend...");
	try {
		await deactivateMcp();
	} catch (error) {
		if (!options.ignoreBackendErrors) throw error;
		progress(`MCP could not be disabled in the backend (${getErrorMessage(error)}). Continuing...`);
	}

	if (client?.id) {
		progress(`Deleting MCP OAuth client ${client.id}...`);
		await deleteMcpGenesysClient(client.id);
		client.id = "";
	}
	if (!options.setup && client) {
		app.domain.meta.setup = (await saveSetupMcpClient(await app.ensureDataTableId(), null)).setup;
	}
}
