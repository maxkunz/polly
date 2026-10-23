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
import { compareAnswerRecords, sessionToAnswerRecords } from "../amplify/functions/shared/answer_records";
import type { AnswerRecord } from "../amplify/functions/shared/answer_records";
import { paginate } from "../amplify/functions/reporting_api/pagination";
import { buildV1DataResponse, MAX_LIMIT, parseV1DataParams, toV1Record } from "../amplify/functions/reporting_api/v1";
import { handler as reportingHandler } from "../amplify/functions/reporting_api/handler";

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

// ---------------------------------------------------------------------------
// Reporting (M3)
// ---------------------------------------------------------------------------

const SURVEY_ID = "123e4567-e89b-12d3-a456-426614174000";
const validQuery = { surveyId: SURVEY_ID, from: "2026-10-01T00:00:00", to: "2026-10-02T00:00:00" };

function parseOk(query: Record<string, unknown>) {
	const result = parseV1DataParams(query);
	assert.equal(result.ok, true, JSON.stringify(result));
	return result.ok ? result.params : (undefined as never);
}

function parseError(query: Record<string, unknown>): string {
	const result = parseV1DataParams(query);
	assert.equal(result.ok, false);
	return result.ok ? "" : result.message;
}

test("Reporting-Parameter: Defaults und exklusives to", () => {
	const params = parseOk(validQuery);
	assert.equal(params.surveyId, SURVEY_ID);
	assert.equal(params.fromIso, "2026-10-01T00:00:00.000Z");
	// to ist exklusiv: BETWEEN bekommt to − 1 ms
	assert.equal(params.toIso, "2026-10-01T23:59:59.999Z");
	assert.equal(params.page, 1);
	assert.equal(params.limit, 1000);
	assert.equal(params.version, undefined);
});

test("Reporting-Parameter: surveyId ist Pflicht und eine UUID", () => {
	assert.match(parseError({ ...validQuery, surveyId: undefined }), /surveyId/);
	assert.match(parseError({ ...validQuery, surveyId: "abc" }), /UUID/);
	assert.match(parseError({}), /surveyId/);
	assert.match(parseError(null as never), /surveyId/);
});

test("Reporting-Parameter: strenges Datumsformat", () => {
	// Auf "format" prüfen: "from" allein träfe auch die Fehler zum Zeitraum
	assert.match(parseError({ ...validQuery, from: "2026-10-01T00:00:00Z" }), /^from must have the format/);
	assert.match(parseError({ ...validQuery, from: "2026-10-01T00:00" }), /^from must have the format/);
	assert.match(parseError({ ...validQuery, from: "2026-10-01" }), /^from must have the format/);
	assert.match(parseError({ ...validQuery, from: "2026-02-31T00:00:00" }), /^from must have the format/);
	assert.match(parseError({ ...validQuery, from: "2026-10-01T24:00:00" }), /^from must have the format/);
	assert.match(parseError({ ...validQuery, from: "2026-10-01T23:59:60" }), /^from must have the format/);
	assert.match(parseError({ ...validQuery, to: "2026-02-29T00:00:00" }), /^to must have the format/);
	assert.match(parseError({ ...validQuery, to: "2026-10-01T00:00:00.000" }), /^to must have the format/);
	assert.equal(parseOk({ ...validQuery, from: "2028-02-28T12:00:00", to: "2028-02-29T12:00:00" }).toIso, "2028-02-29T11:59:59.999Z");
	assert.match(parseError({ ...validQuery, from: undefined }), /from.*required/);
	assert.match(parseError({ ...validQuery, to: "" }), /to.*required/);
});

test("Reporting-Parameter: to muss nach from liegen, höchstens 24 h", () => {
	assert.match(parseError({ ...validQuery, to: validQuery.from }), /after/);
	assert.match(parseError({ ...validQuery, to: "2026-09-30T00:00:00" }), /after/);
	parseOk({ ...validQuery, to: "2026-10-02T00:00:00" });
	assert.match(parseError({ ...validQuery, to: "2026-10-02T00:00:01" }), /24 hours/);
	const oneSecond = parseOk({ ...validQuery, to: "2026-10-01T00:00:01" });
	assert.equal(oneSecond.toIso, "2026-10-01T00:00:00.999Z");
});

test("Reporting-Parameter: page, limit und version", () => {
	assert.equal(parseOk({ ...validQuery, page: "3", limit: "50", version: "2" }).page, 3);
	assert.equal(parseOk({ ...validQuery, limit: "50" }).limit, 50);
	assert.equal(parseOk({ ...validQuery, version: "2" }).version, 2);
	// über 1000 wird auf 1000 begrenzt
	assert.equal(parseOk({ ...validQuery, limit: "5000" }).limit, MAX_LIMIT);
	// leere Werte zählen als nicht angegeben
	assert.equal(parseOk({ ...validQuery, page: "", limit: " " }).page, 1);
	for (const bad of ["0", "-1", "1.5", "abc", "1e3"]) {
		assert.match(parseError({ ...validQuery, page: bad }), /page/);
		assert.match(parseError({ ...validQuery, limit: bad }), /limit/);
	}
	assert.match(parseError({ ...validQuery, version: "1.5" }), /version/);
	assert.match(parseError({ ...validQuery, version: "x" }), /version/);
});

