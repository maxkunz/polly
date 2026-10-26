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
import { compareAnswerRecords, sessionToAnswerRecords, toSurveyVersion } from "../amplify/functions/shared/answer_records";
import type { AnswerRecord } from "../amplify/functions/shared/answer_records";
import { paginate } from "../amplify/functions/reporting_api/pagination";
import {
	buildV1DataResponse,
	MAX_LIMIT,
	MAX_SUMMARY_RANGE_MS,
	parseV1DataParams,
	parseV1SummaryParams,
	toV1Record,
	toV1Summary
} from "../amplify/functions/reporting_api/v1";
import { addToSummary, createSummary, openSlices, SUMMARY_SLICE_COUNT, summarizeSlice, summarizeSlices } from "../amplify/functions/shared/session_summary";
import { handler as reportingHandler } from "../amplify/functions/reporting_api/handler";
import { buildV1Response, parseV1InvitationRequest, toV1InviteUrl } from "../amplify/functions/invitations/ext_v1";
import { handler as invitationsHandler } from "../amplify/functions/invitations/handler";
import { listProdSurveys } from "../amplify/functions/shared/genesys_survey_check";
import { handler as surveysHandler } from "../amplify/functions/surveys_api/handler";
import {
	buildV1ListResponse,
	isPlaceholderCondition,
	splitSynonyms,
	toV1Question,
	toV1SurveyDetail,
	toV1SurveySummary
} from "../amplify/functions/surveys_api/v1";
import { defaultWebThemeTokens } from "../src/domain/webTheme/webTheme";
import type { FlowSurvey } from "../src/domain/survey/flowTypes";
import { createInvitationKey, signInvitation } from "../amplify/functions/shared/invitation_token";
import { BASE_URL_MAX_CHARS, buildInvitationUrl, INVITATION_COUNT_MAX } from "../src/domain/survey/invitationLinks";

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
		loadApprovedTenant: async (tenantId) => {
			calls.push(`tenant:${tenantId}`);
			return approvedTenants.includes(tenantId) ? { tenantId, status: "APPROVED" } : undefined;
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
	assert.deepEqual(result, {
		ok: true,
		tenantId: "tenant-1",
		clientId: "client-1",
		tenant: { tenantId: "tenant-1", status: "APPROVED" }
	});
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

// ---------------------------------------------------------------------------
// Summary (M7)
// ---------------------------------------------------------------------------

const SUMMARY_SURVEY_ID = "123e4567-e89b-42d3-a456-426614174000";

test("Summary-Parameter: gültige Anfrage, to ist exklusiv, from/to wie angefragt", () => {
	const result = parseV1SummaryParams({ surveyId: SUMMARY_SURVEY_ID, from: "2026-10-01T00:00:00", to: "2026-10-02T00:00:00" });
	assert.ok(result.ok);
	assert.equal(result.params.fromIso, "2026-10-01T00:00:00.000Z");
	assert.equal(result.params.toIso, "2026-10-01T23:59:59.999Z");
	assert.equal(result.params.from, "2026-10-01T00:00:00");
	assert.equal(result.params.version, undefined);
});

test("Summary-Parameter: bis 31 Tage, darüber 400", () => {
	const ok = parseV1SummaryParams({ surveyId: SUMMARY_SURVEY_ID, from: "2026-09-01T00:00:00", to: "2026-10-02T00:00:00" });
	assert.ok(ok.ok);
	assert.equal(MAX_SUMMARY_RANGE_MS, 31 * 24 * 60 * 60 * 1000);
	const tooLong = parseV1SummaryParams({ surveyId: SUMMARY_SURVEY_ID, from: "2026-09-01T00:00:00", to: "2026-10-02T00:00:01" });
	assert.ok(!tooLong.ok);
	assert.match(tooLong.message, /31 days/);
});

test("Summary-Parameter: Pflichtfelder, Format, Reihenfolge und version", () => {
	const base = { surveyId: SUMMARY_SURVEY_ID, from: "2026-10-01T00:00:00", to: "2026-10-02T00:00:00" };
	assert.ok(!parseV1SummaryParams({ ...base, surveyId: undefined }).ok);
	assert.ok(!parseV1SummaryParams({ ...base, surveyId: "x" }).ok);
	assert.ok(!parseV1SummaryParams({ ...base, from: "2026-10-01" }).ok);
	assert.ok(!parseV1SummaryParams({ ...base, to: undefined }).ok);
	assert.ok(!parseV1SummaryParams({ ...base, to: base.from }).ok);
	assert.ok(!parseV1SummaryParams({ ...base, version: "1.5" }).ok);
	const withVersion = parseV1SummaryParams({ ...base, version: "3" });
	assert.ok(withVersion.ok);
	assert.equal(withVersion.params.version, 3);
	assert.ok(parseV1SummaryParams({ ...base, version: "" }).ok);
});

test("addToSummary zählt den Kanal, fehlender Kanal ist flow", () => {
	const summary = createSummary();
	addToSummary(summary, { responseId: "1", channel: "web" });
	addToSummary(summary, { responseId: "2" });
	addToSummary(summary, { responseId: "3", channel: "" });
	assert.deepEqual(summary.channels, { web: 1, flow: 2 });
});

test("Version: fehlend, null und Unlesbares zählen als 1, Ganzzahl-Strings als Zahl", () => {
	assert.equal(toSurveyVersion(undefined), 1);
	assert.equal(toSurveyVersion(null), 1);
	assert.equal(toSurveyVersion(""), 1);
	assert.equal(toSurveyVersion("abc"), 1);
	assert.equal(toSurveyVersion(1.5), 1);
	assert.equal(toSurveyVersion("3"), 3);
	assert.equal(toSurveyVersion(" 4 "), 4);
	assert.equal(toSurveyVersion(0), 0);
	assert.equal(toSurveyVersion(7), 7);

	const summary = createSummary();
	addToSummary(summary, { responseId: "1", surveyVersion: "3" });
	addToSummary(summary, { responseId: "2", surveyVersion: null });
	addToSummary(summary, { responseId: "3" });
	assert.deepEqual(summary.versions, { "3": 1, "1": 2 });

	const [record] = sessionToAnswerRecords({ responseId: "4", surveyVersion: null, answers: { q: { value: 1 } } });
	assert.equal(record.surveyVersion, 1);
});

test("toV1Summary gibt feste Felder aus, version ohne Parameter ist null", () => {
	const summary = createSummary();
	addToSummary(summary, { responseId: "1", status: "completed", surveyVersion: 2, channel: "web" });
	const params = { surveyId: SUMMARY_SURVEY_ID, from: "a", to: "b", fromIso: "", toIso: "" };
	const response = toV1Summary(params, summary);
	assert.deepEqual(Object.keys(response), [
		"surveyId",
		"from",
		"to",
		"version",
		"sessions",
		"statusCounts",
		"channelCounts",
		"versionCounts"
	]);
	assert.equal(response.version, null);
	assert.deepEqual(response.channelCounts, { web: 1 });
	assert.deepEqual(response.versionCounts, { "2": 1 });
	assert.equal(toV1Summary({ ...params, version: 2 }, summary).version, 2);
});

test("summarizeSlice: fertiger Abschnitt bleibt unberührt, ohne Zeitbudget kein Lesen und nicht fertig", async () => {
	const summary = createSummary();
	const done = { from: "a", to: "b", done: true };
	assert.equal(await summarizeSlice("t", SUMMARY_SURVEY_ID, done, summary, () => true), done);
	const open = { from: "a", to: "b", done: false };
	const result = await summarizeSlice("t", SUMMARY_SURVEY_ID, open, summary, () => false);
	assert.equal(result.done, false);
	assert.equal(summary.sessions, 0);
});

test("openSlices legt SUMMARY_SLICE_COUNT offene Abschnitte an, summarizeSlices lässt fertige unberührt", async () => {
	assert.ok(Number.isInteger(SUMMARY_SLICE_COUNT) && SUMMARY_SLICE_COUNT > 0);
	const slices = openSlices("2026-10-01T00:00:00.000Z", "2026-10-31T23:59:59.999Z");
	assert.equal(slices.length, SUMMARY_SLICE_COUNT);
	assert.ok(slices.every((slice) => !slice.done));
	const done = slices.map((slice) => ({ ...slice, done: true }));
	assert.deepEqual(await summarizeSlices("t", SUMMARY_SURVEY_ID, done, createSummary(), () => true), done);
});

test("Reporting-Handler: /summary ohne Token ergibt 401", async () => {
	const result = await reportingHandler({ routeKey: "GET /ext/v1/reporting/summary", headers: {} });
	assert.equal(result.statusCode, 401);
	assert.equal(JSON.parse(result.body).error, "invalid_token");
});

// ---------------------------------------------------------------------------
// Einladungen (M4)
// ---------------------------------------------------------------------------

const INVITE_SURVEY_ID = "123e4567-e89b-42d3-a456-426614174000";
// 2026-10-23T12:00:00Z
const INVITE_NOW = Date.UTC(2026, 9, 23, 12, 0, 0) / 1000;

function inviteBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { survey_uuid: INVITE_SURVEY_ID, amount: 100, is_multi: false, expiration_date: "2026-12-31", ...overrides };
}

