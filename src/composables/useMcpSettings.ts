import { ref } from "vue";
import { i18n } from "@/i18n";
import { MissingTokenError, PollyApiError } from "@/services/pollyApi";
import { getErrorStatus } from "@/services/genesys/retry";
import { MetaUnreadableError } from "@/services/metaSettingsService";
import { getMcpSettings, setMcpAllowComments, type McpSettings } from "@/services/mcpSettingsService";
import { disableMcp, enableMcp } from "@/services/SetupMcp";

/**
 * Einstellungen → MCP-Schnittstelle (Karte `McpSettingsCard`): Status laden, aktivieren, deaktivieren und das
 * Kommentar-Flag umschalten. Das Backend prüft jeden Aufruf serverseitig gegen `polly_deploy`.
 */

export function mcpErrorMessage(error: unknown): string {
	const { t } = i18n.global;
	if (error instanceof MissingTokenError) return t("mcp.errors.missingToken");
	if (error instanceof MetaUnreadableError) return t("mcp.errors.metaUnreadable");
	if (error instanceof PollyApiError) {
		if (error.code === "server_disabled") return t("mcp.errors.serverDisabled");
		if (error.code === "feature_disabled") return t("mcp.errors.featureDisabled");
		if (error.code === "genesys_forbidden") return t("mcp.errors.clientNotReadable");
		if (error.code === "client_invalid" || error.code === "client_not_found") return t("mcp.errors.clientInvalid");
		if (error.status === 403) return t("mcp.errors.missingRole");
		if (error.status === 429) return t("mcp.errors.throttled");
		return `${t("mcp.errors.generic")}: ${error.message}`;
	}
	// Genesys-Fehler beim Anlegen oder Löschen des OAuth-Clients
	if (getErrorStatus(error) === 403) return t("mcp.errors.clientRights");
	if (error instanceof Error && error.message) return `${t("mcp.errors.generic")}: ${error.message}`;
	return t("mcp.errors.generic");
}

export function useMcpSettings() {
	const settings = ref<McpSettings | null>(null);
	const loading = ref(false);
	const busy = ref(false);
	const loadError = ref("");

	async function load(): Promise<void> {
		loading.value = true;
		loadError.value = "";
		try {
			settings.value = await getMcpSettings();
		} catch (error) {
			loadError.value = mcpErrorMessage(error);
		} finally {
			loading.value = false;
		}
	}

	/** Führt eine Änderung aus; Fehler gehen an den Aufrufer (Toast), `busy` sperrt parallele Klicks. */
	async function run(action: () => Promise<McpSettings | void>): Promise<void> {
		if (busy.value) return;
		busy.value = true;
		try {
			const result = await action();
			if (result) settings.value = result;
			else await load();
		} finally {
			busy.value = false;
		}
	}

	return {
		settings,
		loading,
		busy,
		loadError,
		load,
		enable: () => run(() => enableMcp()),
		disable: () => run(async () => disableMcp()),
		setAllowComments: (value: boolean) => run(() => setMcpAllowComments(value))
	};
}
