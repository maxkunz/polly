import assert from "node:assert/strict";
import {
	buildAuthorizationServerMetadata,
	buildMcpUrls,
	buildProtectedResourceMetadata,
	buildRedirect,
	checkAuthorizeRequest,
	checkRedirectUri,
	CLIENT_IDLE_TTL_SECONDS,
	CLIENT_TOUCH_INTERVAL_MS,
	CLIENT_UNUSED_TTL_SECONDS,
	hashToken,
	needsClientTouch,
	parseClientRegistration,
	parseParams,
	pickClientId,
	pkceChallenge,
	randomToken,
	readCookie,
	SESSION_RATE_LIMIT_PER_MINUTE,
	CONSENT_TTL_SECONDS,
	consentKey,
	isConsentValid,
	MAX_REDIRECT_URIS,
	mergeConsentRedirects,
	verifyPkce,
	type RegisteredClient,
} from "../amplify/functions/mcp/oauth";
import type {
	AuthCodeRecord,
	AuthRequestRecord,
	ClientRecord,
	ConsentRecord,
	OAuthStore,
	SessionRecord,
	TokenRecord,
} from "../amplify/functions/mcp/oauth_store";
import { escapeHtml, pageHeaders, renderConsentPage } from "../amplify/functions/mcp/oauth_pages";
import {
	redeemAuthorizationCode,
	revokeToken,
	rotateRefreshToken,
	verifyAccessToken,
	type TokenTenant,
} from "../amplify/functions/mcp/tokens";
import { checkSessionRate, ensureGenesysAccess, type GenesysSessionDeps } from "../amplify/functions/mcp/session";
import { evaluateMcpTenant, type McpTenant } from "../amplify/functions/mcp/tenant";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
	try {
		await fn();
		passed++;
		console.log(`ok - ${name}`);
	} catch (error) {
		console.error(`FAIL - ${name}`);
		throw error;
	}
}

/** Speicher im RAM mit derselben Semantik wie die DynamoDB-Umsetzung (bedingte Updates einmalig). */
class MemoryStore implements OAuthStore {
	clients = new Map<string, ClientRecord>();
	requests = new Map<string, AuthRequestRecord>();
	codes = new Map<string, AuthCodeRecord>();
	sessions = new Map<string, SessionRecord>();
	tokens = new Map<string, TokenRecord>();
	rates = new Map<string, number>();
	consents = new Map<string, ConsentRecord>();

	async getClient(id: string) { return this.clients.get(id); }
	async putClient(client: ClientRecord) { this.clients.set(client.clientId, { ...client }); }
	async touchClient(id: string, now: number, expiresAt: number) {
		const client = this.clients.get(id);
		if (client) Object.assign(client, { lastUsedAt: now, expiresAt });
	}
	async countClients(tenantId: string, now: number) {
		return [...this.clients.values()].filter((c) => c.tenantId === tenantId && c.expiresAt > now).length;
	}
	async putAuthRequest(request: AuthRequestRecord) { this.requests.set(request.id, { ...request }); }
	async getAuthRequest(id: string) { const r = this.requests.get(id); return r && { ...r }; }
	async transitionAuthRequest(id: string, from: AuthRequestRecord["status"], to: AuthRequestRecord["status"], patch = {}) {
		const r = this.requests.get(id);
		if (!r || r.status !== from) return false;
		Object.assign(r, patch, { status: to });
		return true;
	}
	async deleteAuthRequest(id: string) { this.requests.delete(id); }
	async putCode(code: AuthCodeRecord) { this.codes.set(code.codeHash, { ...code }); }
	async getCode(hash: string) { const c = this.codes.get(hash); return c && { ...c }; }
	async consumeCode(hash: string, now: number) {
		const c = this.codes.get(hash);
		if (!c || c.usedAt !== undefined) return false;
		c.usedAt = now;
		return true;
	}
	async putSession(session: SessionRecord) { this.sessions.set(session.sessionId, { ...session }); }
	async getSession(id: string) { const s = this.sessions.get(id); return s && { ...s }; }
	async updateSessionGenesys(id: string, expected: number, patch: { genesysTokensEnc: string; genesysExpiresAt: number }) {
		const s = this.sessions.get(id);
		if (!s || s.genesysVersion !== expected) return false;
		Object.assign(s, patch, { genesysVersion: expected + 1 });
		return true;
	}
	async deleteSession(id: string) { const s = this.sessions.get(id); this.sessions.delete(id); return s; }
	async putToken(token: TokenRecord) { this.tokens.set(`${token.kind}#${token.tokenHash}`, { ...token }); }
	async getToken(kind: "AT" | "RT", hash: string) { const t = this.tokens.get(`${kind}#${hash}`); return t && { ...t }; }
	async consumeToken(kind: "AT" | "RT", hash: string, now: number) {
		const t = this.tokens.get(`${kind}#${hash}`);
		if (!t || t.usedAt !== undefined) return false;
		t.usedAt = now;
		return true;
	}
	async deleteToken(kind: "AT" | "RT", hash: string) { this.tokens.delete(`${kind}#${hash}`); }
	async getConsent(key: string) { const c = this.consents.get(key); return c && { ...c }; }
	async putConsent(consent: ConsentRecord) { this.consents.set(consent.consentKey, { ...consent }); }
	async deleteConsent(key: string) { this.consents.delete(key); }
	async incrementRate(_tenantId: string, sessionId: string, bucket: string) {
		const key = `${sessionId}#${bucket}`;
		const next = (this.rates.get(key) ?? 0) + 1;
		this.rates.set(key, next);
		return next;
	}
}