test("Einladungs-Request: gültiger Body wird auf InvitationRequest abgebildet, Ablauf = Tagesende UTC", () => {
	const result = parseV1InvitationRequest(inviteBody(), INVITE_NOW);
	assert.ok(result.ok);
	assert.deepEqual(result.request, {
		surveyId: INVITE_SURVEY_ID,
		count: 100,
		multi: false,
		exp: Date.UTC(2026, 11, 31, 23, 59, 59) / 1000
	});
});

test("Einladungs-Request: survey_uuid in Großbuchstaben wird kleingeschrieben", () => {
	const result = parseV1InvitationRequest(inviteBody({ survey_uuid: INVITE_SURVEY_ID.toUpperCase() }), INVITE_NOW);
	assert.ok(result.ok);
	assert.equal(result.request.surveyId, INVITE_SURVEY_ID);
});

test("Einladungs-Request: Meldungen nennen die v1-Feldnamen", () => {
	const cases: Array<[Record<string, unknown>, string]> = [
		[{ survey_uuid: "nope" }, "survey_uuid"],
		[{ amount: 0 }, "amount"],
		[{ is_multi: "true" }, "is_multi"],
		[{ expiration_date: "2026-10-22" }, "expiration_date"],
		[{ expiration_date: "31.12.2026" }, "expiration_date"]
	];
	for (const [overrides, field] of cases) {
		const result = parseV1InvitationRequest(inviteBody(overrides), INVITE_NOW);
		assert.ok(!result.ok && result.message.startsWith(`${field} `), JSON.stringify(overrides));
	}
});

