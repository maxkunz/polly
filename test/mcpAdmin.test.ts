import assert from "node:assert/strict";
import { buildGenesysRedirectUri, buildMcpUrl } from "../amplify/functions/shared/mcp_config";
import { buildMcpSettingsStatus, checkGenesysClient, parseMcpSettingsPut } from "../amplify/functions/mcp_admin/settings";
import { newMcpTenantKey, hasMcpState } from "../amplify/functions/shared/mcp_tenant";

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

const CLIENT_ID = "0b0e5c2a-8f3d-4c61-9a52-3d1f7e6b9a10";
const REDIRECT = "https://api.example.com/mcp/key123/oauth/callback";

await test("URLs: Basis ohne Schrägstrich am Ende, Redirect-URI hängt am Mandantenschlüssel", () => {
	assert.equal(buildMcpUrl("https://api.example.com/", "key123"), "https://api.example.com/mcp/key123");
	assert.equal(buildGenesysRedirectUri("https://api.example.com", "key123"), REDIRECT);
});

await test("Mandantenschlüssel: 128 bit, URL-sicher, jedes Mal neu", () => {
	const a = newMcpTenantKey();
	assert.match(a, /^[A-Za-z0-9_-]{22}$/);
	assert.notEqual(a, newMcpTenantKey());
});

await test("PUT: Aktivieren braucht Client-ID im UUID-Format und ein Secret", () => {
	assert.deepEqual(parseMcpSettingsPut({ clientId: ` ${CLIENT_ID} `, clientSecret: " s3cret " }), {
		ok: true,
		request: { kind: "enable", clientId: CLIENT_ID, clientSecret: "s3cret" },
	});
	assert.equal(parseMcpSettingsPut({ clientId: "abc", clientSecret: "x" }).ok, false);
	assert.equal(parseMcpSettingsPut({ clientId: CLIENT_ID }).ok, false);
	assert.equal(parseMcpSettingsPut({ clientId: CLIENT_ID, clientSecret: "  " }).ok, false);
	assert.equal(parseMcpSettingsPut({ clientId: CLIENT_ID, clientSecret: "x".repeat(257) }).ok, false);
});

await test("PUT: allowComments nur als boolean und nie zusammen mit dem Client", () => {
	assert.deepEqual(parseMcpSettingsPut({ allowComments: true }), { ok: true, request: { kind: "comments", allowComments: true } });
	assert.deepEqual(parseMcpSettingsPut({ allowComments: false }), { ok: true, request: { kind: "comments", allowComments: false } });
	assert.equal(parseMcpSettingsPut({ allowComments: "true" }).ok, false);
	assert.equal(parseMcpSettingsPut({ allowComments: true, clientId: CLIENT_ID, clientSecret: "x" }).ok, false);
});

await test("PUT: leerer oder kein Objekt-Body wird abgelehnt", () => {
	for (const body of [null, undefined, "x", 1, [], {}]) assert.equal(parseMcpSettingsPut(body).ok, false);
});

await test("Genesys-Client: nur CODE mit genau der Redirect-URI und aktiv", () => {
	const ok = { authorizedGrantType: "CODE", registeredRedirectUri: [REDIRECT], state: "active" };
	assert.deepEqual(checkGenesysClient(ok, REDIRECT), { ok: true });
	assert.deepEqual(checkGenesysClient({ ...ok, state: undefined }, REDIRECT), { ok: true });
	assert.deepEqual(checkGenesysClient({ ...ok, authorizedGrantType: "TOKEN" }, REDIRECT), { ok: false, reason: "grant_type" });
	assert.deepEqual(checkGenesysClient({ ...ok, authorizedGrantType: "CLIENT-CREDENTIALS" }, REDIRECT), { ok: false, reason: "grant_type" });
	assert.deepEqual(checkGenesysClient({ ...ok, registeredRedirectUri: [`${REDIRECT}/`] }, REDIRECT), { ok: false, reason: "redirect_uri" });
	assert.deepEqual(checkGenesysClient({ ...ok, registeredRedirectUri: undefined }, REDIRECT), { ok: false, reason: "redirect_uri" });
	assert.deepEqual(checkGenesysClient({ ...ok, state: "inactive" }, REDIRECT), { ok: false, reason: "inactive" });
	assert.deepEqual(checkGenesysClient(null, REDIRECT), { ok: false, reason: "grant_type" });
});

await test("Status: nur boolesche Werte zählen, Secret und Epoch erscheinen nie", () => {
	const status = buildMcpSettingsStatus({
		tenant: { mcpEnabled: "true", mcpAllowComments: true, mcpGenesysClientId: CLIENT_ID, mcpClientSecretEnc: "xx", mcpEpoch: 3 },
		featureEnabled: true,
		serverEnabled: false,
		mcpUrl: "https://api.example.com/mcp/key123",
		redirectUri: REDIRECT,
		sessionCount: 2,
	});
	assert.equal(status.enabled, false);
	assert.equal(status.allowComments, true);
	assert.equal(status.clientId, CLIENT_ID);
	assert.equal(status.serverEnabled, false);
	assert.deepEqual(Object.keys(status).sort(), [
		"allowComments", "clientId", "enabled", "featureEnabled", "mcpUrl", "redirectUri", "serverEnabled", "sessionCount",
	]);
});

await test("hasMcpState: erkennt Einträge, die MCP je benutzt haben", () => {
	assert.equal(hasMcpState(undefined), false);
	assert.equal(hasMcpState({ tenantId: "t" }), false);
	assert.equal(hasMcpState({ mcpTenantKey: "k" }), true);
	assert.equal(hasMcpState({ mcpEnabled: true }), true);
	assert.equal(hasMcpState({ mcpGenesysClientId: CLIENT_ID }), true);
});

console.log(`${passed} Tests bestanden`);
