import { fetchWithTimeout } from "./http";

/**
 * Genesys-OAuth für die MCP-Anmeldung (Lambda `mcp`, Widerruf auch `mcp_admin`): Code tauschen, Refresh, Token-Info,
 * Widerruf des eigenen Tokens. Tokens und Secret stehen nie im Log. Ergebnisse des Spikes: `polly_mcp.md`, Abschnitt 13.
 */

export interface GenesysTokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Ablauf des Access-Tokens (ms) */
  expiresAt: number;
}

export interface GenesysOAuthClient {
  clientId: string;
  /** Vertraulicher CODE-Client (Entscheidung M6); ohne Secret gibt Genesys keinen Refresh-Token aus. */
  clientSecret?: string;
}

export type GenesysTokenResult =
  | { ok: true; tokens: GenesysTokenSet }
  /** `invalid_grant`: Code oder Refresh-Token ungültig/verbraucht; `upstream`: Genesys nicht erreichbar oder Fehler */
  | { ok: false; kind: "invalid_grant" | "upstream"; status?: number };

/** Ohne `expires_in` von Genesys rechnen wir mit dem Wert des Clients (`SetupMcp.ts`). */
const DEFAULT_GENESYS_TOKEN_SECONDS = 3600;

function tokenEndpoint(region: string): string {
  return `https://login.${region}/oauth/token`;
}

async function requestToken(
  region: string,
  client: GenesysOAuthClient,
  form: Record<string, string>,
  now: number
): Promise<GenesysTokenResult> {
  const body = new URLSearchParams(form);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (client.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", client.clientId);
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(tokenEndpoint(region), { method: "POST", headers, body: body.toString() });
  } catch {
    return { ok: false, kind: "upstream" };
  }
  if (res.status === 400 || res.status === 401) return { ok: false, kind: "invalid_grant", status: res.status };
  if (!res.ok) return { ok: false, kind: "upstream", status: res.status };
  const data: any = await res.json().catch(() => null);
  if (typeof data?.access_token !== "string" || !data.access_token) return { ok: false, kind: "upstream", status: res.status };
  const expiresIn = Number(data.expires_in);
  return {
    ok: true,
    tokens: {
      accessToken: data.access_token,
      refreshToken: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : undefined,
      expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_GENESYS_TOKEN_SECONDS) * 1000,
    },
  };
}

/** Code aus `/callback` gegen Tokens tauschen (mit PKCE-Verifier und, falls vorhanden, Client-Secret). */
export function exchangeGenesysCode(
  region: string,
  client: GenesysOAuthClient,
  params: { code: string; redirectUri: string; codeVerifier: string },
  now: number
): Promise<GenesysTokenResult> {
  return requestToken(
    region,
    client,
    { grant_type: "authorization_code", code: params.code, redirect_uri: params.redirectUri, code_verifier: params.codeVerifier },
    now
  );
}

/** Refresh mit Rotation: Genesys gibt einen neuen Refresh-Token zurück, der alte gilt nicht mehr. */
export function refreshGenesysToken(
  region: string,
  client: GenesysOAuthClient,
  refreshToken: string,
  now: number
): Promise<GenesysTokenResult> {
  return requestToken(region, client, { grant_type: "refresh_token", refresh_token: refreshToken }, now);
}

export type GenesysTokenInfo = { ok: true; clientId: string; orgId: string } | { ok: false; status?: number };

/** `GET /api/v2/tokens/me`: Client und Org des Tokens (Prüfung gegen den Mandanten im Callback). */
export async function loadGenesysTokenInfo(region: string, accessToken: string): Promise<GenesysTokenInfo> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`https://api.${region}/api/v2/tokens/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    return { ok: false };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const data: any = await res.json().catch(() => null);
  const clientId = typeof data?.OAuthClient?.id === "string" ? data.OAuthClient.id : "";
  const orgId = typeof data?.organization?.id === "string" ? data.organization.id : "";
  if (!clientId || !orgId) return { ok: false, status: res.status };
  return { ok: true, clientId, orgId };
}

/** Widerruft das eigene Genesys-Token (`DELETE /api/v2/tokens/me`). Nach Möglichkeit: Fehler ergeben `false`. */
export async function revokeGenesysToken(region: string, accessToken: string, timeoutMs?: number): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `https://api.${region}/api/v2/tokens/me`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      timeoutMs
    );
    // 401: Token ohnehin ungültig
    return res.ok || res.status === 401;
  } catch {
    return false;
  }
}