test("Einladungs-Request: ohne expiration_date kein exp, auch bei null", () => {
	for (const body of [inviteBody({ expiration_date: undefined }), inviteBody({ expiration_date: null })]) {
		const result = parseV1InvitationRequest(body, INVITE_NOW);
		assert.ok(result.ok);
		assert.deepEqual(result.request, { surveyId: INVITE_SURVEY_ID, count: 100, multi: false });
	}
});

test("Einladungs-Request: Pflichtfelder und Typen", () => {
	for (const body of [null, [], "x", 1]) assert.equal(parseV1InvitationRequest(body, INVITE_NOW).ok, false);
	assert.equal(parseV1InvitationRequest(inviteBody({ survey_uuid: undefined }), INVITE_NOW).ok, false);
	assert.equal(parseV1InvitationRequest(inviteBody({ survey_uuid: "nope" }), INVITE_NOW).ok, false);
	assert.equal(parseV1InvitationRequest(inviteBody({ amount: undefined }), INVITE_NOW).ok, false);
	assert.equal(parseV1InvitationRequest(inviteBody({ is_multi: undefined }), INVITE_NOW).ok, false);
	assert.equal(parseV1InvitationRequest(inviteBody({ is_multi: "true" }), INVITE_NOW).ok, false);
});

test("Einladungs-Request: amount nur ganzzahlig von 1 bis 5000", () => {
	for (const amount of [0, -1, 5001, 1.5, "10", null, Number.NaN]) {
		assert.equal(parseV1InvitationRequest(inviteBody({ amount }), INVITE_NOW).ok, false, String(amount));
	}
	for (const amount of [1, INVITATION_COUNT_MAX]) {
		assert.equal(parseV1InvitationRequest(inviteBody({ amount }), INVITE_NOW).ok, true, String(amount));
	}
});

