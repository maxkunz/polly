import assert from "node:assert/strict";
import { DEFAULT_MCP_REDIRECT_URIS, isMcpEnabled, parseAllowedRedirectUris } from "../amplify/functions/shared/mcp_config";
import { handler as mcpHandler } from "../amplify/functions/mcp/handler";

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

await test("Kill-Switch: nur der Wert true schaltet ein", () => {
	assert.equal(isMcpEnabled({}), false);
	assert.equal(isMcpEnabled({ MCP_ENABLED: "" }), false);
	assert.equal(isMcpEnabled({ MCP_ENABLED: "false" }), false);
	assert.equal(isMcpEnabled({ MCP_ENABLED: "1" }), false);
	assert.equal(isMcpEnabled({ MCP_ENABLED: "true" }), true);
	assert.equal(isMcpEnabled({ MCP_ENABLED: " TRUE " }), true);
});

await test("Redirect-URIs: Default, Trimmen, Host klein, ungültige Einträge ignoriert", () => {
	assert.deepEqual(parseAllowedRedirectUris(undefined), DEFAULT_MCP_REDIRECT_URIS);
	assert.deepEqual(parseAllowedRedirectUris(" , "), DEFAULT_MCP_REDIRECT_URIS);
	assert.deepEqual(parseAllowedRedirectUris(" https://Claude.AI/cb, https://example.com/a/b ,"), ["https://claude.ai/cb", "https://example.com/a/b"]);
	// Nur Hosts, http, Port, Query, Fragment, Wildcard oder leerer Pfad sind keine gültigen Einträge
	for (const raw of ["claude.ai", "http://claude.ai/cb", "https://claude.ai:8443/cb", "https://claude.ai/cb?x=1", "https://claude.ai/cb#f", "https://*.claude.ai/cb", "https://claude.ai/", "https://claude.ai"]) {
		assert.deepEqual(parseAllowedRedirectUris(raw), DEFAULT_MCP_REDIRECT_URIS, raw);
	}
});

await test("Lambda mcp: 404 bei ausgeschaltetem Kill-Switch, unbekannter Route oder ungültigem Schlüssel", async () => {
	const before = process.env.MCP_ENABLED;
	const metadata = { routeKey: "GET /.well-known/oauth-authorization-server/mcp/{tenantKey}", pathParameters: { tenantKey: "x" } };
	try {
		delete process.env.MCP_ENABLED;
		assert.equal((await mcpHandler({})).statusCode, 404);
		process.env.MCP_ENABLED = "false";
		assert.equal((await mcpHandler(metadata)).statusCode, 404);
		process.env.MCP_ENABLED = "true";
		assert.equal((await mcpHandler({})).statusCode, 404);
		assert.equal((await mcpHandler(metadata)).statusCode, 404);
	} finally {
		if (before === undefined) delete process.env.MCP_ENABLED;
		else process.env.MCP_ENABLED = before;
	}
});

console.log(`${passed} Tests bestanden`);