test("paginate: Seiten, leere Seite hinter dem Ende und total = 0", () => {
	const items = [1, 2, 3, 4, 5];
	const first = paginate(items, 1, 2);
	assert.deepEqual(first.items, [1, 2]);
	assert.deepEqual(first.pageInfo, {
		page: 1,
		limit: 2,
		total: 5,
		totalPages: 3,
		hasPreviousPage: false,
		hasNextPage: true
	});
	const last = paginate(items, 3, 2);
	assert.deepEqual(last.items, [5]);
	assert.equal(last.pageInfo.hasNextPage, false);
	assert.equal(last.pageInfo.hasPreviousPage, true);

	const beyond = paginate(items, 9, 2);
	assert.deepEqual(beyond.items, []);
	assert.equal(beyond.pageInfo.total, 5);
	assert.equal(beyond.pageInfo.hasNextPage, false);

	const empty = paginate([], 1, 1000);
	assert.deepEqual(empty.items, []);
	assert.deepEqual(empty.pageInfo, {
		page: 1,
		limit: 1000,
		total: 0,
		totalPages: 0,
		hasPreviousPage: false,
		hasNextPage: false
	});
});

test("sessionToAnswerRecords: Flow- und Web-Sitzung", () => {
	const flow = sessionToAnswerRecords({
		responseId: "conv-1",
		surveyId: SURVEY_ID,
		surveyName: "Umfrage_123e4567",
		surveyVersion: 3,
		status: "completed",
		startedAt: "2026-10-01T10:00:00.000Z",
		answers: {
			q2: { type: "nps", value: 9, answeredAt: "2026-10-01T10:00:20.000Z" },
			q1: { type: "yes_no", value: false, answeredAt: "2026-10-01T10:00:10.000Z" }
		}
	});
	assert.deepEqual(
		flow.map((r) => r.questionId),
		["q1", "q2"]
	);
	assert.equal(flow[0].conversationId, "conv-1");
	assert.equal(flow[0].channel, "flow");
	assert.equal(flow[0].value, false);
	assert.equal(flow[0].sessionStartedAt, "2026-10-01T10:00:00.000Z");

	const web = sessionToAnswerRecords({ responseId: "r-2", channel: "web", answers: { q1: { value: "x" } } });
	assert.equal(web[0].conversationId, null);
	assert.equal(web[0].channel, "web");

	assert.deepEqual(sessionToAnswerRecords({ responseId: "r-3" }), []);
});

test("compareAnswerRecords sortiert nach Sitzungsstart, responseId, answeredAt, questionId", () => {
	const base = { value: 1, channel: "flow", conversationId: null };
	const records: AnswerRecord[] = [
		{ ...base, responseId: "b", questionId: "q1", sessionStartedAt: "2", answeredAt: "1" },
		{ ...base, responseId: "a", questionId: "q2", sessionStartedAt: "2", answeredAt: "2" },
		{ ...base, responseId: "a", questionId: "q1", sessionStartedAt: "2", answeredAt: "2" },
		{ ...base, responseId: "z", questionId: "q9", sessionStartedAt: "1", answeredAt: "9" },
		{ ...base, responseId: "a", questionId: "q0", sessionStartedAt: "2", answeredAt: "1" }
	];
	records.sort(compareAnswerRecords);
	assert.deepEqual(
		records.map((r) => `${r.responseId}:${r.questionId}`),
		["z:q9", "a:q0", "a:q1", "a:q2", "b:q1"]
	);

	// Code-Unit-Reihenfolge statt Collation: Großbuchstaben vor Kleinbuchstaben
	const mixed: AnswerRecord[] = [
		{ ...base, responseId: "a", questionId: "q", sessionStartedAt: "1", answeredAt: "1" },
		{ ...base, responseId: "B", questionId: "q", sessionStartedAt: "1", answeredAt: "1" }
	];
	mixed.sort(compareAnswerRecords);
	assert.deepEqual(mixed.map((r) => r.responseId), ["B", "a"]);
});

test("toV1Record gibt feste Felder aus, interne Zusatzfelder erscheinen nicht", () => {
	const record = {
		responseId: "r",
		conversationId: "r",
		surveyId: SURVEY_ID,
		surveyName: "n",
		surveyVersion: 1,
		questionId: "q",
		questionType: "rating",
		answeredAt: "t",
		value: 5,
		status: "completed",
		channel: "flow",
		sessionStartedAt: "s",
		internalField: "geheim"
	} as AnswerRecord;
	const v1 = toV1Record(record);
	assert.deepEqual(Object.keys(v1), [
		"responseId",
		"conversationId",
		"surveyId",
		"surveyName",
		"surveyVersion",
		"questionId",
		"questionType",
		"answeredAt",
		"value",
		"status",
		"channel",
		"sessionStartedAt"
	]);
	assert.equal(v1.value, 5);

	const response = buildV1DataResponse([record], paginate([record], 1, 10).pageInfo);
	assert.deepEqual(Object.keys(response), ["data", "pagination"]);
	assert.deepEqual(Object.keys(response.pagination), [
		"page",
		"limit",
		"total",
		"totalPages",
		"hasPreviousPage",
		"hasNextPage"
	]);
	assert.equal(JSON.stringify(response).includes("geheim"), false);
});

// ---------------------------------------------------------------------------
// Routing (M3)
// ---------------------------------------------------------------------------

test("Reporting-Handler: unbekannte Routen ergeben 404 im Fehlerformat", async () => {
	for (const routeKey of ["GET /ext/v2/reporting/data", "POST /ext/v1/reporting/data", undefined]) {
		const result = await reportingHandler({ routeKey });
		assert.equal(result.statusCode, 404);
		assert.equal(JSON.parse(result.body).error, "not_found");
	}
});

test("Reporting-Handler: ohne Token ergibt 401", async () => {
	const result = await reportingHandler({ routeKey: "GET /ext/v1/reporting/data", headers: {} });
	assert.equal(result.statusCode, 401);
	assert.equal(JSON.parse(result.body).error, "invalid_token");
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