test("Einladungs-Request: Datumsformat, vergangener Tag, heute", () => {
	for (const expiration_date of ["2026-12-31T00:00:00", "31.12.2026", "2026-1-5", "2026-02-31", "2026-13-01", 20261231, ""]) {
		assert.equal(parseV1InvitationRequest(inviteBody({ expiration_date }), INVITE_NOW).ok, false, String(expiration_date));
	}
	const past = parseV1InvitationRequest(inviteBody({ expiration_date: "2026-10-22" }), INVITE_NOW);
	assert.equal(past.ok, false);
	const today = parseV1InvitationRequest(inviteBody({ expiration_date: "2026-10-23" }), INVITE_NOW);
	assert.ok(today.ok);
	assert.equal(today.request.exp, Date.UTC(2026, 9, 23, 23, 59, 59) / 1000);
});

test("Linkaufbau für fullLink: {token}, ?/&token=, Fallback /s/<jwt>", () => {
	const origin = "https://main.abc.amplifyapp.com/";
	assert.equal(buildInvitationUrl("https://kunde.de/p/{token}/x", "J", origin), "https://kunde.de/p/J/x");
	assert.equal(buildInvitationUrl("https://kunde.de/p", "J", origin), "https://kunde.de/p?token=J");
	assert.equal(buildInvitationUrl("https://kunde.de/p?a=1", "J", origin), "https://kunde.de/p?a=1&token=J");
	assert.equal(buildInvitationUrl(undefined, "J", origin), "https://main.abc.amplifyapp.com/s/J");
	assert.equal(buildInvitationUrl("  ", "J", origin), "https://main.abc.amplifyapp.com/s/J");
});

test("toV1InviteUrl gibt feste Felder aus, interne Zusatzfelder erscheinen nicht", () => {
	const exp = Date.UTC(2026, 11, 31, 23, 59, 59) / 1000;
	const item = toV1InviteUrl({ jwt: "J", fullLink: "https://x/s/J", exp, multi: true, secret: "intern" } as any);
	assert.deepEqual(item, { inviteToken: "J", fullLink: "https://x/s/J", expiration_date: "2026-12-31", is_multi: true });
	assert.deepEqual(Object.keys(item), ["inviteToken", "fullLink", "expiration_date", "is_multi"]);
	assert.equal(toV1InviteUrl({ jwt: "J", fullLink: "L", multi: false }).expiration_date, null);
	assert.deepEqual(Object.keys(buildV1Response([item])), ["inviteUrls"]);
});

test("Antwortgröße bei 5000 Einträgen bleibt unter dem Limit von 6 MB", () => {
	const key = createInvitationKey("k".repeat(64));
	const exp = Date.UTC(2026, 11, 31, 23, 59, 59) / 1000;
	const inviteUrls = Array.from({ length: INVITATION_COUNT_MAX }, (_, i) => {
		const jwt = signInvitation(
			{ tenant_id: "t".repeat(36), survey_id: INVITE_SURVEY_ID, token_id: `${INVITE_SURVEY_ID}`, multi: i % 2 === 0, iat: INVITE_NOW, exp },
			key,
			INVITE_NOW
		);
		// längste zulässige Basis-URL: Token steht zweimal in der Antwort (inviteToken und fullLink)
		const baseUrl = "https://kunde.example.com/" + "u".repeat(BASE_URL_MAX_CHARS - 26);
		return toV1InviteUrl({ jwt, fullLink: buildInvitationUrl(baseUrl, jwt, ""), exp, multi: i % 2 === 0 });
	});
	const bytes = Buffer.byteLength(JSON.stringify(buildV1Response(inviteUrls)), "utf8");
	assert.ok(bytes < 5.5 * 1024 * 1024, `Antwort hat ${bytes} Bytes`);
});

