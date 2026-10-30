import {
  POLLY_ROLE_DEPLOY,
  POLLY_ROLE_REPORTING,
  POLLY_ROLE_WRITE,
} from "../../../src/constants/permissionConstants";
import { hasPollyRole } from "../../../src/domain/permissions/roleCheck";
import { loadCallerRoles, loadInstallationProjectTag } from "../shared/caller_roles";
import { readRequestBody } from "../shared/http";
import { isMcpEnabled, parseAllowedRedirectUris } from "../shared/mcp_config";
import { exchangeGenesysCode, loadGenesysTokenInfo, revokeGenesysToken } from "../shared/mcp_genesys";
import { decryptClientSecret, decryptGenesysTokens, encryptGenesysTokens } from "../shared/mcp_secret";
import { getAuthorizationToken, type TenantCredentials } from "../shared/tenant_auth";
import {
  AUTH_CODE_TTL_SECONDS,
  AUTH_REQUEST_TTL_SECONDS,
  BROWSER_COOKIE,
  buildAuthorizationServerMetadata,
  buildBrowserCookie,
  buildMcpUrls,
  buildProtectedResourceMetadata,
  buildRedirect,
  checkAuthorizeRequest,
  CLIENT_IDLE_TTL_SECONDS,
  CLIENT_UNUSED_TTL_SECONDS,
  hashToken,
  isOpaqueToken,
  MAX_DCR_CLIENTS_PER_TENANT,
  needsClientTouch,
  parseClientRegistration,
  parseParams,
  pickClientId,
  pkceChallenge,
  randomToken,
  readCookie,
  safeEqual,
  SESSION_MAX_SECONDS,
  type McpUrls,
} from "./oauth";
import { pageHeaders, pickLang, renderConsentPage, renderErrorPage, type PageErrorKey, type PageLang } from "./oauth_pages";
import { createDynamoOAuthStore, type AuthRequestRecord, type AuthRequestStatus, type ClientRecord } from "./oauth_store";
import { authenticateMcpCall, ensureGenesysAccess, kmsGenesysDeps, revokeSessionGenesys } from "./session";
import { resolveMcpTenant, type McpTenant } from "./tenant";
import { redeemAuthorizationCode, revokeToken, rotateRefreshToken, type TokenTenant } from "./tokens";

/**
 * Lambda `mcp`: OAuth-Fassade (M7) und MCP-Endpunkt (M8). Ablauf und Prüfkette: `documentation/polly_mcp.md`,
 * Abschnitte 2 und 3. Kill-Switch, unbekannter Schlüssel, MCP aus (egal auf welcher Ebene) und Mandant nicht
 * `APPROVED` ergeben auf allen Routen dieselbe 404. Tokens, Codes und Secrets stehen nie im Log.
 */

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string; cookies?: string[] };

const store = createDynamoOAuthStore();
const genesysDeps = kmsGenesysDeps(store);

const MCP_PUBLIC_BASE_URL = (process.env.MCP_PUBLIC_BASE_URL ?? "").trim();
const ALLOWED_REDIRECT_URIS = parseAllowedRedirectUris(process.env.MCP_ALLOWED_REDIRECT_URIS);

const REGISTER_MAX_BODY_BYTES = 16 * 1024;
const TOKEN_MAX_BODY_BYTES = 8 * 1024;
const CONSENT_MAX_BODY_BYTES = 4 * 1024;
const POLLY_ROLES = [POLLY_ROLE_WRITE, POLLY_ROLE_DEPLOY, POLLY_ROLE_REPORTING];

function jsonResponse(statusCode: number, body: unknown, headers: Record<string, string> = {}): AnyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...headers },
    body: body === undefined ? "" : JSON.stringify(body),
  };
}

function oauthError(statusCode: number, error: string, description: string): AnyResult {
  return jsonResponse(statusCode, { error, error_description: description });
}

function notFound(): AnyResult {
  return jsonResponse(404, { error: "not_found" });
}

function redirect(location: string, statusCode = 302, cookies?: string[]): AnyResult {
  return { statusCode, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }, body: "", cookies };
}

