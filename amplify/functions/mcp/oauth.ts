import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { buildGenesysRedirectUri, buildMcpUrl } from "../shared/mcp_config";

/**
 * Reine Teile der OAuth-Fassade (ohne AWS-SDK, getestet in `test/mcpOAuth.test.ts`): Lebensdauern, Zufallswerte und
 * Hashes, PKCE, Metadaten, Prüfung von DCR und Autorisierungsanfrage. Ablauf: `documentation/polly_mcp.md`, Abschnitt 3.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Höchstdauer einer Session ab Anmeldung; Refresh-Tokens reichen nie darüber hinaus. */
export const SESSION_MAX_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_REQUEST_TTL_SECONDS = 10 * 60;
export const AUTH_CODE_TTL_SECONDS = 2 * 60;
/** DCR-Clients verfallen 90 Tage nach der letzten Nutzung. */
export const CLIENT_IDLE_TTL_SECONDS = 90 * 24 * 60 * 60;
/** Ein Client, der noch nie ein Token bekommen hat, verfällt nach einem Tag (sonst belegen leere Registrierungen die Plätze). */
export const CLIENT_UNUSED_TTL_SECONDS = 24 * 60 * 60;
/** `lastUsedAt` eines Clients wird höchstens einmal am Tag geschrieben. */
export const CLIENT_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Gemerkte Zustimmung pro Person und Client; danach entfällt die Zustimmungsseite (Genesys-Login bleibt Pflicht). */
export const CONSENT_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Grenzwerte (M11): höchstens 200 nicht abgelaufene DCR-Clients je Mandant, 120 Tool-Aufrufe je Minute und Session. */
export const MAX_DCR_CLIENTS_PER_TENANT = 200;
export const SESSION_RATE_LIMIT_PER_MINUTE = 120;

export const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_CHARS = 2000;
const MAX_CLIENT_NAME_CHARS = 100;
const MAX_STATE_CHARS = 2048;

const TENANT_KEY = /^[A-Za-z0-9_-]{22}$/;
/** Opake Werte aus `randomToken` (256 bit, base64url). */
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636: Verifier 43–128 Zeichen aus dem unreservierten Zeichensatz. */
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
/** S256-Challenge: base64url eines SHA-256 ohne Padding. */
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Zufallswert mit 256 bit (base64url, 43 Zeichen) für Tokens, Codes, IDs und Nonces. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Schlüssel der gemerkten Zustimmung: Mandant, Person und Client; Hash, damit keine Klar-IDs im Schlüssel stehen. */
export function consentKey(tenantId: string, userId: string, clientId: string): string {
  return createHash("sha256").update(JSON.stringify([tenantId, userId, clientId])).digest("base64url");
}

interface ConsentFields {
  tenantId: string;
  clientId: string;
  redirectUris: string[];
  epoch: number;
  expiresAt: number;
}

/** Gemerkte Zustimmung gilt nur für Mandant, Client, eine der bestätigten Redirect-URIs und denselben Epoch (Abschalten widerruft sie). */
export function isConsentValid(
  consent: ConsentFields | undefined,
  current: { tenantId: string; clientId: string; redirectUri: string; epoch: number },
  now: number
): boolean {
  return (
    !!consent &&
    consent.expiresAt > now &&
    consent.tenantId === current.tenantId &&
    consent.clientId === current.clientId &&
    consent.epoch === current.epoch &&
    consent.redirectUris.includes(current.redirectUri)
  );
}

/**
 * Bestätigte Redirect-URIs nach einem „Zulassen“: bei gleichem Epoch die bisherigen plus die neue (höchstens
 * `MAX_REDIRECT_URIS`, so viele kann ein Client registrieren), sonst nur die neue. Die Frist beginnt neu.
 */
export function mergeConsentRedirects(existing: ConsentFields | undefined, redirectUri: string, epoch: number, now: number): string[] {
  const previous = existing && existing.epoch === epoch && existing.expiresAt > now ? existing.redirectUris : [];
  return [redirectUri, ...previous.filter((uri) => uri !== redirectUri)].slice(0, MAX_REDIRECT_URIS);
}

/** Tokens und Codes werden nur als SHA-256 gespeichert. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isTenantKey(value: unknown): value is string {
  return typeof value === "string" && TENANT_KEY.test(value);
}

export function isOpaqueToken(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_TOKEN.test(value);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** PKCE S256 (RFC 7636): Verifier im erlaubten Format und passend zur gespeicherten Challenge. */
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !CODE_VERIFIER.test(verifier)) return false;
  return safeEqual(pkceChallenge(verifier), challenge);
}

export interface McpUrls {
  /** MCP-Endpunkt und zugleich `resource` (RFC 8707) */
  mcpUrl: string;
  /** Issuer des Autorisierungsservers (= MCP-URL) */
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
  consentEndpoint: string;
  resourceMetadataUrl: string;
  /** Rückkehr von Genesys (`/callback`), muss am Genesys-Client eingetragen sein */
  genesysRedirectUri: string;
  /** Pfad für das Cookie, das die Anmeldung an den Browser bindet */
  cookiePath: string;
}