test("Einladungs-Handler: unbekannte Kunden-Routen ergeben 404 im Fehlerformat", async () => {
	for (const routeKey of ["POST /ext/v2/invitations", "GET /ext/v1/invitations"]) {
		const result = await invitationsHandler({ routeKey });
		assert.equal(result.statusCode, 404);
		assert.equal(JSON.parse(result.body).error, "not_found");
	}
});

test("Einladungs-Handler: Kunden-Routen nur über routeKey, nicht über den Pfad", async () => {
	const result = await invitationsHandler({
		routeKey: "$default",
		requestContext: { http: { method: "POST", path: "/ext/v1/invitations" } },
		headers: {}
	});
	assert.equal(result.statusCode, 404);
	assert.equal(JSON.parse(result.body).error, undefined);
});

test("Einladungs-Handler: Kunden-Route ohne Token ergibt 401", async () => {
	const result = await invitationsHandler({ routeKey: "POST /ext/v1/invitations", headers: {} });
	assert.equal(result.statusCode, 401);
	assert.equal(JSON.parse(result.body).error, "invalid_token");
});

test("Einladungs-Handler: App-Routen bleiben unverändert (ohne Token 401 unauthorized)", async () => {
	const result = await invitationsHandler({
		routeKey: "POST /invitations",
		requestContext: { http: { method: "POST", path: "/invitations" } },
		headers: {}
	});
	assert.equal(result.statusCode, 401);
	assert.equal(JSON.parse(result.body).code, "unauthorized");
});

// ---------------------------------------------------------------------------
// Umfragedetails (M5)
// ---------------------------------------------------------------------------

// Fixture nach survey_translator_for_flow.md: alle fünf Fragetypen, Platzhalter-Bedingung bei nps
const DETAIL_SURVEY_ID = "90f142be-4066-43cd-abef-31a426421b77";

function flowSurveyFixture(): FlowSurvey {
	const base = { description: "", reprompt: "", mandatory: false, default_next_question_id: "q-comment" };
	return {
		id: DETAIL_SURVEY_ID,
		name: "kundenzufriedenheit_90f142be",
		title: "Kundenzufriedenheit",
		description: "Kurze Umfrage",
		greeting_prompt: "Hallo",
		closing_prompt: "Danke",
		language: "en",
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-02-03T10:00:00.000Z",
		start_question_id: "q-yesno",
		version: 3,
		type: "Flow",
		questions: [
			{
				...base,
				id: "q-yesno",
				name: "geklaert_q-yesno",
				type: "yes_no",
				prompt: "Geklärt?",
				reprompt: "Bitte ja oder nein",
				mandatory: true,
				options: { yes_next_question_id: null, no_next_question_id: "q-comment" }
			},
			{
				...base,
				id: "q-choice",
				name: "kanal_q-choice",
				type: "choice",
				prompt: "Kanal?",
				labels: ["Telefon", "Mail", "Chat"],
				synonyms: ["Anruf; Hotline", "", "Messenger;  "],
				next_question_ids: ["q-rating", null, "q-nps"]
			},
			{
				...base,
				id: "q-rating",
				name: "zufriedenheit_q-rating",
				type: "rating",
				prompt: "Zufriedenheit?",
				options: { values: [1, 2, 3, 4, 5], min_value: 1, max_value: 5, min_label: "schlecht" },
				conditional_next_question: [
					{ operator: "equals", value: -1, next_question_id: null },
					{ operator: "less_than", value: 3, next_question_id: "q-comment" },
					{ operator: "greater_than", value: 1000, next_question_id: null }
				]
			},
			{
				...base,
				id: "q-nps",
				name: "empfehlung_q-nps",
				type: "nps",
				prompt: "Weiterempfehlen?",
				options: { max_label: "sehr wahrscheinlich" },
				conditional_next_question: [
					{ operator: "equals", value: -1, next_question_id: null },
					{ operator: "less_than", value: 7, next_question_id: "q-comment" },
					{ operator: "greater_than", value: 8, next_question_id: "q-comment" }
				]
			},
			{ ...base, id: "q-comment", name: "", type: "comment", prompt: "Anmerkung?", default_next_question_id: null }
		]
	};
}

