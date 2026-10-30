import assert from "node:assert/strict";
import { DEFAULT_MCP_REDIRECT_HOSTS, isMcpEnabled, parseAllowedRedirectHosts } from "../amplify/functions/shared/mcp_config";
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

await test("Redirect-Hosts: Default, Trimmen, Kleinbuchstaben", () => {
	assert.deepEqual(parseAllowedRedirectHosts(undefined), DEFAULT_MCP_REDIRECT_HOSTS);
	assert.deepEqual(parseAllowedRedirectHosts(" , "), DEFAULT_MCP_REDIRECT_HOSTS);
	assert.deepEqual(parseAllowedRedirectHosts(" Claude.AI, example.com ,"), ["claude.ai", "example.com"]);
});

await test("Gerüst der Lambda mcp: 404 bei ausgeschaltetem Kill-Switch, sonst 501", async () => {
	const before = process.env.MCP_ENABLED;
	try {
		delete process.env.MCP_ENABLED;
		assert.equal((await mcpHandler({})).statusCode, 404);
		process.env.MCP_ENABLED = "false";
		assert.equal((await mcpHandler({})).statusCode, 404);
		process.env.MCP_ENABLED = "true";
		assert.equal((await mcpHandler({})).statusCode, 501);
	} finally {
		if (before === undefined) delete process.env.MCP_ENABLED;
		else process.env.MCP_ENABLED = before;
	}
});

console.log(`${passed} Tests bestanden`);