export function buildMcpUrls(publicBaseUrl: string, tenantKey: string): McpUrls {
  const base = publicBaseUrl.replace(/\/+$/, "");
  const mcpUrl = buildMcpUrl(base, tenantKey);
  const origin = new URL(base).origin;
  const mcpPath = new URL(mcpUrl).pathname;
  return {
    mcpUrl,
    issuer: mcpUrl,
    authorizationEndpoint: `${mcpUrl}/oauth/authorize`,
    tokenEndpoint: `${mcpUrl}/oauth/token`,
    registrationEndpoint: `${mcpUrl}/oauth/register`,
    revocationEndpoint: `${mcpUrl}/oauth/revoke`,
    consentEndpoint: `${mcpUrl}/oauth/consent`,
    // RFC 9728/8414: `.well-known` an der Wurzel, der Pfad der Ressource wird angehängt
    resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource${mcpPath}`,
    genesysRedirectUri: buildGenesysRedirectUri(base, tenantKey),
    cookiePath: `${mcpPath}/oauth`,
  };
}

/** Protected Resource Metadata (RFC 9728). */
export function buildProtectedResourceMetadata(urls: McpUrls): Record<string, unknown> {
  return {
    resource: urls.mcpUrl,
    authorization_servers: [urls.issuer],
    bearer_methods_supported: ["header"],
    resource_name: "Polly",
  };
}

/** Metadaten des Autorisierungsservers (RFC 8414): nur öffentliche Clients, PKCE S256, Code und Refresh. */
export function buildAuthorizationServerMetadata(urls: McpUrls): Record<string, unknown> {
  return {
    issuer: urls.issuer,
    authorization_endpoint: urls.authorizationEndpoint,
    token_endpoint: urls.tokenEndpoint,
    registration_endpoint: urls.registrationEndpoint,
    revocation_endpoint: urls.revocationEndpoint,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
  };
}

/** Nur `resource` = MCP-URL dieses Mandanten (ein Schrägstrich am Ende wird toleriert). */
export function matchesResource(value: unknown, mcpUrl: string): boolean {
  return typeof value === "string" && value.replace(/\/$/, "") === mcpUrl;
}

export type RedirectUriCheck = { ok: true; uri: string } | { ok: false; reason: string };

/**
 * Redirect-URI eines MCP-Clients: `https` mit Ursprung und Pfad exakt aus der Allow-List (`parseAllowedRedirectUris`,
 * ohne Port und ohne Wildcards) oder Loopback (RFC 8252, `http` oder `https`, beliebiger Port). Nie Fragment,
 * Zugangsdaten oder Wildcards.
 */
export function checkRedirectUri(raw: unknown, allowedUris: readonly string[]): RedirectUriCheck {
  if (typeof raw !== "string" || !raw || raw.length > MAX_REDIRECT_URI_CHARS) return { ok: false, reason: "invalid" };
  if (raw.includes("*")) return { ok: false, reason: "wildcard" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.hash || raw.includes("#")) return { ok: false, reason: "fragment" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  const host = url.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme" };
    return { ok: true, uri: raw };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (url.port) return { ok: false, reason: "port" };
  if (!allowedUris.includes(url.origin + url.pathname)) return { ok: false, reason: "not_allowed" };
  return { ok: true, uri: raw };
}

export function isLoopbackRedirect(uri: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(uri).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Anzeigename des Clients: selbst angegeben, deshalb ohne Steuerzeichen und gekürzt. */
export function sanitizeClientName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, MAX_CLIENT_NAME_CHARS);
}

export interface ClientRegistration {
  redirectUris: string[];
  clientName: string;
}

export type ClientRegistrationResult =
  | { ok: true; registration: ClientRegistration }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string };

/** Dynamic Client Registration (RFC 7591): nur öffentliche Clients mit Code-Grant. Unbekannte Felder werden ignoriert. */
export function parseClientRegistration(body: unknown, allowedUris: readonly string[]): ClientRegistrationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_client_metadata", description: "Body must be a JSON object" };
  }
  const record = body as Record<string, unknown>;
  const uris = record.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    return { ok: false, error: "invalid_redirect_uri", description: `redirect_uris must contain 1 to ${MAX_REDIRECT_URIS} entries` };
  }
  const redirectUris: string[] = [];
  for (const uri of uris) {
    const check = checkRedirectUri(uri, allowedUris);
    if (!check.ok) return { ok: false, error: "invalid_redirect_uri", description: `redirect_uri not allowed (${check.reason})` };
    if (!redirectUris.includes(check.uri)) redirectUris.push(check.uri);
  }
  if (record.token_endpoint_auth_method !== undefined && record.token_endpoint_auth_method !== "none") {
    return { ok: false, error: "invalid_client_metadata", description: "Only public clients (token_endpoint_auth_method none) are supported" };
  }
  const grantTypes = record.grant_types;
  if (grantTypes !== undefined) {
    const allowed = ["authorization_code", "refresh_token"];
    if (!Array.isArray(grantTypes) || grantTypes.some((grant) => !allowed.includes(grant as string))) {
      return { ok: false, error: "invalid_client_metadata", description: "grant_types must be authorization_code and/or refresh_token" };
    }
  }
  const responseTypes = record.response_types;
  if (responseTypes !== undefined && (!Array.isArray(responseTypes) || responseTypes.some((type) => type !== "code"))) {
    return { ok: false, error: "invalid_client_metadata", description: "response_types must be code" };
  }
  return { ok: true, registration: { redirectUris, clientName: sanitizeClientName(record.client_name) } };
}

/**
 * Parameter aus Query-String oder Form-Body. Mehrfach angegebene Parameter sind ungültig (RFC 6749, 3.1/3.2),
 * dann `null`.
 */
export function parseParams(raw: string): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    if (Object.prototype.hasOwnProperty.call(params, key)) return null;
    params[key] = value;
  }
  return params;
}

/** Hängt Parameter an eine Redirect-URI an; deren eigener Query-String bleibt erhalten. */
export function buildRedirect(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

export interface RegisteredClient {
  clientId: string;
  tenantId: string;
  mcpTenantKey: string;
  redirectUris: string[];
}

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  resource: string;
}

export type AuthorizeCheck =
  /** Fehler vor der geprüften Redirect-URI: nur als Seite anzeigen, nie umleiten */
  | { kind: "page"; description: string }
  /** Fehler nach der Prüfung: zurück zum Client mit `error` */
  | { kind: "redirect"; redirectUri: string; state?: string; error: string; description: string }
  | { kind: "ok"; request: AuthorizeRequest };

/**
 * Prüft die Autorisierungsanfrage. `client` ist der zur `client_id` gespeicherte DCR-Client (oder `undefined`);
 * er muss an diesen Mandanten-Schlüssel gebunden sein, die `redirect_uri` exakt einer registrierten entsprechen.
 */
export function checkAuthorizeRequest(
  params: Record<string, string> | null,
  client: RegisteredClient | undefined,
  tenant: { tenantId: string; mcpTenantKey: string },
  mcpUrl: string
): AuthorizeCheck {
  if (!params) return { kind: "page", description: "Duplicate request parameters" };
  if (!params.client_id || !client || client.tenantId !== tenant.tenantId || client.mcpTenantKey !== tenant.mcpTenantKey) {
    return { kind: "page", description: "Unknown client" };
  }
  const redirectUri = params.redirect_uri;
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { kind: "page", description: "redirect_uri does not match the registration" };
  }
  const state = params.state || undefined;
  if (state !== undefined && state.length > MAX_STATE_CHARS) {
    return { kind: "page", description: "state too long" };
  }
  const fail = (error: string, description: string): AuthorizeCheck => ({ kind: "redirect", redirectUri, state, error, description });
  if (params.response_type !== "code") return fail("unsupported_response_type", "Only response_type code is supported");
  if (params.code_challenge_method !== "S256" || !CODE_CHALLENGE.test(params.code_challenge ?? "")) {
    return fail("invalid_request", "PKCE with code_challenge_method S256 is required");
  }
  if (!matchesResource(params.resource, mcpUrl)) return fail("invalid_target", "resource must be the MCP URL of this installation");
  return {
    kind: "ok",
    request: { clientId: client.clientId, redirectUri, state, codeChallenge: params.code_challenge, resource: mcpUrl },
  };
}

/** Client-ID am Token- und Revoke-Endpunkt: aus dem Body, sonst aus HTTP Basic (manche Clients senden sie dort). */
export function pickClientId(params: Record<string, string>, authorizationHeader: unknown): string {
  if (params.client_id) return params.client_id;
  if (typeof authorizationHeader !== "string" || !authorizationHeader.toLowerCase().startsWith("basic ")) return "";
  const decoded = Buffer.from(authorizationHeader.slice(6).trim(), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const user = separator >= 0 ? decoded.slice(0, separator) : decoded;
  try {
    return decodeURIComponent(user);
  } catch {
    return user;
  }
}

/**
 * Lebensdauer eines Clients verlängern? Bei der ersten Token-Ausgabe immer (er läuft dann noch mit der kurzen Frist
 * für unbenutzte Clients), danach höchstens einmal am Tag.
 */
export function needsClientTouch(client: { expiresAt: number }, now: number): boolean {
  return client.expiresAt - now < CLIENT_IDLE_TTL_SECONDS * 1000 - CLIENT_TOUCH_INTERVAL_MS;
}

/** Cookie, das die Anmeldung an den Browser bindet, der `/authorize` aufgerufen hat. */
export const BROWSER_COOKIE = "polly_mcp_auth";

export function readCookie(cookies: unknown, name: string): string | undefined {
  const list: string[] = Array.isArray(cookies) ? cookies.map(String) : typeof cookies === "string" ? cookies.split(";") : [];
  for (const entry of list) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) return entry.slice(separator + 1).trim();
  }
  return undefined;
}

export function buildBrowserCookie(value: string, path: string): string {
  return `${BROWSER_COOKIE}=${value}; Path=${path}; Max-Age=${AUTH_REQUEST_TTL_SECONDS}; Secure; HttpOnly; SameSite=Lax`;
}