test("v1-Umfrage: feste Feldlisten für Umfrage und Fragen", () => {
	const detail = toV1SurveyDetail(flowSurveyFixture(), undefined, undefined);
	assert.deepEqual(Object.keys(detail), [
		"surveyId", "name", "title", "description", "version", "updatedAt", "language",
		"greeting", "closing", "startQuestionId", "baseUrl", "webTheme", "questions"
	]);
	const keys = (index: number) => Object.keys(detail.questions[index]);
	const common = ["id", "questionId", "type", "text", "description", "reprompt", "mandatory", "defaultNextQuestionId"];
	assert.deepEqual(keys(0), [...common, "yesNextQuestionId", "noNextQuestionId"]);
	assert.deepEqual(keys(1), [...common, "options"]);
	assert.deepEqual(keys(2), [...common, "scale", "conditions"]);
	assert.deepEqual(keys(3), [...common, "scale", "conditions"]);
	assert.deepEqual(keys(4), common);
});

test("v1-Umfrage: Kopffelder, Standardwerte und questionId", () => {
	const detail = toV1SurveyDetail(flowSurveyFixture(), "https://kunde.example.com/s", undefined);
	assert.equal(detail.surveyId, DETAIL_SURVEY_ID);
	assert.equal(detail.version, 3);
	assert.equal(detail.updatedAt, "2026-02-03T10:00:00.000Z");
	assert.equal(detail.language, "en");
	assert.equal(detail.greeting, "Hallo");
	assert.equal(detail.startQuestionId, "q-yesno");
	assert.equal(detail.baseUrl, "https://kunde.example.com/s");
	assert.equal(detail.webTheme, null);
	// questionId = technischer Name (Reporting-Schlüssel), ohne Namen die ID
	assert.deepEqual(detail.questions.map((q) => q.questionId), [
		"geklaert_q-yesno", "kanal_q-choice", "zufriedenheit_q-rating", "empfehlung_q-nps", "q-comment"
	]);
	assert.equal(detail.questions[0].id, "q-yesno");

	const old = { ...flowSurveyFixture(), language: undefined, version: undefined, updated_at: undefined } as FlowSurvey;
	const summary = toV1SurveySummary(old);
	assert.equal(summary.language, "de");
	assert.equal(summary.version, 0);
	assert.equal(summary.updatedAt, null);
});

test("v1-Umfrage: yes_no, choice mit Synonymen als Array", () => {
	const [yesNo, choice] = flowSurveyFixture().questions.map(toV1Question) as any[];
	assert.equal(yesNo.mandatory, true);
	assert.equal(yesNo.yesNextQuestionId, null);
	assert.equal(yesNo.noNextQuestionId, "q-comment");
	assert.deepEqual(choice.options, [
		{ label: "Telefon", synonyms: ["Anruf", "Hotline"], nextQuestionId: "q-rating" },
		{ label: "Mail", synonyms: [], nextQuestionId: null },
		{ label: "Chat", synonyms: ["Messenger"], nextQuestionId: "q-nps" }
	]);
	assert.deepEqual(splitSynonyms(undefined), []);
	assert.deepEqual(splitSynonyms("a; b ;;c"), ["a", "b", "c"]);
});

test("v1-Umfrage: rating und nps mit Skala, ohne Platzhalter-Bedingungen", () => {
	const questions = flowSurveyFixture().questions.map(toV1Question) as any[];
	assert.deepEqual(questions[2].scale, { min: 1, max: 5, values: [1, 2, 3, 4, 5], minLabel: "schlecht", maxLabel: null });
	assert.deepEqual(questions[2].conditions, [{ operator: "less_than", value: 3, nextQuestionId: "q-comment" }]);
	assert.deepEqual(questions[3].scale, { min: 0, max: 10, minLabel: null, maxLabel: "sehr wahrscheinlich" });
	assert.deepEqual(questions[3].conditions, [
		{ operator: "less_than", value: 7, nextQuestionId: "q-comment" },
		{ operator: "greater_than", value: 8, nextQuestionId: "q-comment" }
	]);
});

