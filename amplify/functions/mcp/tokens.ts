import {
  ACCESS_TOKEN_TTL_SECONDS,
  hashToken,
  isOpaqueToken,
  matchesResource,
  randomToken,
  REFRESH_TOKEN_TTL_SECONDS,
  safeEqual,
  verifyPkce,
} from "./oauth";
import type { OAuthStore, SessionRecord, TokenKind, TokenRecord } from "./oauth_store";

/**
 * Tokens der OAuth-Fassade (`documentation/polly_mcp.md`, Abschnitt 3, Schritt 7): opake 256-bit-Werte, gespeichert
 * nur als SHA-256. Refresh-Tokens rotieren; wird ein eingelöstes Refresh-Token oder ein eingelöster Code erneut
 * vorgelegt, wird die ganze Familie widerrufen. Familie = Session: Jedes Token verweist auf seine Session, und ohne
 * Session ist kein Token mehr gültig. Rein bis auf den Store (getestet in `test/mcpOAuth.test.ts`).
 */

/** Mandant aus dem URL-Schlüssel, so weit die Token-Prüfung ihn braucht. */
export interface TokenTenant {
  tenantId: string;
  mcpTenantKey: string;
  epoch: number;
  mcpUrl: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
}

/** Fehler nach RFC 6749, 5.2. `revokedSession`: dabei widerrufene Session, deren Genesys-Token der Aufrufer widerruft. */
export interface TokenError {
  status: 400 | 401;
  error: "invalid_request" | "invalid_client" | "invalid_grant" | "invalid_target";
  description: string;
  revokedSession?: SessionRecord;
}

export type TokenResult = { ok: true; response: TokenResponse; session: SessionRecord } | { ok: false; error: TokenError };

function tokenError(error: TokenError["error"], description: string, revokedSession?: SessionRecord): { ok: false; error: TokenError } {
  return { ok: false, error: { status: error === "invalid_client" ? 401 : 400, error, description, revokedSession } };
}

/** Session gehört zum Mandanten, hat dessen aktuelle Epoch und ist nicht abgelaufen. */
export function isSessionValid(session: SessionRecord | undefined, tenant: TokenTenant, now: number): session is SessionRecord {
  return Boolean(
    session &&
      session.tenantId === tenant.tenantId &&
      session.mcpTenantKey === tenant.mcpTenantKey &&
      session.epoch === tenant.epoch &&
      session.expiresAt > now
  );
}

/** Widerruft die Familie: Session löschen. Gibt die gelöschte Session zurück (für den Widerruf bei Genesys). */
export async function revokeFamily(store: OAuthStore, sessionId: string): Promise<SessionRecord | undefined> {
  return store.deleteSession(sessionId);
}

/** Neues Paar aus Access- und Refresh-Token. Das Refresh-Token reicht nie über das Ende der Session hinaus. */
export async function issueTokenPair(
  store: OAuthStore,
  session: SessionRecord,
  clientId: string,
  resource: string,
  now: number
): Promise<TokenResponse> {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const base = { tenantId: session.tenantId, sessionId: session.sessionId, clientId, resource };
  await store.putToken({ ...base, kind: "AT", tokenHash: hashToken(accessToken), expiresAt: now + ACCESS_TOKEN_TTL_SECONDS * 1000 });
  await store.putToken({
    ...base,
    kind: "RT",
    tokenHash: hashToken(refreshToken),
    expiresAt: Math.min(now + REFRESH_TOKEN_TTL_SECONDS * 1000, session.expiresAt),
  });
  return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refreshToken };
}

/**
 * `grant_type=authorization_code`: Code einmalig, PKCE, `client_id`, `redirect_uri` und `resource` wie in der Anfrage.
 * Wird ein schon eingelöster Code erneut vorgelegt, wird die daraus entstandene Session widerrufen (RFC 9700, 4.2.1).
 */
export async function redeemAuthorizationCode(
  store: OAuthStore,
  tenant: TokenTenant,
  params: { clientId: string; code?: string; redirectUri?: string; codeVerifier?: string; resource?: string },
  now: number
): Promise<TokenResult> {
  if (!isOpaqueToken(params.code)) return tokenError("invalid_grant", "Invalid authorization code");
  if (params.resource !== undefined && !matchesResource(params.resource, tenant.mcpUrl)) {
    return tokenError("invalid_target", "resource must be the MCP URL of this installation");
  }
  const codeHash = hashToken(params.code);
  const code = await store.getCode(codeHash);
  if (!code || code.tenantId !== tenant.tenantId) return tokenError("invalid_grant", "Invalid authorization code");
  if (code.usedAt !== undefined) {
    const revoked = await revokeFamily(store, code.sessionId);
    return tokenError("invalid_grant", "Authorization code already used", revoked);
  }
  if (code.expiresAt <= now) return tokenError("invalid_grant", "Authorization code expired");
  if (!safeEqual(code.clientId, params.clientId)) return tokenError("invalid_grant", "Code was issued to another client");
  if (params.redirectUri !== code.redirectUri) return tokenError("invalid_grant", "redirect_uri does not match");
  if (!verifyPkce(params.codeVerifier, code.codeChallenge)) return tokenError("invalid_grant", "PKCE verification failed");

  if (!(await store.consumeCode(codeHash, now))) {
    // Parallel eingelöst: wie Wiederverwendung behandeln
    const revoked = await revokeFamily(store, code.sessionId);
    return tokenError("invalid_grant", "Authorization code already used", revoked);
  }
  const session = await store.getSession(code.sessionId);
  if (!isSessionValid(session, tenant, now)) return tokenError("invalid_grant", "Session no longer valid");
  return { ok: true, response: await issueTokenPair(store, session, code.clientId, code.resource, now), session };
}

