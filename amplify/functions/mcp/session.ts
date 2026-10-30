import {
  decryptClientSecret,
  decryptGenesysTokens,
  encryptGenesysTokens,
  type GenesysSessionTokens,
} from "../shared/mcp_secret";
import { refreshGenesysToken, revokeGenesysToken, type GenesysTokenResult } from "../shared/mcp_genesys";
import { SESSION_RATE_LIMIT_PER_MINUTE } from "./oauth";
import type { OAuthStore, SessionRecord } from "./oauth_store";
import type { McpTenant } from "./tenant";
import { verifyAccessToken, type TokenTenant } from "./tokens";

/**
 * Prüfkette Schritte 4 bis 6 pro MCP-Aufruf (`documentation/polly_mcp.md`, Abschnitt 3): Access-Token, Session
 * (bei Bedarf Genesys-Refresh), Rate-Limit pro Session. Schritte 1 bis 3 liegen in `tenant.ts`, die Rolle des Tools
 * und das Audit-Log in `tool_handlers.ts`. Das Genesys-Token verlässt den Server nie.
 */

/** Genesys-Token wird so lange vor Ablauf erneuert. */
const GENESYS_REFRESH_MARGIN_MS = 2 * 60 * 1000;

/** Abhängigkeiten nach außen (KMS, Genesys); Tests ersetzen sie. */
export interface GenesysSessionDeps {
  store: OAuthStore;
  decryptTokens(session: { tenantId: string; sessionId: string; genesysTokensEnc: string }): Promise<GenesysSessionTokens>;
  encryptTokens(tenantId: string, sessionId: string, tokens: GenesysSessionTokens): Promise<string>;
  /** Secret des Genesys-Clients (entschlüsselt); `undefined`, wenn keins hinterlegt ist */
  clientSecret(tenant: McpTenant): Promise<string | undefined>;
  refresh(region: string, client: { clientId: string; clientSecret?: string }, refreshToken: string, now: number): Promise<GenesysTokenResult>;
}

export const kmsGenesysDeps = (store: OAuthStore): GenesysSessionDeps => ({
  store,
  decryptTokens: (session) => decryptGenesysTokens(session.tenantId, session.sessionId, session.genesysTokensEnc),
  encryptTokens: encryptGenesysTokens,
  clientSecret: async (tenant) => (tenant.clientSecretEnc ? decryptClientSecret(tenant.tenantId, tenant.clientSecretEnc) : undefined),
  refresh: refreshGenesysToken,
});

export type GenesysAccess =
  | { ok: true; accessToken: string; session: SessionRecord }
  /** `session_dead`: Genesys lehnt ab oder kein Refresh möglich, neue Anmeldung nötig; `upstream`: vorübergehend */
  | { ok: false; reason: "session_dead" | "upstream" };

/**
 * Gültiges Genesys-Access-Token der Session, bei Bedarf per Refresh erneuert. Parallele Aufrufe: Genesys-Refresh-Tokens
 * gelten nur einmal; wer das Rennen verliert, nimmt die gespeicherten neuen Tokens des Gewinners.
 */
export async function ensureGenesysAccess(
  deps: GenesysSessionDeps,
  tenant: McpTenant,
  session: SessionRecord,
  now: number
): Promise<GenesysAccess> {
  const tokens = await deps.decryptTokens(session);
  if (session.genesysExpiresAt - GENESYS_REFRESH_MARGIN_MS > now) return { ok: true, accessToken: tokens.accessToken, session };
  const stillValid = session.genesysExpiresAt > now;
  const secret = tokens.refreshToken ? await deps.clientSecret(tenant) : undefined;
  if (!tokens.refreshToken || !secret) {
    return stillValid ? { ok: true, accessToken: tokens.accessToken, session } : { ok: false, reason: "session_dead" };
  }

  const result = await deps.refresh(session.region, { clientId: tenant.genesysClientId, clientSecret: secret }, tokens.refreshToken, now);
  if (result.ok) {
    const genesysTokensEnc = await deps.encryptTokens(session.tenantId, session.sessionId, {
      accessToken: result.tokens.accessToken,
      // Ohne neuen Refresh-Token in der Antwort gilt der alte weiter
      refreshToken: result.tokens.refreshToken ?? tokens.refreshToken,
    });
    const patch = { genesysTokensEnc, genesysExpiresAt: result.tokens.expiresAt };
    if (await deps.store.updateSessionGenesys(session.sessionId, session.genesysVersion, patch)) {
      return {
        ok: true,
        accessToken: result.tokens.accessToken,
        session: { ...session, ...patch, genesysVersion: session.genesysVersion + 1 },
      };
    }
    return useWinner(deps, session, now);
  }
  if (result.kind === "invalid_grant") return useWinner(deps, session, now);
  return stillValid ? { ok: true, accessToken: tokens.accessToken, session } : { ok: false, reason: "upstream" };
}