const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const KEY = "AbCdEfGhIjKlMnOpQrStUv";
const URLS = buildMcpUrls("https://api.example.com/", KEY);
const TENANT: TokenTenant = { tenantId: "tenant-a", mcpTenantKey: KEY, epoch: 3, mcpUrl: URLS.mcpUrl };
const HOSTS = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"];
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const CLIENT_ID = randomToken();
const VERIFIER = randomToken() + "-._~";

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		sessionId: randomToken(),
		tenantId: TENANT.tenantId,
		mcpTenantKey: KEY,
		epoch: TENANT.epoch,
		clientId: CLIENT_ID,
		userId: "user-1",
		userName: "Erika Muster",
		region: "mypurecloud.de",
		genesysTokensEnc: "enc:v0",
		genesysExpiresAt: NOW + 3600_000,
		genesysVersion: 0,
		createdAt: NOW,
		expiresAt: NOW + 30 * 86400_000,
		...overrides,
	};
}

/** Session und Code wie nach der Zustimmung; gibt den Klartext-Code zurück. */
async function seedCode(store: MemoryStore, overrides: Partial<AuthCodeRecord> = {}): Promise<{ code: string; session: SessionRecord }> {
	const s = session();
	await store.putSession(s);
	const code = randomToken();
	await store.putCode({
		codeHash: hashToken(code),
		tenantId: TENANT.tenantId,
		clientId: CLIENT_ID,
		redirectUri: REDIRECT,
		codeChallenge: pkceChallenge(VERIFIER),
		resource: URLS.mcpUrl,
		sessionId: s.sessionId,
		expiresAt: NOW + 120_000,
		...overrides,
	});
	return { code, session: s };
}

function redeem(store: MemoryStore, code: string, overrides: Record<string, string | undefined> = {}, now = NOW) {
	return redeemAuthorizationCode(
		store,
		TENANT,
		{ clientId: CLIENT_ID, code, redirectUri: REDIRECT, codeVerifier: VERIFIER, resource: URLS.mcpUrl, ...overrides },
		now
	);
}

// --- PKCE, Parameter, Metadaten -----------------------------------------------------------------------------------

