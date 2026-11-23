import { apiFetch } from "@/services/pollyApi";

/**
 * Aufrufe der Lambda `mcp_admin` (`/mcp-settings`, siehe `documentation/polly_mcp.md`, „Abschalt-Semantik“).
 * Alle Methoden prüft die Lambda serverseitig gegen `polly_deploy`. Wirft PollyApiError bzw. MissingTokenError.
 */

export interface McpSettings {
	/** Feature Flag `mcp` in `__meta` */
	featureEnabled: boolean;
	/** Globaler Kill-Switch des Servers (`MCP_ENABLED`) */
	serverEnabled: boolean;
	/** MCP ist für diese Installation aktiviert */
	enabled: boolean;
	allowComments: boolean;
	/** URL für den MCP-Client */
	mcpUrl: string;
	/** Redirect-URI, die der Genesys-Client tragen muss */
	redirectUri: string;
	clientId: string | null;
	sessionCount: number;
}

function parseSettings(body: any): McpSettings {
	return {
		featureEnabled: body?.featureEnabled === true,
		serverEnabled: body?.serverEnabled === true,
		enabled: body?.enabled === true,
		allowComments: body?.allowComments === true,
		mcpUrl: typeof body?.mcpUrl === "string" ? body.mcpUrl : "",
		redirectUri: typeof body?.redirectUri === "string" ? body.redirectUri : "",
		clientId: typeof body?.clientId === "string" && body.clientId ? body.clientId : null,
		sessionCount: typeof body?.sessionCount === "number" ? body.sessionCount : 0
	};
}

async function call(method: "GET" | "PUT" | "DELETE", body?: unknown): Promise<McpSettings> {
	const response = await apiFetch("/mcp-settings", {
		method,
		headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
	return parseSettings(await response.json());
}

/** Status; erzeugt beim ersten Aufruf den URL-Schlüssel, damit die Redirect-URI feststeht. */
export function getMcpSettings(): Promise<McpSettings> {
	return call("GET");
}

/** Aktiviert MCP mit dem angelegten Genesys-Client. Das Secret wird nur übergeben und dort verschlüsselt gespeichert. */
export function activateMcp(clientId: string, clientSecret: string): Promise<McpSettings> {
	return call("PUT", { clientId, clientSecret });
}

export function setMcpAllowComments(allowComments: boolean): Promise<McpSettings> {
	return call("PUT", { allowComments });
}

/** Deaktiviert MCP, macht alle Sitzungen ungültig und löscht die MCP-Einträge des Mandanten. */
export function deactivateMcp(): Promise<McpSettings> {
	return call("DELETE");
}