test("Platzhalter-Bedingungen: nur unerfüllbare Werte ohne Folgefrage", () => {
	assert.equal(isPlaceholderCondition({ operator: "equals", value: -1, next_question_id: null }), true);
	assert.equal(isPlaceholderCondition({ operator: "less_than", value: -1000, next_question_id: null }), true);
	assert.equal(isPlaceholderCondition({ operator: "greater_than", value: 1000, next_question_id: null }), true);
	// echte Bedingung mit passendem Wert aber Folgefrage bleibt, ebenso falscher Wert zum Operator
	assert.equal(isPlaceholderCondition({ operator: "equals", value: -1, next_question_id: "x" }), false);
	assert.equal(isPlaceholderCondition({ operator: "equals", value: 1000, next_question_id: null }), false);
});

test("v1-Umfrage: webTheme aus den Tokens, ein internes Zusatzfeld erscheint nicht", () => {
	const tokens = defaultWebThemeTokens();
	const survey = { ...flowSurveyFixture(), web_theme_id: "11111111-1111-1111-1111-111111111111" };
	const detail = toV1SurveyDetail(survey, undefined, tokens) as any;
	assert.deepEqual(detail.webTheme, tokens);
	assert.equal(detail.web_theme_id, undefined);
	assert.equal(detail.created_at, undefined);
	assert.equal(detail.type, undefined);
	assert.equal((detail.questions[0] as any).name, undefined);
});

test("v1-Liste: feste Felder, nach Titel und ID sortiert", () => {
	const other = { ...flowSurveyFixture(), id: "00000000-0000-4000-8000-000000000001", title: "Anrufe" };
	const response = buildV1ListResponse([flowSurveyFixture(), other]);
	assert.deepEqual(response.surveys.map((s) => s.title), ["Anrufe", "Kundenzufriedenheit"]);
	assert.deepEqual(Object.keys(response.surveys[0]), [
		"surveyId", "name", "title", "description", "version", "updatedAt", "language"
	]);
	assert.deepEqual(buildV1ListResponse([]), { surveys: [] });
});

const CREDENTIALS = {
	region: "mypurecloud.de",
	clientId: "client",
	clientSecret: "secret",
	allowedDataTableIds: ["table-1"],
	surveyDataTableId: "table-1"
};

/** Ersetzt fetch für den Token-Abruf und die Zeilenseiten; liefert die abgerufenen Seitennummern zurück. */
async function withRowPages<T>(pages: any[], run: () => Promise<T>, status = 200): Promise<{ result: T; requested: string[] }> {
	const original = globalThis.fetch;
	const requested: string[] = [];
	globalThis.fetch = (async (input: any) => {
		const url = String(input);
		if (url.includes("/oauth/token")) {
			return new Response(JSON.stringify({ access_token: "token", expires_in: 300 }), { status: 200 });
		}
		requested.push(url);
		const page = Number(new URL(url).searchParams.get("pageNumber"));
		return new Response(JSON.stringify(pages[page - 1] ?? {}), { status });
	}) as typeof fetch;
	try {
		return { result: await run(), requested };
	} finally {
		globalThis.fetch = original;
	}
}

