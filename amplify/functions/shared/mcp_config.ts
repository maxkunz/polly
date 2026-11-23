/** Redirect-URIs, die ein MCP-Client in der DCR angeben darf, wenn `MCP_ALLOWED_REDIRECT_URIS` fehlt. */
export const DEFAULT_MCP_REDIRECT_URIS = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"];

/** Globaler Kill-Switch: nur der Wert `"true"` schaltet MCP ein, alles andere (auch fehlend) ist aus. */
export function isMcpEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.MCP_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Ursprung und Pfad einer erlaubten Redirect-URI (`https://host/pfad`, Host klein), sonst `undefined`. Ohne Port,
 * Query, Fragment, Zugangsdaten und Wildcards; nur ein ganzer Pfad, damit kein Open Redirect auf demselben Host greift.
 */
export function normalizeAllowedRedirectUri(raw: string): string | undefined {
  if (raw.includes("*") || raw.includes("#") || raw.includes("?")) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.pathname === "/") return undefined;
  return url.origin + url.pathname;
}

/**
 * Erlaubte Redirect-URIs aus `MCP_ALLOWED_REDIRECT_URIS` (kommagetrennt, je Ursprung und Pfad); ungültige Einträge
 * werden ignoriert, bleibt keiner übrig, gilt der Default.
 */
export function parseAllowedRedirectUris(raw: string | undefined): string[] {
  const uris = (raw ?? "")
    .split(",")
    .map((entry) => normalizeAllowedRedirectUri(entry.trim()))
    .filter((entry): entry is string => Boolean(entry));
  return uris.length > 0 ? [...new Set(uris)] : [...DEFAULT_MCP_REDIRECT_URIS];
}

/** MCP-Endpunkt eines Mandanten (die URL, die in den MCP-Client eingetragen wird). */
export function buildMcpUrl(publicBaseUrl: string, tenantKey: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/mcp/${tenantKey}`;
}

/** Redirect-URI des Genesys-Clients: Rückkehr von Genesys in die OAuth-Fassade (`/callback`, M7). */
export function buildGenesysRedirectUri(publicBaseUrl: string, tenantKey: string): string {
  return `${buildMcpUrl(publicBaseUrl, tenantKey)}/oauth/callback`;
}
