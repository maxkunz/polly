import assert from "node:assert/strict";
import {
	API_RESOURCE_SERVER,
	API_SCOPES,
	API_SCOPE_DESCRIPTIONS,
	hasScope,
	parseRequestedScopes,
	parseScopeClaim,
	scopeString,
	toFullScope
} from "../amplify/functions/shared/api_scopes";
import { authorizeApiClient } from "../amplify/functions/shared/api_client_auth";
import type { ApiClientAuthDeps } from "../amplify/functions/shared/api_client_auth";

let passed = 0;
// Tests werden gesammelt und am Ende nacheinander ausgeführt (einige sind asynchron)
const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>): void {
	tests.push({ name, fn });
}

// ---------------------------------------------------------------------------
// Scopes (M2)
// ---------------------------------------------------------------------------

test("Scopes sind fest und haben das Präfix polly-api/", () => {
	assert.equal(API_RESOURCE_SERVER, "polly-api");
	assert.deepEqual([...API_SCOPES], ["reporting.read", "invitations.write", "surveys.read"]);
	assert.equal(toFullScope("reporting.read"), "polly-api/reporting.read");
	for (const scope of API_SCOPES) assert.ok(API_SCOPE_DESCRIPTIONS[scope]);
});

test("parseScopeClaim zerlegt den Claim an Leerzeichen und ignoriert andere Typen", () => {
	assert.deepEqual(parseScopeClaim("polly-api/reporting.read  polly-api/surveys.read"), [
		"polly-api/reporting.read",
		"polly-api/surveys.read"
	]);
	assert.deepEqual(parseScopeClaim(""), []);
	assert.deepEqual(parseScopeClaim(undefined), []);
	assert.deepEqual(parseScopeClaim(["polly-api/reporting.read"]), []);
});

test("hasScope verlangt den vollständigen Scope", () => {
	const claim = "polly-api/reporting.read polly-api/surveys.read";
	assert.equal(hasScope(claim, "polly-api/reporting.read"), true);
	assert.equal(hasScope(claim, "polly-api/invitations.write"), false);
	// ohne Präfix, mit anderem Resource Server oder als Teilstring zählt nicht
	assert.equal(hasScope("reporting.read", "polly-api/reporting.read"), false);
	assert.equal(hasScope("other/reporting.read", "polly-api/reporting.read"), false);
	assert.equal(hasScope("polly-api/reporting.readwrite", "polly-api/reporting.read"), false);
	// Client der Data Action
	assert.equal(hasScope("backend/invoke", "polly-api/reporting.read"), false);
});

test("parseRequestedScopes erlaubt nur bekannte Scopes ohne Präfix", () => {
	assert.deepEqual(parseRequestedScopes(["surveys.read", "reporting.read", "surveys.read"]), {
		ok: true,
		scopes: ["reporting.read", "surveys.read"]
	});
	for (const input of [undefined, null, "reporting.read", [], {}]) {
		assert.equal(parseRequestedScopes(input).ok, false, JSON.stringify(input));
	}
	for (const input of [["polly-api/reporting.read"], ["reporting.read", "admin"], ["backend/invoke"], [1]]) {
		assert.equal(parseRequestedScopes(input).ok, false, JSON.stringify(input));
	}
});

test("scopeString liefert den Scope-String für den Token-Abruf", () => {
	assert.equal(scopeString(["reporting.read", "invitations.write"]), "polly-api/reporting.read polly-api/invitations.write");
});

// ---------------------------------------------------------------------------
// Anmeldung: Reihenfolge der Prüfungen in authorizeApiClient (M2)
// ---------------------------------------------------------------------------

function fakeDeps(
	clients: Record<string, { tenantId: string; status: "ACTIVE" | "DELETING" }>,
	approvedTenants: string[]
): ApiClientAuthDeps & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		loadApiClient: async (clientId) => {
			calls.push(`client:${clientId}`);
			return clients[clientId];
		},
		isTenantApproved: async (tenantId) => {
			calls.push(`tenant:${tenantId}`);
			return approvedTenants.includes(tenantId);
		}
	};
}

const activeClient = { "client-1": { tenantId: "tenant-1", status: "ACTIVE" as const } };

test("authorizeApiClient liefert Mandant und Client bei passendem Scope", async () => {
	const deps = fakeDeps(activeClient, ["tenant-1"]);
	const result = await authorizeApiClient(
		{ client_id: "client-1", scope: "polly-api/reporting.read polly-api/surveys.read" },
		"polly-api/surveys.read",
		deps
	);
	assert.deepEqual(result, { ok: true, tenantId: "tenant-1", clientId: "client-1" });
});

test("authorizeApiClient: fehlender Scope ergibt 403 ohne Tabellenzugriff", async () => {
	const deps = fakeDeps(activeClient, ["tenant-1"]);
	const result = await authorizeApiClient(
		{ client_id: "client-1", scope: "polly-api/reporting.read" },
		"polly-api/invitations.write",
		deps
	);
	assert.equal(result.ok, false);
	assert.equal(!result.ok && result.statusCode, 403);
	assert.equal(!result.ok && result.error, "insufficient_scope");
	assert.deepEqual(deps.calls, []);
});

test("authorizeApiClient: Data-Action-Client (backend/invoke) wird abgelehnt", async () => {
	const deps = fakeDeps(activeClient, ["tenant-1"]);
	const result = await authorizeApiClient({ client_id: "client-1", scope: "backend/invoke" }, "polly-api/reporting.read", deps);
	assert.equal(!result.ok && result.statusCode, 403);
});

test("authorizeApiClient: unbekannter oder gesperrter Client ergibt 403", async () => {
	const deps = fakeDeps({ "client-2": { tenantId: "tenant-1", status: "DELETING" } }, ["tenant-1"]);
	for (const clientId of ["client-unknown", "client-2"]) {
		const result = await authorizeApiClient({ client_id: clientId, scope: "polly-api/reporting.read" }, "polly-api/reporting.read", deps);
		assert.equal(!result.ok && result.statusCode, 403, clientId);
		assert.equal(!result.ok && result.error, "access_denied", clientId);
	}
	assert.deepEqual(deps.calls, ["client:client-unknown", "client:client-2"]);
});

test("authorizeApiClient: Mandant nicht APPROVED ergibt 403", async () => {
	const deps = fakeDeps(activeClient, []);
	const result = await authorizeApiClient({ client_id: "client-1", scope: "polly-api/reporting.read" }, "polly-api/reporting.read", deps);
	assert.equal(!result.ok && result.statusCode, 403);
	assert.equal(!result.ok && result.error, "access_denied");
	assert.deepEqual(deps.calls, ["client:client-1", "tenant:tenant-1"]);
});

test("authorizeApiClient: Token ohne client_id ergibt 401", async () => {
	const deps = fakeDeps(activeClient, ["tenant-1"]);
	const result = await authorizeApiClient({ scope: "polly-api/reporting.read" }, "polly-api/reporting.read", deps);
	assert.equal(!result.ok && result.statusCode, 401);
	assert.equal(!result.ok && result.error, "invalid_token");
});

async function main(): Promise<void> {
	for (const { name, fn } of tests) {
		try {
			await fn();
			passed++;
			console.log(`ok - ${name}`);
		} catch (error) {
			console.error(`FAIL - ${name}`);
			throw error;
		}
	}
	console.log(`\n${passed} Tests bestanden`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
