/**
 * Reine Teile von `/mcp-settings` (ohne AWS-SDK, getestet in `test/mcpAdmin.test.ts`): Body der `PUT`-Anfrage und
 * Prüfung des Genesys-Clients, den das Frontend angelegt hat.
 */

/** Der Body enthält höchstens Client-ID und Secret. */
export const MCP_SETTINGS_MAX_BODY_BYTES = 4 * 1024;

const GENESYS_CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_SECRET_MAX_CHARS = 256;

export type McpSettingsPut =
  | { kind: "enable"; clientId: string; clientSecret: string }
  | { kind: "comments"; allowComments: boolean };

export type McpSettingsPutResult = { ok: true; request: McpSettingsPut } | { ok: false; message: string };

/** `{ allowComments }` schaltet nur das Kommentar-Flag um, `{ clientId, clientSecret }` aktiviert MCP. Beides zugleich ist ungültig. */
export function parseMcpSettingsPut(body: unknown): McpSettingsPutResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "Body must be a JSON object" };
  const record = body as Record<string, unknown>;
  const hasComments = "allowComments" in record;
  const hasClient = "clientId" in record || "clientSecret" in record;
  if (hasComments === hasClient) {
    return { ok: false, message: "Send either allowComments or clientId with clientSecret" };
  }
  if (hasComments) {
    if (typeof record.allowComments !== "boolean") return { ok: false, message: "allowComments must be a boolean" };
    return { ok: true, request: { kind: "comments", allowComments: record.allowComments } };
  }
  const clientId = typeof record.clientId === "string" ? record.clientId.trim() : "";
  if (!GENESYS_CLIENT_ID.test(clientId)) return { ok: false, message: "clientId must be a Genesys client ID" };
  const clientSecret = typeof record.clientSecret === "string" ? record.clientSecret.trim() : "";
  if (!clientSecret || clientSecret.length > CLIENT_SECRET_MAX_CHARS) {
    return { ok: false, message: "clientSecret is required" };
  }
  return { ok: true, request: { kind: "enable", clientId, clientSecret } };
}

export type GenesysClientCheck = { ok: true } | { ok: false; reason: "grant_type" | "redirect_uri" | "inactive" };

/** Der Client muss ein CODE-Client sein, genau die Redirect-URI dieses Mandanten tragen und aktiv sein. */
export function checkGenesysClient(client: any, redirectUri: string): GenesysClientCheck {
  if (client?.authorizedGrantType !== "CODE") return { ok: false, reason: "grant_type" };
  const uris: unknown[] = Array.isArray(client?.registeredRedirectUri) ? client.registeredRedirectUri : [];
  if (!uris.includes(redirectUri)) return { ok: false, reason: "redirect_uri" };
  // Fehlendes Feld gilt als aktiv, nur ein ausdrücklich anderer Zustand sperrt
  if (typeof client?.state === "string" && client.state !== "active") return { ok: false, reason: "inactive" };
  return { ok: true };
}

export interface McpSettingsStatus {
  /** Feature Flag `mcp` in `__meta` */
  featureEnabled: boolean;
  /** Globaler Kill-Switch `MCP_ENABLED` */
  serverEnabled: boolean;
  /** `mcpEnabled` im Mandanteneintrag */
  enabled: boolean;
  allowComments: boolean;
  mcpUrl: string;
  redirectUri: string;
  clientId: string | null;
  sessionCount: number;
}

export function buildMcpSettingsStatus(params: {
  tenant: Record<string, any>;
  featureEnabled: boolean;
  serverEnabled: boolean;
  mcpUrl: string;
  redirectUri: string;
  sessionCount: number;
}): McpSettingsStatus {
  const { tenant } = params;
  return {
    featureEnabled: params.featureEnabled,
    serverEnabled: params.serverEnabled,
    enabled: tenant.mcpEnabled === true,
    allowComments: tenant.mcpAllowComments === true,
    mcpUrl: params.mcpUrl,
    redirectUri: params.redirectUri,
    clientId: typeof tenant.mcpGenesysClientId === "string" && tenant.mcpGenesysClientId ? tenant.mcpGenesysClientId : null,
    sessionCount: params.sessionCount,
  };
}