function errorPage(statusCode: number, lang: PageLang, key: PageErrorKey): AnyResult {
  return { statusCode, headers: pageHeaders(), body: renderErrorPage(lang, key) };
}

interface RouteContext {
  event: AnyApiGwEvent;
  tenant: McpTenant;
  credentials: TenantCredentials;
  urls: McpUrls;
  tokenTenant: TokenTenant;
  lang: PageLang;
  now: number;
}

type Route = { html: boolean; handle: (ctx: RouteContext) => Promise<AnyResult> };

function header(event: AnyApiGwEvent, name: string): string | undefined {
  const value = event?.headers?.[name];
  return typeof value === "string" ? value : undefined;
}

/** DCR-Client, der an diesen Mandanten-Schlüssel gebunden und nicht abgelaufen ist. */
async function loadBoundClient(clientId: string, ctx: RouteContext): Promise<ClientRecord | undefined> {
  if (!isOpaqueToken(clientId)) return undefined;
  const client = await store.getClient(clientId);
  if (!client || client.tenantId !== ctx.tenant.tenantId || client.mcpTenantKey !== ctx.tenant.mcpTenantKey) return undefined;
  return client.expiresAt > ctx.now ? client : undefined;
}

/**
 * Anmeldeanfrage im erwarteten Zustand, für diesen Mandanten, nicht abgelaufen und aus demselben Browser
 * (Cookie aus `/authorize`). Sonst `undefined`.
 */
async function loadAuthRequest(id: unknown, status: AuthRequestStatus, ctx: RouteContext): Promise<AuthRequestRecord | undefined> {
  if (!isOpaqueToken(id)) return undefined;
  const request = await store.getAuthRequest(id);
  if (!request || request.status !== status || request.expiresAt <= ctx.now) return undefined;
  if (request.tenantId !== ctx.tenant.tenantId || request.mcpTenantKey !== ctx.tenant.mcpTenantKey) return undefined;
  const browser = readCookie(ctx.event?.cookies ?? header(ctx.event, "cookie"), BROWSER_COOKIE);
  if (!browser || !safeEqual(hashToken(browser), request.browserHash)) return undefined;
  return request;
}

async function revokeRequestGenesys(request: AuthRequestRecord, region: string): Promise<void> {
  if (!request.genesysTokensEnc || !request.sessionId) return;
  try {
    const tokens = await decryptGenesysTokens(request.tenantId, request.sessionId, request.genesysTokensEnc);
    await revokeGenesysToken(region, tokens.accessToken);
  } catch (err: any) {
    console.warn("[mcp] Genesys token revocation failed", { tenantId: request.tenantId, name: err?.name });
  }
}

function clientErrorRedirect(request: Pick<AuthRequestRecord, "redirectUri" | "state">, urls: McpUrls, error: string): AnyResult {
  return redirect(buildRedirect(request.redirectUri, { error, state: request.state, iss: urls.issuer }), 303);
}

// --- Metadaten ---------------------------------------------------------------------------------------------------

async function protectedResourceMetadata(ctx: RouteContext): Promise<AnyResult> {
  return jsonResponse(200, buildProtectedResourceMetadata(ctx.urls));
}

async function authorizationServerMetadata(ctx: RouteContext): Promise<AnyResult> {
  return jsonResponse(200, buildAuthorizationServerMetadata(ctx.urls));
}

// --- DCR ---------------------------------------------------------------------------------------------------------