await test("PKCE S256: base64url(SHA-256), falscher oder zu kurzer Verifier scheitert", () => {
	assert.equal(pkceChallenge("abc"), "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
	const challenge = pkceChallenge(VERIFIER);
	assert.equal(verifyPkce(VERIFIER, challenge), true);
	assert.equal(verifyPkce(randomToken(), challenge), false);
	assert.equal(verifyPkce("short", pkceChallenge("short")), false);
	assert.equal(verifyPkce(challenge, challenge), false, "plain (Challenge als Verifier) gilt nicht");
	assert.equal(verifyPkce(undefined, challenge), false);
});

await test("Zufallswerte: 256 bit, URL-sicher; Hash ist SHA-256 hex", () => {
	assert.match(randomToken(), /^[A-Za-z0-9_-]{43}$/);
	assert.notEqual(randomToken(), randomToken());
	assert.match(hashToken("x"), /^[0-9a-f]{64}$/);
});

await test("Metadaten: Issuer = MCP-URL, nur S256 und öffentliche Clients, .well-known an der Wurzel", () => {
	assert.equal(URLS.mcpUrl, `https://api.example.com/mcp/${KEY}`);
	assert.equal(URLS.resourceMetadataUrl, `https://api.example.com/.well-known/oauth-protected-resource/mcp/${KEY}`);
	assert.equal(URLS.genesysRedirectUri, `${URLS.mcpUrl}/oauth/callback`);
	assert.equal(URLS.cookiePath, `/mcp/${KEY}/oauth`);
	const as = buildAuthorizationServerMetadata(URLS);
	assert.equal(as.issuer, URLS.mcpUrl);
	assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
	assert.deepEqual(as.token_endpoint_auth_methods_supported, ["none"]);
	assert.deepEqual(as.grant_types_supported, ["authorization_code", "refresh_token"]);
	const pr = buildProtectedResourceMetadata(URLS);
	assert.equal(pr.resource, URLS.mcpUrl);
	assert.deepEqual(pr.authorization_servers, [URLS.mcpUrl]);
});

await test("Parameter: doppelte Angaben sind ungültig, Redirect behält eigenen Query-String", () => {
	assert.deepEqual(parseParams("a=1&b=2"), { a: "1", b: "2" });
	assert.equal(parseParams("a=1&a=2"), null);
	assert.equal(buildRedirect("https://claude.ai/cb?x=1", { code: "c", state: undefined }), "https://claude.ai/cb?x=1&code=c");
});

await test("Client-ID aus Body oder HTTP Basic, Cookie aus Liste oder Header", () => {
	assert.equal(pickClientId({ client_id: "abc" }, undefined), "abc");
	assert.equal(pickClientId({}, `Basic ${Buffer.from("xyz:").toString("base64")}`), "xyz");
	assert.equal(pickClientId({}, "Bearer t"), "");
	assert.equal(readCookie(["a=1", "polly_mcp_auth=v"], "polly_mcp_auth"), "v");
	assert.equal(readCookie("a=1; polly_mcp_auth=w", "polly_mcp_auth"), "w");
	assert.equal(readCookie(undefined, "polly_mcp_auth"), undefined);
});

// --- Allow-List und DCR ---------------------------------------------------------------------------------------------

await test("Redirect-Allow-List: https mit erlaubtem Ursprung und Pfad oder Loopback, sonst abgelehnt", () => {
	assert.equal(checkRedirectUri(REDIRECT, HOSTS).ok, true);
	assert.equal(checkRedirectUri("https://CLAUDE.com/api/mcp/auth_callback", HOSTS).ok, true);
	assert.equal(checkRedirectUri("http://localhost:33418/callback", HOSTS).ok, true);
	assert.equal(checkRedirectUri("http://127.0.0.1:5000/cb", HOSTS).ok, true);
	assert.equal(checkRedirectUri("http://[::1]:5000/cb", HOSTS).ok, true);
	const rejected: Array<[string, string]> = [
		["http://claude.ai/cb", "scheme"],
		["https://evil.example/api/mcp/auth_callback", "not_allowed"],
		["https://claude.ai.evil.example/api/mcp/auth_callback", "not_allowed"],
		["https://evil.claude.ai/api/mcp/auth_callback", "not_allowed"],
		// Anderer Pfad auf erlaubtem Host (z. B. ein Open Redirect) ist nicht erlaubt
		["https://claude.ai/cb", "not_allowed"],
		["https://claude.ai/api/mcp/auth_callback/x", "not_allowed"],
		["https://claude.ai/api/mcp/../redirect?to=evil", "not_allowed"],
		["https://claude.ai:8443/cb", "port"],
		["https://*.claude.ai/cb", "wildcard"],
		["https://claude.ai/cb#frag", "fragment"],
		["https://user:pw@claude.ai/cb", "credentials"],
		["javascript:alert(1)", "scheme"],
		["claude.ai/cb", "invalid"],
	];
	for (const [uri, reason] of rejected) assert.deepEqual(checkRedirectUri(uri, HOSTS), { ok: false, reason }, uri);
});

await test("DCR: nur öffentliche Clients mit Code-Grant, URIs aus der Allow-List, Name bereinigt", () => {
	const ok = parseClientRegistration({ redirect_uris: [REDIRECT, REDIRECT], client_name: "Claude\u0007 <b>", grant_types: ["authorization_code", "refresh_token"] }, HOSTS);
	assert.deepEqual(ok, { ok: true, registration: { redirectUris: [REDIRECT], clientName: "Claude <b>" } });
	assert.equal(parseClientRegistration({ redirect_uris: [] }, HOSTS).ok, false);
	assert.equal(parseClientRegistration({ redirect_uris: ["https://evil.example/cb"] }, HOSTS).ok, false);
	assert.equal(parseClientRegistration({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" }, HOSTS).ok, false);
	assert.equal(parseClientRegistration({ redirect_uris: [REDIRECT], grant_types: ["client_credentials"] }, HOSTS).ok, false);
	assert.equal(parseClientRegistration({ redirect_uris: [REDIRECT], response_types: ["token"] }, HOSTS).ok, false);
	assert.equal(parseClientRegistration([REDIRECT], HOSTS).ok, false);
});

await test("DCR-Client: kurze Frist bis zum ersten Token, danach volle Frist und Verlängerung höchstens täglich", () => {
	assert.equal(needsClientTouch({ expiresAt: NOW + CLIENT_UNUSED_TTL_SECONDS * 1000 }, NOW + 60_000), true);
	assert.equal(needsClientTouch({ expiresAt: NOW + CLIENT_IDLE_TTL_SECONDS * 1000 }, NOW), false);
	assert.equal(needsClientTouch({ expiresAt: NOW + CLIENT_IDLE_TTL_SECONDS * 1000 }, NOW + CLIENT_TOUCH_INTERVAL_MS - 1000), false);
	assert.equal(needsClientTouch({ expiresAt: NOW + CLIENT_IDLE_TTL_SECONDS * 1000 }, NOW + CLIENT_TOUCH_INTERVAL_MS + 1000), true);
});

// --- Autorisierungsanfrage ------------------------------------------------------------------------------------------

const REGISTERED: RegisteredClient = { clientId: CLIENT_ID, tenantId: TENANT.tenantId, mcpTenantKey: KEY, redirectUris: [REDIRECT] };
const AUTH_PARAMS = {
	response_type: "code",
	client_id: CLIENT_ID,
	redirect_uri: REDIRECT,
	code_challenge: pkceChallenge(VERIFIER),
	code_challenge_method: "S256",
	state: "s1",
	resource: URLS.mcpUrl,
};

await test("/authorize: Fehler vor geprüfter redirect_uri nur als Seite", () => {
	const tenant = { tenantId: TENANT.tenantId, mcpTenantKey: KEY };
	assert.equal(checkAuthorizeRequest(null, REGISTERED, tenant, URLS.mcpUrl).kind, "page");
	assert.equal(checkAuthorizeRequest(AUTH_PARAMS, undefined, tenant, URLS.mcpUrl).kind, "page");
	assert.equal(checkAuthorizeRequest(AUTH_PARAMS, { ...REGISTERED, mcpTenantKey: "OtherKeyOtherKeyOther1" }, tenant, URLS.mcpUrl).kind, "page");
	assert.equal(checkAuthorizeRequest(AUTH_PARAMS, { ...REGISTERED, tenantId: "tenant-b" }, tenant, URLS.mcpUrl).kind, "page");
	assert.equal(checkAuthorizeRequest({ ...AUTH_PARAMS, redirect_uri: "https://claude.ai/other" }, REGISTERED, tenant, URLS.mcpUrl).kind, "page");
	const { redirect_uri: _omit, ...withoutRedirect } = AUTH_PARAMS;
	assert.equal(checkAuthorizeRequest(withoutRedirect, REGISTERED, tenant, URLS.mcpUrl).kind, "page");
});

await test("/authorize: PKCE S256 und resource Pflicht, Fehler gehen mit state an den Client", () => {
	const tenant = { tenantId: TENANT.tenantId, mcpTenantKey: KEY };
	const expectRedirect = (params: Record<string, string>, error: string) => {
		const check = checkAuthorizeRequest(params, REGISTERED, tenant, URLS.mcpUrl);
		assert.equal(check.kind, "redirect");
		if (check.kind === "redirect") {
			assert.equal(check.error, error);
			assert.equal(check.state, "s1");
			assert.equal(check.redirectUri, REDIRECT);
		}
	};
	const { code_challenge: _c, ...withoutChallenge } = AUTH_PARAMS;
	expectRedirect(withoutChallenge, "invalid_request");
	expectRedirect({ ...AUTH_PARAMS, code_challenge_method: "plain" }, "invalid_request");
	expectRedirect({ ...AUTH_PARAMS, code_challenge: "too-short" }, "invalid_request");
	expectRedirect({ ...AUTH_PARAMS, response_type: "token" }, "unsupported_response_type");
	const { resource: _r, ...withoutResource } = AUTH_PARAMS;
	expectRedirect(withoutResource, "invalid_target");
	expectRedirect({ ...AUTH_PARAMS, resource: "https://api.example.com/mcp/OtherKeyOtherKeyOther1" }, "invalid_target");
	const ok = checkAuthorizeRequest({ ...AUTH_PARAMS, resource: `${URLS.mcpUrl}/` }, REGISTERED, tenant, URLS.mcpUrl);
	assert.equal(ok.kind, "ok");
	if (ok.kind === "ok") assert.equal(ok.request.resource, URLS.mcpUrl);
});

// --- Code und Tokens ------------------------------------------------------------------------------------------------

await test("Code einlösen: liefert Token-Paar, das Access-Token gilt für die Session", async () => {
	const store = new MemoryStore();
	const { code, session: s } = await seedCode(store);
	const result = await redeem(store, code);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.response.token_type, "Bearer");
	assert.equal(result.response.expires_in, 3600);
	const check = await verifyAccessToken(store, TENANT, result.response.access_token, NOW + 1000);
	assert.equal(check.ok, true);
	if (check.ok) assert.equal(check.session.sessionId, s.sessionId);
	// Nur Hashes gespeichert
	for (const key of store.tokens.keys()) {
		assert.ok(!key.includes(result.response.access_token) && !key.includes(result.response.refresh_token));
	}
});

await test("Code: PKCE, client_id, redirect_uri, resource und Ablauf müssen passen", async () => {
	const store = new MemoryStore();
	const { code } = await seedCode(store);
	assert.equal((await redeem(store, code, { codeVerifier: randomToken() })).ok, false);
	assert.equal((await redeem(store, code, { codeVerifier: undefined })).ok, false);
	assert.equal((await redeem(store, code, { clientId: randomToken() })).ok, false);
	assert.equal((await redeem(store, code, { redirectUri: "https://claude.ai/other" })).ok, false);
	const wrongResource = await redeem(store, code, { resource: "https://api.example.com/mcp/OtherKeyOtherKeyOther1" });
	assert.equal(!wrongResource.ok && wrongResource.error.error, "invalid_target");
	assert.equal((await redeem(store, code, {}, NOW + 121_000)).ok, false, "abgelaufen");
	// Fehlversuche verbrauchen den Code nicht
	assert.equal((await redeem(store, code)).ok, true);
});

await test("Code: Wiederverwendung widerruft die Session samt ausgegebener Tokens", async () => {
	const store = new MemoryStore();
	const { code, session: s } = await seedCode(store);
	const first = await redeem(store, code);
	assert.equal(first.ok, true);
	const second = await redeem(store, code);
	assert.equal(second.ok, false);
	if (!second.ok) {
		assert.equal(second.error.error, "invalid_grant");
		assert.equal(second.error.revokedSession?.sessionId, s.sessionId);
	}
	assert.equal(store.sessions.has(s.sessionId), false);
	if (first.ok) assert.deepEqual(await verifyAccessToken(store, TENANT, first.response.access_token, NOW), { ok: false, reason: "session" });
});

await test("Code eines anderen Mandanten wird nicht angenommen", async () => {
	const store = new MemoryStore();
	const { code } = await seedCode(store, { tenantId: "tenant-b" });
	assert.equal((await redeem(store, code)).ok, false);
});

await test("Refresh: Rotation liefert neues Paar, das alte Refresh-Token ist verbraucht", async () => {
	const store = new MemoryStore();
	const { code } = await seedCode(store);
	const first = await redeem(store, code);
	assert.ok(first.ok);
	const rotated = await rotateRefreshToken(store, TENANT, { clientId: CLIENT_ID, refreshToken: first.response.refresh_token }, NOW + 60_000);
	assert.ok(rotated.ok);
	assert.notEqual(rotated.response.refresh_token, first.response.refresh_token);
	assert.notEqual(rotated.response.access_token, first.response.access_token);
	assert.equal((await verifyAccessToken(store, TENANT, rotated.response.access_token, NOW + 61_000)).ok, true);
});

await test("Refresh: Wiederverwendung widerruft die ganze Familie", async () => {
	const store = new MemoryStore();
	const { code, session: s } = await seedCode(store);
	const first = await redeem(store, code);
	assert.ok(first.ok);
	const rotated = await rotateRefreshToken(store, TENANT, { clientId: CLIENT_ID, refreshToken: first.response.refresh_token }, NOW);
	assert.ok(rotated.ok);
	const reuse = await rotateRefreshToken(store, TENANT, { clientId: CLIENT_ID, refreshToken: first.response.refresh_token }, NOW);
	assert.equal(reuse.ok, false);
	if (!reuse.ok) assert.equal(reuse.error.revokedSession?.sessionId, s.sessionId);
	// Auch das neue Paar ist damit ungültig
	assert.equal((await verifyAccessToken(store, TENANT, rotated.response.access_token, NOW)).ok, false);
	assert.equal((await rotateRefreshToken(store, TENANT, { clientId: CLIENT_ID, refreshToken: rotated.response.refresh_token }, NOW)).ok, false);
});

await test("Refresh: fremder Client, falsche resource, Ablauf und neue Epoch werden abgelehnt", async () => {
	const store = new MemoryStore();
	const { code } = await seedCode(store);
	const first = await redeem(store, code);
	assert.ok(first.ok);
	const rt = first.response.refresh_token;
	assert.equal((await rotateRefreshToken(store, TENANT, { clientId: randomToken(), refreshToken: rt }, NOW)).ok, false);
	const target = await rotateRefreshToken(store, TENANT, { clientId: CLIENT_ID, refreshToken: rt, resource: "https://evil.example/mcp" }, NOW);
	assert.equal(!target.ok && target.error.error, "invalid_target");
	// Epoch erhöht (MCP abgeschaltet/Client gewechselt): Session ungültig
	const bumped = { ...TENANT, epoch: TENANT.epoch + 1 };
	assert.equal((await rotateRefreshToken(store, bumped, { clientId: CLIENT_ID, refreshToken: rt }, NOW)).ok, false);
	assert.deepEqual(await verifyAccessToken(store, bumped, first.response.access_token, NOW), { ok: false, reason: "session" });
});

await test("Refresh: tote Genesys-Sitzung widerruft die Session", async () => {
	const store = new MemoryStore();
	const { code, session: s } = await seedCode(store);
	const first = await redeem(store, code);
	assert.ok(first.ok);
	const result = await rotateRefreshToken(store, TENANT, { clientId: CLIENT_ID, refreshToken: first.response.refresh_token }, NOW, async () => false);
	assert.equal(result.ok, false);
	assert.equal(store.sessions.has(s.sessionId), false);
});

await test("Access-Token: fehlend, Format, Ablauf, anderer Mandant", async () => {
	const store = new MemoryStore();
	const { code } = await seedCode(store);
	const first = await redeem(store, code);
	assert.ok(first.ok);
	assert.deepEqual(await verifyAccessToken(store, TENANT, "", NOW), { ok: false, reason: "missing" });
	assert.deepEqual(await verifyAccessToken(store, TENANT, "not a token", NOW), { ok: false, reason: "invalid" });
	assert.deepEqual(await verifyAccessToken(store, TENANT, first.response.access_token, NOW + 3600_000), { ok: false, reason: "expired" });
	const other = { ...TENANT, tenantId: "tenant-b" };
	assert.deepEqual(await verifyAccessToken(store, other, first.response.access_token, NOW), { ok: false, reason: "invalid" });
	const otherUrl = { ...TENANT, mcpUrl: "https://api.example.com/mcp/OtherKeyOtherKeyOther1" };
	assert.deepEqual(await verifyAccessToken(store, otherUrl, first.response.access_token, NOW), { ok: false, reason: "invalid" });
});

await test("Widerruf: Refresh-Token widerruft die Familie, fremde Clients können nichts widerrufen", async () => {
	const store = new MemoryStore();
	const { code, session: s } = await seedCode(store);
	const first = await redeem(store, code);
	assert.ok(first.ok);
	assert.deepEqual(await revokeToken(store, TENANT.tenantId, { clientId: randomToken(), token: first.response.refresh_token }), {});
	assert.equal(store.sessions.has(s.sessionId), true);
	const revoked = await revokeToken(store, TENANT.tenantId, { clientId: CLIENT_ID, token: first.response.refresh_token });
	assert.equal(revoked.revokedSession?.sessionId, s.sessionId);
	assert.equal((await verifyAccessToken(store, TENANT, first.response.access_token, NOW)).ok, false);
});

await test("Widerruf: Access-Token nur sich selbst", async () => {
	const store = new MemoryStore();
	const { code, session: s } = await seedCode(store);
	const first = await redeem(store, code);
	assert.ok(first.ok);
	assert.deepEqual(await revokeToken(store, TENANT.tenantId, { clientId: CLIENT_ID, token: first.response.access_token, hint: "access_token" }), {});
	assert.equal(store.sessions.has(s.sessionId), true);
	assert.equal((await verifyAccessToken(store, TENANT, first.response.access_token, NOW)).ok, false);
});

// --- Session: Genesys-Refresh und Rate-Limit ------------------------------------------------------------------------

const MCP_TENANT: McpTenant = {
	tenantId: TENANT.tenantId,
	backendClientId: "backend-1",
	mcpTenantKey: KEY,
	epoch: TENANT.epoch,
	region: "mypurecloud.de",
	genesysClientId: "genesys-client",
	genesysOrgId: "org-1",
	clientSecretEnc: "secret-enc",
	allowComments: false,
	tenantName: "Muster AG",
};

function fakeDeps(store: MemoryStore, refresh: GenesysSessionDeps["refresh"]): GenesysSessionDeps & { refreshCalls: number } {
	const deps = {
		store,
		refreshCalls: 0,
		decryptTokens: async (s: { genesysTokensEnc: string }) => {
			const version = s.genesysTokensEnc.slice("enc:".length);
			return { accessToken: `access-${version}`, refreshToken: `refresh-${version}` };
		},
		encryptTokens: async (_t: string, _s: string, tokens: { accessToken: string }) => `enc:${tokens.accessToken.replace("access-", "")}`,
		clientSecret: async () => "secret",
		refresh: async (...args: Parameters<GenesysSessionDeps["refresh"]>) => {
			deps.refreshCalls += 1;
			return refresh(...args);
		},
	};
	return deps;
}

await test("Genesys: gültiges Token ohne Refresh, kurz vor Ablauf mit Refresh und neuer Version", async () => {
	const store = new MemoryStore();
	const fresh = session();
	await store.putSession(fresh);
	const deps = fakeDeps(store, async (_r, _c, _rt, now) => ({ ok: true, tokens: { accessToken: "access-v1", refreshToken: "refresh-v1", expiresAt: now + 3600_000 } }));
	const unchanged = await ensureGenesysAccess(deps, MCP_TENANT, fresh, NOW);
	assert.deepEqual(unchanged.ok && unchanged.accessToken, "access-v0");
	assert.equal(deps.refreshCalls, 0);

	const expiring = session({ genesysExpiresAt: NOW + 30_000 });
	await store.putSession(expiring);
	const refreshed = await ensureGenesysAccess(deps, MCP_TENANT, expiring, NOW);
	assert.equal(refreshed.ok && refreshed.accessToken, "access-v1");
	assert.equal(store.sessions.get(expiring.sessionId)?.genesysVersion, 1);
	assert.equal(store.sessions.get(expiring.sessionId)?.genesysTokensEnc, "enc:v1");
});

await test("Genesys: paralleler Refresh – der Verlierer nimmt die Tokens des Gewinners, ohne Gewinner ist die Session tot", async () => {
	const store = new MemoryStore();
	const expiring = session({ genesysExpiresAt: NOW - 1000 });
	await store.putSession(expiring);
	// Ein anderer Aufruf hat schon erneuert
	await store.updateSessionGenesys(expiring.sessionId, 0, { genesysTokensEnc: "enc:v9", genesysExpiresAt: NOW + 3600_000 });
	const loser = fakeDeps(store, async () => ({ ok: false, kind: "invalid_grant", status: 400 }));
	const access = await ensureGenesysAccess(loser, MCP_TENANT, expiring, NOW);
	assert.equal(access.ok && access.accessToken, "access-v9");

	const lonely = session({ genesysExpiresAt: NOW - 1000 });
	await store.putSession(lonely);
	assert.deepEqual(await ensureGenesysAccess(loser, MCP_TENANT, lonely, NOW), { ok: false, reason: "session_dead" });
});

await test("Genesys: nicht erreichbar – noch gültiges Token weiter nutzen, abgelaufenes ergibt upstream", async () => {
	const store = new MemoryStore();
	const deps = fakeDeps(store, async () => ({ ok: false, kind: "upstream" }));
	const soon = session({ genesysExpiresAt: NOW + 30_000 });
	await store.putSession(soon);
	assert.equal((await ensureGenesysAccess(deps, MCP_TENANT, soon, NOW)).ok, true);
	const gone = session({ genesysExpiresAt: NOW - 1 });
	await store.putSession(gone);
	assert.deepEqual(await ensureGenesysAccess(deps, MCP_TENANT, gone, NOW), { ok: false, reason: "upstream" });
	// Ohne Secret kein Refresh möglich
	const noSecret = { ...deps, clientSecret: async () => undefined };
	assert.deepEqual(await ensureGenesysAccess(noSecret, MCP_TENANT, gone, NOW), { ok: false, reason: "session_dead" });
});

await test("Rate-Limit pro Session und Minute", async () => {
	const store = new MemoryStore();
	const s = session();
	for (let i = 0; i < SESSION_RATE_LIMIT_PER_MINUTE; i++) assert.equal((await checkSessionRate(store, s, NOW)).ok, true);
	const limited = await checkSessionRate(store, s, NOW + 15_000);
	assert.deepEqual(limited, { ok: false, retryAfterSeconds: 45 });
	assert.equal((await checkSessionRate(store, s, NOW + 60_000)).ok, true, "neue Minute");
});

const CLAUDE_COM = "https://claude.com/api/mcp/auth_callback";

/** Gemerkte Zustimmung wie nach „Zulassen“ für Person `user-1` und `CLIENT_ID`. */
async function seedConsent(store: MemoryStore, redirectUris = [REDIRECT]): Promise<string> {
	const key = consentKey(TENANT.tenantId, "user-1", CLIENT_ID);
	await store.putConsent({ consentKey: key, tenantId: TENANT.tenantId, clientId: CLIENT_ID, redirectUris, epoch: TENANT.epoch, expiresAt: NOW + CONSENT_TTL_SECONDS * 1000 });
	return key;
}

await test("Gemerkte Zustimmung: nur gleicher Mandant, Client, bestätigte Redirect-URI, Epoch und vor Ablauf", async () => {
	const store = new MemoryStore();
	const key = await seedConsent(store);
	assert.notEqual(key, consentKey(TENANT.tenantId, "user-2", CLIENT_ID));
	assert.notEqual(key, consentKey("tenant-b", "user-1", CLIENT_ID));
	assert.ok(!key.includes("user-1"));
	const stored = await store.getConsent(key);
	const current = { tenantId: TENANT.tenantId, clientId: CLIENT_ID, redirectUri: REDIRECT, epoch: TENANT.epoch };
	assert.equal(isConsentValid(stored, current, NOW), true);
	assert.equal(isConsentValid(undefined, current, NOW), false);
	assert.equal(isConsentValid(stored, { ...current, epoch: TENANT.epoch + 1 }, NOW), false, "Abschalten widerruft");
	assert.equal(isConsentValid(stored, { ...current, redirectUri: CLAUDE_COM }, NOW), false);
	assert.equal(isConsentValid(stored, { ...current, clientId: "other" }, NOW), false);
	assert.equal(isConsentValid(stored, { ...current, tenantId: "tenant-b" }, NOW), false);
	assert.equal(isConsentValid(stored, current, NOW + CONSENT_TTL_SECONDS * 1000), false, "abgelaufen");
});

await test("Gemerkte Zustimmung: mehrere Redirect-URIs eines Clients bleiben bestätigt", async () => {
	const store = new MemoryStore();
	const stored = await store.getConsent(await seedConsent(store));
	const merged = mergeConsentRedirects(stored, CLAUDE_COM, TENANT.epoch, NOW);
	assert.deepEqual(merged, [CLAUDE_COM, REDIRECT]);
	assert.deepEqual(mergeConsentRedirects(stored, REDIRECT, TENANT.epoch, NOW), [REDIRECT], "keine Dubletten");
	assert.deepEqual(mergeConsentRedirects(stored, CLAUDE_COM, TENANT.epoch + 1, NOW), [CLAUDE_COM], "neuer Epoch verwirft die alten");
	assert.deepEqual(mergeConsentRedirects(stored, CLAUDE_COM, TENANT.epoch, NOW + CONSENT_TTL_SECONDS * 1000), [CLAUDE_COM], "abgelaufen");
	const many = Array.from({ length: 12 }, (_, i) => `http://localhost:${4000 + i}/cb`);
	const capped = many.reduce<string[]>((uris, uri) => mergeConsentRedirects({ ...stored!, redirectUris: uris }, uri, TENANT.epoch, NOW), []);
	assert.equal(capped.length, MAX_REDIRECT_URIS);
	assert.equal(capped[0], many[11]);
});

await test("Gemerkte Zustimmung: Widerruf durch den Client und Wiederverwendung nehmen sie zurück", async () => {
	// Widerruf des Refresh-Tokens (Connector getrennt)
	let store = new MemoryStore();
	let key = await seedConsent(store);
	let first = await redeem(store, (await seedCode(store)).code);
	assert.ok(first.ok);
	await revokeToken(store, TENANT.tenantId, { clientId: CLIENT_ID, token: first.response.refresh_token });
	assert.equal(await store.getConsent(key), undefined);

	// Wiederverwendung eines Refresh-Tokens (Anzeichen für Missbrauch)
	store = new MemoryStore();
	key = await seedConsent(store);
	first = await redeem(store, (await seedCode(store)).code);
	assert.ok(first.ok);
	assert.ok((await rotateRefreshToken(store, TENANT, { clientId: CLIENT_ID, refreshToken: first.response.refresh_token }, NOW)).ok);
	assert.equal((await rotateRefreshToken(store, TENANT, { clientId: CLIENT_ID, refreshToken: first.response.refresh_token }, NOW)).ok, false);
	assert.equal(await store.getConsent(key), undefined);

	// Ein Access-Token widerruft nur sich selbst, die Zustimmung bleibt
	store = new MemoryStore();
	key = await seedConsent(store);
	first = await redeem(store, (await seedCode(store)).code);
	assert.ok(first.ok);
	await revokeToken(store, TENANT.tenantId, { clientId: CLIENT_ID, token: first.response.access_token, hint: "access_token" });
	assert.ok(await store.getConsent(key));
});

await test("Gemerkte Zustimmung: tote Genesys-Sitzung lässt sie bestehen", async () => {
	const store = new MemoryStore();
	const key = await seedConsent(store);
	const first = await redeem(store, (await seedCode(store)).code);
	assert.ok(first.ok);
	const dead = await rotateRefreshToken(store, TENANT, { clientId: CLIENT_ID, refreshToken: first.response.refresh_token }, NOW, async () => false);
	assert.equal(dead.ok, false);
	assert.ok(await store.getConsent(key));
});

// --- Mandant und Seiten ---------------------------------------------------------------------------------------------

await test("Mandant: nur mit Schlüssel, mcpEnabled, APPROVED, Genesys-Client und Org", () => {
	const item = {
		backendClientId: "backend-1",
		tenantId: "tenant-a",
		status: "APPROVED",
		mcpTenantKey: KEY,
		mcpEnabled: true,
		mcpEpoch: 3,
		mcpGenesysClientId: "genesys-client",
		genesysOrgId: "org-1",
		genesysRegion: "evil.example",
	};
	const tenant = evaluateMcpTenant(item, KEY);
	assert.equal(tenant?.epoch, 3);
	assert.equal(tenant?.region, "mypurecloud.de", "unbekannte Region fällt auf den Standard zurück");
	assert.equal(evaluateMcpTenant(item, "OtherKeyOtherKeyOther1"), undefined);
	assert.equal(evaluateMcpTenant({ ...item, mcpEnabled: false }, KEY), undefined);
	assert.equal(evaluateMcpTenant({ ...item, status: "DELETED" }, KEY), undefined);
	assert.equal(evaluateMcpTenant({ ...item, mcpGenesysClientId: undefined }, KEY), undefined);
	assert.equal(evaluateMcpTenant({ ...item, genesysOrgId: "" }, KEY), undefined);
	assert.equal(evaluateMcpTenant({ ...item, mcpEpoch: undefined }, KEY)?.epoch, 0);
});

await test("Zustimmungsseite: escaped, nicht einbettbar, CSRF-Nonce im Formular", () => {
	const html = renderConsentPage("de", {
		clientName: `<script>alert("x")</script>`,
		redirectUri: REDIRECT,
		installation: "Muster & Co",
		userName: "Erika",
		requestId: "req",
		nonce: "nonce-1",
		action: `${URLS.mcpUrl}/oauth/consent`,
	});
	assert.ok(!html.includes("<script>"));
	assert.ok(html.includes(escapeHtml(`<script>alert("x")</script>`)));
	assert.ok(html.includes("Muster &amp; Co"));
	assert.ok(html.includes(`name="nonce" value="nonce-1"`));
	assert.ok(html.includes("claude.ai"));
	const loopback = renderConsentPage("en", { clientName: "", redirectUri: "http://localhost:1234/cb", installation: "x", userName: "y", requestId: "r", nonce: "n", action: "a" });
	assert.ok(loopback.includes("a program on this computer"));
	const headers = pageHeaders("https://claude.ai");
	assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
	assert.match(headers["Content-Security-Policy"], /form-action 'self' https:\/\/claude\.ai/);
	assert.equal(headers["X-Frame-Options"], "DENY");
});

console.log(`${passed} Tests bestanden`);