/** Ein paralleler Aufruf hat schon erneuert: dessen Tokens verwenden, sonst ist die Session tot. */
async function useWinner(deps: GenesysSessionDeps, session: SessionRecord, now: number): Promise<GenesysAccess> {
  const current = await deps.store.getSession(session.sessionId);
  if (!current || current.genesysVersion === session.genesysVersion || current.genesysExpiresAt <= now) {
    return { ok: false, reason: "session_dead" };
  }
  const tokens = await deps.decryptTokens(current);
  return { ok: true, accessToken: tokens.accessToken, session: current };
}

/** Widerruft das Genesys-Token einer gelöschten Session (nach Möglichkeit, Fehler werden nur geloggt). */
export async function revokeSessionGenesys(session: SessionRecord | undefined): Promise<void> {
  if (!session) return;
  try {
    const tokens = await decryptGenesysTokens(session.tenantId, session.sessionId, session.genesysTokensEnc);
    const revoked = await revokeGenesysToken(session.region, tokens.accessToken);
    if (!revoked) console.warn("[mcp] Genesys token not revoked", { tenantId: session.tenantId, sessionId: session.sessionId });
  } catch (err: any) {
    console.warn("[mcp] Genesys token revocation failed", { tenantId: session.tenantId, name: err?.name });
  }
}

export type RateCheck = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Feste Fenster pro Minute und Session (vorläufiger Wert, M11 legt ihn fest). */
export async function checkSessionRate(store: OAuthStore, session: SessionRecord, now: number): Promise<RateCheck> {
  const minute = Math.floor(now / 60000);
  const count = await store.incrementRate(session.tenantId, session.sessionId, String(minute), (minute + 2) * 60000);
  if (count <= SESSION_RATE_LIMIT_PER_MINUTE) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(((minute + 1) * 60000 - now) / 1000)) };
}

/** Identität und Zugang eines geprüften MCP-Aufrufs, weitergereicht an die Tools (`tool_handlers.ts`). */
export interface McpCallContext {
  tenant: McpTenant;
  session: SessionRecord;
  userId: string;
  userName: string;
  genesysAccessToken: string;
}

export type McpAuthResult =
  | { ok: true; context: McpCallContext }
  | { ok: false; kind: "unauthorized"; error?: "invalid_token" }
  | { ok: false; kind: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; kind: "upstream" };

/** Schritte 4 bis 6 der Prüfkette für einen Aufruf mit Bearer-Token. */
export async function authenticateMcpCall(
  deps: GenesysSessionDeps,
  tenant: McpTenant,
  tokenTenant: TokenTenant,
  bearer: string,
  now: number
): Promise<McpAuthResult> {
  const check = await verifyAccessToken(deps.store, tokenTenant, bearer, now);
  if (!check.ok) return check.reason === "missing" ? { ok: false, kind: "unauthorized" } : { ok: false, kind: "unauthorized", error: "invalid_token" };

  const access = await ensureGenesysAccess(deps, tenant, check.session, now);
  if (!access.ok) {
    if (access.reason === "upstream") return { ok: false, kind: "upstream" };
    // Genesys-Sitzung ist weg: die MCP-Session auch, der Client muss sich neu anmelden
    await deps.store.deleteSession(check.session.sessionId);
    return { ok: false, kind: "unauthorized", error: "invalid_token" };
  }
  const rate = await checkSessionRate(deps.store, access.session, now);
  if (!rate.ok) return { ok: false, kind: "rate_limited", retryAfterSeconds: rate.retryAfterSeconds };
  return {
    ok: true,
    context: {
      tenant,
      session: access.session,
      userId: access.session.userId,
      userName: access.session.userName,
      genesysAccessToken: access.accessToken,
    },
  };
}