/**
 * `grant_type=refresh_token` mit Rotation. Ein schon eingelöstes Refresh-Token widerruft die ganze Familie.
 * `checkSession` prüft vor der Ausgabe zusätzlich die Session (z. B. Genesys-Refresh); `false` widerruft sie.
 */
export async function rotateRefreshToken(
  store: OAuthStore,
  tenant: TokenTenant,
  params: { clientId: string; refreshToken?: string; resource?: string },
  now: number,
  checkSession?: (session: SessionRecord) => Promise<boolean>
): Promise<TokenResult> {
  if (!isOpaqueToken(params.refreshToken)) return tokenError("invalid_grant", "Invalid refresh token");
  if (params.resource !== undefined && !matchesResource(params.resource, tenant.mcpUrl)) {
    return tokenError("invalid_target", "resource must be the MCP URL of this installation");
  }
  const tokenHash = hashToken(params.refreshToken);
  const token = await store.getToken("RT", tokenHash);
  if (!token || token.tenantId !== tenant.tenantId) return tokenError("invalid_grant", "Invalid refresh token");
  if (!safeEqual(token.clientId, params.clientId)) return tokenError("invalid_grant", "Token was issued to another client");
  if (token.usedAt !== undefined || !(await store.consumeToken("RT", tokenHash, now))) {
    const revoked = await revokeFamily(store, token.sessionId);
    return tokenError("invalid_grant", "Refresh token already used", revoked);
  }
  if (token.expiresAt <= now) return tokenError("invalid_grant", "Refresh token expired");
  const session = await store.getSession(token.sessionId);
  if (!isSessionValid(session, tenant, now)) return tokenError("invalid_grant", "Session no longer valid");
  if (checkSession && !(await checkSession(session))) {
    const revoked = await revokeFamily(store, session.sessionId);
    return tokenError("invalid_grant", "Session no longer valid", revoked);
  }
  return { ok: true, response: await issueTokenPair(store, session, token.clientId, token.resource, now), session };
}

/**
 * Widerruf (RFC 7009). Ein Refresh-Token widerruft die ganze Familie, ein Access-Token nur sich selbst. Tokens
 * anderer Clients oder Mandanten bleiben unberührt; die Antwort ist immer gleich (200).
 */
export async function revokeToken(
  store: OAuthStore,
  tenantId: string,
  params: { clientId: string; token?: string; hint?: string }
): Promise<{ revokedSession?: SessionRecord }> {
  if (!isOpaqueToken(params.token)) return {};
  const tokenHash = hashToken(params.token);
  const order: TokenKind[] = params.hint === "access_token" ? ["AT", "RT"] : ["RT", "AT"];
  for (const kind of order) {
    const token = await store.getToken(kind, tokenHash);
    if (!token) continue;
    if (token.tenantId !== tenantId || !safeEqual(token.clientId, params.clientId)) return {};
    if (kind === "AT") {
      await store.deleteToken("AT", tokenHash);
      return {};
    }
    return { revokedSession: await revokeFamily(store, token.sessionId) };
  }
  return {};
}

export type AccessTokenCheck =
  | { ok: true; token: TokenRecord; session: SessionRecord }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "session" };

/** Prüfkette Schritte 4 und 5 (ohne Genesys): Access-Token, Mandant, `resource`, Session mit aktueller Epoch. */
export async function verifyAccessToken(
  store: OAuthStore,
  tenant: TokenTenant,
  bearer: string,
  now: number
): Promise<AccessTokenCheck> {
  if (!bearer) return { ok: false, reason: "missing" };
  if (!isOpaqueToken(bearer)) return { ok: false, reason: "invalid" };
  const token = await store.getToken("AT", hashToken(bearer));
  if (!token || token.tenantId !== tenant.tenantId || !matchesResource(token.resource, tenant.mcpUrl)) {
    return { ok: false, reason: "invalid" };
  }
  if (token.expiresAt <= now) return { ok: false, reason: "expired" };
  const session = await store.getSession(token.sessionId);
  if (!isSessionValid(session, tenant, now)) return { ok: false, reason: "session" };
  return { ok: true, token, session };
}