test("listProdSurveys: Sonderzeilen und ungültige Prod-Zellen werden übersprungen, alle Seiten gelesen", async () => {
	const second = { ...flowSurveyFixture(), id: "00000000-0000-4000-8000-000000000002" };
	const rows = (list: any[]) => ({ entities: list, pageCount: 2 });
	const pages = [
		rows([
			{ key: "__meta", Draft: "{}" },
			{ key: "__lock", Draft: "{}" },
			{ key: "survey_list", Draft: "[]" },
			{ key: `survey_${DETAIL_SURVEY_ID}`, Prod: JSON.stringify(flowSurveyFixture()) },
			{ key: "survey_00000000-0000-4000-8000-0000000000aa", Prod: "{}" },
			{ key: "survey_00000000-0000-4000-8000-0000000000bb", Prod: "kein json" }
		]),
		rows([
			{ key: `survey_${second.id}`, Prod: JSON.stringify(second) },
			// Prod gehört zu einer anderen ID
			{ key: "survey_00000000-0000-4000-8000-0000000000cc", Prod: JSON.stringify(second) },
			{ key: "survey_keine-uuid", Prod: JSON.stringify(second) }
		])
	];
	const { result, requested } = await withRowPages(pages, () => listProdSurveys("tenant", CREDENTIALS));
	assert.equal(result.status, "ok");
	assert.deepEqual(result.status === "ok" ? result.surveys.map((s) => s.id) : [], [DETAIL_SURVEY_ID, second.id]);
	assert.equal(requested.length, 2);
	assert.ok(requested[0].includes("showbrief=false") && requested[0].includes("pageNumber=1"));
});

test("listProdSurveys: Fehler von Genesys, 429 als throttled", async () => {
	const failed = await withRowPages([{}], () => listProdSurveys("tenant", CREDENTIALS), 500);
	assert.deepEqual(failed.result, { status: "error", reason: "Survey rows HTTP 500" });
	const throttled = await withRowPages([{}], () => listProdSurveys("tenant", CREDENTIALS), 429);
	assert.deepEqual(throttled.result, { status: "error", reason: "Survey rows HTTP 429", throttled: true });
});

test("listProdSurveys: doppelte Zeile durch Blättern über den Offset erscheint nur einmal", async () => {
	const row = { key: `survey_${DETAIL_SURVEY_ID}`, Prod: JSON.stringify(flowSurveyFixture()) };
	const pages = [{ entities: [row], pageCount: 2 }, { entities: [row], pageCount: 2 }];
	const { result } = await withRowPages(pages, () => listProdSurveys("tenant", CREDENTIALS));
	assert.deepEqual(result.status === "ok" ? result.surveys.map((s) => s.id) : result, [DETAIL_SURVEY_ID]);
});

test("listProdSurveys: ohne pageCount Fehler statt gekürzter Liste", async () => {
	const pages = [{ entities: [{ key: `survey_${DETAIL_SURVEY_ID}`, Prod: JSON.stringify(flowSurveyFixture()) }] }];
	const { result } = await withRowPages(pages, () => listProdSurveys("tenant", CREDENTIALS));
	assert.deepEqual(result, { status: "error", reason: "Survey rows response without pageCount" });
});

test("listProdSurveys: bricht ab, wenn das Zeitbudget erschöpft ist", async () => {
	const pages = [{ entities: [], pageCount: 3 }, { entities: [], pageCount: 3 }, { entities: [], pageCount: 3 }];
	let calls = 0;
	const canContinue = () => ++calls < 2;
	const { result, requested } = await withRowPages(pages, () => listProdSurveys("tenant", CREDENTIALS, { canContinue }));
	assert.deepEqual(result, { status: "error", reason: "Time budget exhausted" });
	assert.equal(requested.length, 1);
});

test("Umfragedetails-Handler: unbekannte Routen ergeben 404 im Fehlerformat", async () => {
	for (const routeKey of ["GET /ext/v2/surveys", "POST /ext/v1/surveys", "GET /ext/v1/surveys/{surveyId}/x", undefined]) {
		const result = await surveysHandler({ routeKey });
		assert.equal(result.statusCode, 404);
		assert.equal(JSON.parse(result.body).error, "not_found");
	}
});

test("Umfragedetails-Handler: ohne Token ergibt 401", async () => {
	for (const routeKey of ["GET /ext/v1/surveys", "GET /ext/v1/surveys/{surveyId}"]) {
		const result = await surveysHandler({ routeKey, headers: {}, pathParameters: { surveyId: DETAIL_SURVEY_ID } });
		assert.equal(result.statusCode, 401);
		assert.equal(JSON.parse(result.body).error, "invalid_token");
	}
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