async function register(ctx: RouteContext): Promise<AnyResult> {
  const body = readRequestBody(ctx.event, REGISTER_MAX_BODY_BYTES);
  if (!body.ok) return oauthError(413, "invalid_client_metadata", "Request body too large");
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return oauthError(400, "invalid_client_metadata", "Body must be JSON");
  }
  const parsed = parseClientRegistration(json, ALLOWED_REDIRECT_URIS);
  if (!parsed.ok) return oauthError(400, parsed.error, parsed.description);
  if ((await store.countClients(ctx.tenant.tenantId, ctx.now)) >= MAX_DCR_CLIENTS_PER_TENANT) {
    console.warn("[mcp] client limit reached", { tenantId: ctx.tenant.tenantId });
    return oauthError(400, "invalid_client_metadata", "Client limit of this installation reached");
  }
  const client: ClientRecord = {
    clientId: randomToken(),
    tenantId: ctx.tenant.tenantId,
    mcpTenantKey: ctx.tenant.mcpTenantKey,
    redirectUris: parsed.registration.redirectUris,
    clientName: parsed.registration.clientName,
    createdAt: ctx.now,
    lastUsedAt: ctx.now,
    // Volle Lebensdauer erst mit dem ersten Token (`needsClientTouch`)
    expiresAt: ctx.now + CLIENT_UNUSED_TTL_SECONDS * 1000,
  };
  await store.putClient(client);
  console.log("[mcp] client registered", { tenantId: ctx.tenant.tenantId, clientId: client.clientId });
  return jsonResponse(201, {
    client_id: client.clientId,
    client_id_issued_at: Math.floor(ctx.now / 1000),
    client_name: client.clientName || undefined,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}

// --- Anmeldung im Browser ----------------------------------------------------------------------------------------

async function authorize(ctx: RouteContext): Promise<AnyResult> {
  const params = parseParams(ctx.event?.rawQueryString ?? "");
  const client = params?.client_id ? await loadBoundClient(params.client_id, ctx) : undefined;
  const check = checkAuthorizeRequest(params, client, ctx.tenant, ctx.urls.mcpUrl);
  // Vor der geprüften redirect_uri nie umleiten
  if (check.kind === "page") return errorPage(400, ctx.lang, "invalid_request");
  if (check.kind === "redirect") {
    return redirect(
      buildRedirect(check.redirectUri, { error: check.error, error_description: check.description, state: check.state, iss: ctx.urls.issuer })
    );
  }

  // Bindet die Anmeldung an diesen Browser: Callback und Zustimmung verlangen dasselbe Cookie. Immer ein neuer Wert,
  // nie ein mitgeschicktes Cookie übernehmen (sonst reicht ein untergeschobenes Cookie, um die Anmeldung zu teilen)
  const browser = randomToken();
  const id = randomToken();
  const genesysVerifier = randomToken();
  await store.putAuthRequest({
    id,
    tenantId: ctx.tenant.tenantId,
    mcpTenantKey: ctx.tenant.mcpTenantKey,
    ...check.request,
    browserHash: hashToken(browser),
    genesysVerifier,
    status: "pending",
    expiresAt: ctx.now + AUTH_REQUEST_TTL_SECONDS * 1000,
  });
  const genesysAuthorize = new URL(`https://login.${ctx.tenant.region}/oauth/authorize`);
  genesysAuthorize.search = new URLSearchParams({
    client_id: ctx.tenant.genesysClientId,
    response_type: "code",
    redirect_uri: ctx.urls.genesysRedirectUri,
    state: id,
    code_challenge: pkceChallenge(genesysVerifier),
    code_challenge_method: "S256",
  }).toString();
  return redirect(genesysAuthorize.toString(), 302, [buildBrowserCookie(browser, ctx.urls.cookiePath)]);
}

async function callback(ctx: RouteContext): Promise<AnyResult> {
  const { tenant, urls, lang, now } = ctx;
  const params = parseParams(ctx.event?.rawQueryString ?? "");
  const request = params ? await loadAuthRequest(params.state, "pending", ctx) : undefined;
  if (!request) return errorPage(400, lang, "expired");

  if (params?.error || !params?.code) {
    // Abbruch oder Fehler bei Genesys: zurück an den Client (die redirect_uri ist geprüft)
    if (await store.transitionAuthRequest(request.id, "pending", "consumed")) await store.deleteAuthRequest(request.id);
    return clientErrorRedirect(request, urls, "access_denied");
  }

  const clientSecret = tenant.clientSecretEnc ? await decryptClientSecret(tenant.tenantId, tenant.clientSecretEnc) : undefined;
  const exchange = await exchangeGenesysCode(
    tenant.region,
    { clientId: tenant.genesysClientId, clientSecret },
    { code: params.code, redirectUri: urls.genesysRedirectUri, codeVerifier: request.genesysVerifier },
    now
  );
  if (!exchange.ok) {
    console.warn("[mcp] Genesys code exchange failed", { tenantId: tenant.tenantId, kind: exchange.kind, status: exchange.status });
    return errorPage(502, lang, "genesys_error");
  }
  const genesys = exchange.tokens;
  const reject = async (statusCode: number, key: PageErrorKey): Promise<AnyResult> => {
    await revokeGenesysToken(tenant.region, genesys.accessToken);
    return errorPage(statusCode, lang, key);
  };

  // Token muss vom Genesys-Client dieser Installation und aus deren Org stammen
  const info = await loadGenesysTokenInfo(tenant.region, genesys.accessToken);
  if (!info.ok) {
    console.warn("[mcp] Genesys token info unavailable", { tenantId: tenant.tenantId, status: info.status });
    return reject(502, "genesys_error");
  }
  if (info.clientId !== tenant.genesysClientId || info.orgId !== tenant.genesysOrgId) {
    console.warn("[mcp] Genesys token of another client or org rejected", { tenantId: tenant.tenantId });
    return reject(403, "wrong_org");
  }

  const [caller, projectTag] = await Promise.all([
    loadCallerRoles(tenant.region, genesys.accessToken),
    loadInstallationProjectTag(tenant.tenantId, ctx.credentials),
  ]);
  if (caller.status !== "ok" || !caller.userId || !projectTag.ok) {
    console.warn("[mcp] cannot load roles", { tenantId: tenant.tenantId, status: caller.status });
    return reject(502, "genesys_error");
  }
  if (!POLLY_ROLES.some((role) => hasPollyRole(caller.roles, role, projectTag.projectTag))) {
    console.warn("[mcp] sign-in without Polly role rejected", { tenantId: tenant.tenantId, userId: caller.userId });
    return reject(403, "no_role");
  }

  const sessionId = randomToken();
  const genesysTokensEnc = await encryptGenesysTokens(tenant.tenantId, sessionId, {
    accessToken: genesys.accessToken,
    refreshToken: genesys.refreshToken,
  });
  const authenticated = await store.transitionAuthRequest(request.id, "pending", "authenticated", {
    sessionId,
    userId: caller.userId,
    userName: caller.userName ?? "",
    genesysTokensEnc,
    genesysExpiresAt: genesys.expiresAt,
    csrfNonce: randomToken(),
  });
  if (!authenticated) return reject(400, "expired");
  return redirect(`${urls.consentEndpoint}?${new URLSearchParams({ request: request.id })}`, 303);
}

async function consentPage(ctx: RouteContext): Promise<AnyResult> {
  const params = parseParams(ctx.event?.rawQueryString ?? "");
  const request = params ? await loadAuthRequest(params.request, "authenticated", ctx) : undefined;
  const client = request ? await loadBoundClient(request.clientId, ctx) : undefined;
  if (!request || !client || !request.csrfNonce) return errorPage(400, ctx.lang, "expired");
  return {
    statusCode: 200,
    headers: pageHeaders(new URL(request.redirectUri).origin),
    body: renderConsentPage(ctx.lang, {
      clientName: client.clientName,
      redirectUri: request.redirectUri,
      installation: ctx.tenant.tenantName || ctx.tenant.tenantId,
      userName: request.userName || request.userId || "",
      requestId: request.id,
      nonce: request.csrfNonce,
      action: ctx.urls.consentEndpoint,
    }),
  };
}

async function consentDecision(ctx: RouteContext): Promise<AnyResult> {
  const { tenant, urls, lang, now } = ctx;
  const body = readRequestBody(ctx.event, CONSENT_MAX_BODY_BYTES);
  const form = body.ok ? parseParams(body.text) : null;
  const request = form ? await loadAuthRequest(form.request, "authenticated", ctx) : undefined;
  if (!form || !request) return errorPage(400, lang, "expired");
  if (!request.csrfNonce || !form.nonce || !safeEqual(form.nonce, request.csrfNonce)) return errorPage(400, lang, "invalid_request");
  if (!request.sessionId || !request.userId || !request.genesysTokensEnc || request.genesysExpiresAt === undefined) {
    return errorPage(400, lang, "expired");
  }
  // Einmalig: ein zweites Absenden findet die Anfrage nicht mehr im Zustand „authenticated“
  if (!(await store.transitionAuthRequest(request.id, "authenticated", "consumed"))) return errorPage(400, lang, "expired");

  if (form.decision !== "allow") {
    await revokeRequestGenesys(request, tenant.region);
    await store.deleteAuthRequest(request.id);
    console.log("[mcp] consent denied", { tenantId: tenant.tenantId, clientId: request.clientId, userId: request.userId });
    return clientErrorRedirect(request, urls, "access_denied");
  }

  await store.putSession({
    sessionId: request.sessionId,
    tenantId: tenant.tenantId,
    mcpTenantKey: tenant.mcpTenantKey,
    epoch: tenant.epoch,
    clientId: request.clientId,
    userId: request.userId,
    userName: request.userName ?? "",
    region: tenant.region,
    genesysTokensEnc: request.genesysTokensEnc,
    genesysExpiresAt: request.genesysExpiresAt,
    genesysVersion: 0,
    createdAt: now,
    expiresAt: now + SESSION_MAX_SECONDS * 1000,
  });
  const code = randomToken();
  await store.putCode({
    codeHash: hashToken(code),
    tenantId: tenant.tenantId,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    sessionId: request.sessionId,
    expiresAt: now + AUTH_CODE_TTL_SECONDS * 1000,
  });
  await store.deleteAuthRequest(request.id);
  console.log("[mcp] session created", { tenantId: tenant.tenantId, clientId: request.clientId, userId: request.userId });
  return redirect(buildRedirect(request.redirectUri, { code, state: request.state, iss: urls.issuer }), 303);
}

// --- Token und Widerruf ------------------------------------------------------------------------------------------

function readForm(ctx: RouteContext): Record<string, string> | null {
  const body = readRequestBody(ctx.event, TOKEN_MAX_BODY_BYTES);
  return body.ok ? parseParams(body.text) : null;
}

async function token(ctx: RouteContext): Promise<AnyResult> {
  const { tenant, tokenTenant, now } = ctx;
  const params = readForm(ctx);
  if (!params) return oauthError(400, "invalid_request", "Malformed request");
  const client = await loadBoundClient(pickClientId(params, header(ctx.event, "authorization")), ctx);
  if (!client) return oauthError(401, "invalid_client", "Unknown client");

  let result;
  if (params.grant_type === "authorization_code") {
    result = await redeemAuthorizationCode(
      store,
      tokenTenant,
      { clientId: client.clientId, code: params.code, redirectUri: params.redirect_uri, codeVerifier: params.code_verifier, resource: params.resource },
      now
    );
  } else if (params.grant_type === "refresh_token") {
    result = await rotateRefreshToken(
      store,
      tokenTenant,
      { clientId: client.clientId, refreshToken: params.refresh_token, resource: params.resource },
      now,
      // Die Genesys-Sitzung muss noch leben; ist Genesys nur nicht erreichbar, bleibt die Session bestehen
      async (session) => {
        const access = await ensureGenesysAccess(genesysDeps, tenant, session, now);
        return access.ok || access.reason === "upstream";
      }
    );
  } else {
    return oauthError(400, "unsupported_grant_type", "Only authorization_code and refresh_token are supported");
  }

  if (!result.ok) {
    if (result.error.revokedSession) {
      console.warn("[mcp] token family revoked", { tenantId: tenant.tenantId, clientId: client.clientId, reason: result.error.description });
      await revokeSessionGenesys(result.error.revokedSession);
    }
    return oauthError(result.error.status, result.error.error, result.error.description);
  }
  if (needsClientTouch(client, now)) {
    await store.touchClient(client.clientId, now, now + CLIENT_IDLE_TTL_SECONDS * 1000);
  }
  return jsonResponse(200, result.response);
}

async function revoke(ctx: RouteContext): Promise<AnyResult> {
  const params = readForm(ctx);
  if (!params) return oauthError(400, "invalid_request", "Malformed request");
  const client = await loadBoundClient(pickClientId(params, header(ctx.event, "authorization")), ctx);
  if (!client) return oauthError(401, "invalid_client", "Unknown client");
  if (!params.token) return oauthError(400, "invalid_request", "token is required");
  const result = await revokeToken(store, ctx.tenant.tenantId, { clientId: client.clientId, token: params.token, hint: params.token_type_hint });
  if (result.revokedSession) {
    console.log("[mcp] session revoked by client", { tenantId: ctx.tenant.tenantId, clientId: client.clientId });
    await revokeSessionGenesys(result.revokedSession);
  }
  return jsonResponse(200, undefined);
}

// --- MCP-Endpunkt ------------------------------------------------------------------------------------------------

async function mcpEndpoint(ctx: RouteContext): Promise<AnyResult> {
  const auth = await authenticateMcpCall(genesysDeps, ctx.tenant, ctx.tokenTenant, getAuthorizationToken(ctx.event), ctx.now);
  if (!auth.ok) {
    if (auth.kind === "unauthorized") {
      const error = auth.error ? `, error="${auth.error}"` : "";
      return jsonResponse(401, { error: auth.error ?? "unauthorized" }, {
        "WWW-Authenticate": `Bearer resource_metadata="${ctx.urls.resourceMetadataUrl}"${error}`,
      });
    }
    if (auth.kind === "rate_limited") {
      return jsonResponse(429, { error: "rate_limited" }, { "Retry-After": String(auth.retryAfterSeconds) });
    }
    return jsonResponse(503, { error: "temporarily_unavailable" }, { "Retry-After": "5" });
  }
  // Der MCP-Server mit den Tools kommt in M8
  return jsonResponse(501, { error: "not_implemented" });
}

const ROUTES: Record<string, Route> = {
  "GET /.well-known/oauth-protected-resource/mcp/{tenantKey}": { html: false, handle: protectedResourceMetadata },
  "GET /.well-known/oauth-authorization-server/mcp/{tenantKey}": { html: false, handle: authorizationServerMetadata },
  "POST /mcp/{tenantKey}/oauth/register": { html: false, handle: register },
  "GET /mcp/{tenantKey}/oauth/authorize": { html: true, handle: authorize },
  "GET /mcp/{tenantKey}/oauth/callback": { html: true, handle: callback },
  "GET /mcp/{tenantKey}/oauth/consent": { html: true, handle: consentPage },
  "POST /mcp/{tenantKey}/oauth/consent": { html: true, handle: consentDecision },
  "POST /mcp/{tenantKey}/oauth/token": { html: false, handle: token },
  "POST /mcp/{tenantKey}/oauth/revoke": { html: false, handle: revoke },
  "ANY /mcp/{tenantKey}": { html: false, handle: mcpEndpoint },
};

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  if (!isMcpEnabled()) return notFound();
  const route = ROUTES[String(event?.routeKey ?? "")];
  if (!route) return notFound();
  if (!MCP_PUBLIC_BASE_URL) {
    console.error("[mcp] MCP_PUBLIC_BASE_URL not configured");
    return notFound();
  }
  const lang = pickLang(header(event, "accept-language"));
  let tenantId: string | undefined;
  try {
    const resolution = await resolveMcpTenant(event?.pathParameters?.tenantKey);
    if (!resolution.ok) {
      return resolution.reason === "unavailable"
        ? jsonResponse(503, { error: "temporarily_unavailable" }, { "Retry-After": "5" })
        : notFound();
    }
    const { tenant, credentials } = resolution;
    tenantId = tenant.tenantId;
    const urls = buildMcpUrls(MCP_PUBLIC_BASE_URL, tenant.mcpTenantKey);
    const tokenTenant: TokenTenant = { tenantId: tenant.tenantId, mcpTenantKey: tenant.mcpTenantKey, epoch: tenant.epoch, mcpUrl: urls.mcpUrl };
    return await route.handle({ event, tenant, credentials, urls, tokenTenant, lang, now: Date.now() });
  } catch (err: any) {
    console.error("[mcp] unhandled error", { tenantId, routeKey: event?.routeKey, name: err?.name, message: err?.message });
    return route.html ? errorPage(500, lang, "internal") : jsonResponse(500, { error: "server_error" });
  }
};
