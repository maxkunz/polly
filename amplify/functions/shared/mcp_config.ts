/** Redirect-Hosts, die ein MCP-Client in der DCR angeben darf, wenn `MCP_ALLOWED_REDIRECT_HOSTS` fehlt. */
export const DEFAULT_MCP_REDIRECT_HOSTS = ["claude.ai", "claude.com"];

/** Globaler Kill-Switch: nur der Wert `"true"` schaltet MCP ein, alles andere (auch fehlend) ist aus. */
export function isMcpEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.MCP_ENABLED?.trim().toLowerCase() === "true";
}

/** Erlaubte Redirect-Hosts aus `MCP_ALLOWED_REDIRECT_HOSTS` (kommagetrennt, Kleinbuchstaben); leer ergibt den Default. */
export function parseAllowedRedirectHosts(raw: string | undefined): string[] {
  const hosts = (raw ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
  return hosts.length > 0 ? hosts : [...DEFAULT_MCP_REDIRECT_HOSTS];
}

/** MCP-Endpunkt eines Mandanten (die URL, die in den MCP-Client eingetragen wird). */
export function buildMcpUrl(publicBaseUrl: string, tenantKey: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/mcp/${tenantKey}`;
}

/** Redirect-URI des Genesys-Clients: Rückkehr von Genesys in die OAuth-Fassade (`/callback`, M7). */
export function buildGenesysRedirectUri(publicBaseUrl: string, tenantKey: string): string {
  return `${buildMcpUrl(publicBaseUrl, tenantKey)}/oauth/callback`;
}
