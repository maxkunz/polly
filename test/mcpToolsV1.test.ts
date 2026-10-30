import assert from "node:assert/strict";
import { translateSurveyForFlow } from "../src/domain/survey/flowTranslator";
import type { Survey } from "../src/domain/survey/surveyTypes";
import type { WebTheme } from "../src/domain/webTheme/webTheme";
import { prepareDraft } from "../amplify/functions/shared/survey_pipeline";
import type { StoreResult, SurveyListItem, SurveyRowView } from "../amplify/functions/shared/survey_store";
import type { SessionRecord } from "../amplify/functions/mcp/oauth_store";
import type { McpTenant } from "../amplify/functions/mcp/tenant";
import { handleMcpPost, MCP_MAX_BODY_BYTES } from "../amplify/functions/mcp/server";
import { callTool, type McpToolContext, type McpToolDeps, type PollyRolesResult } from "../amplify/functions/mcp/tool_handlers";
import {
	buildAuthoringGuide,
	findToolV1,
	listToolsV1,
	surveyInputSchema,
	toSurveyInput,
	TOOLS_V1,
	type ToolCallResult,
} from "../amplify/functions/mcp/tools_v1";

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

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const SURVEY_A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const SURVEY_B = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12";
const SURVEY_C = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a13";
const THEME_ID = "5f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

const TENANT: McpTenant = {
	tenantId: "tenant-a",
	backendClientId: "backend-1",
	mcpTenantKey: "k".repeat(22),
	epoch: 1,
	region: "mypurecloud.de",
	genesysClientId: "genesys-client",
	genesysOrgId: "org-1",
	allowComments: false,
	tenantName: "Muster AG",
};

const SESSION: SessionRecord = {
	sessionId: "s".repeat(43),
	tenantId: TENANT.tenantId,
	mcpTenantKey: TENANT.mcpTenantKey,
	epoch: 1,
	clientId: "c".repeat(43),
	userId: "user-1",
	userName: "Erika Muster",
	region: TENANT.region,
	genesysTokensEnc: "enc",
	genesysExpiresAt: NOW + 3600_000,
	genesysVersion: 0,
	createdAt: NOW,
	expiresAt: NOW + 86400_000,
};

function context(features: Record<string, boolean> = {}): McpToolContext {
	return {
		call: { tenant: TENANT, session: SESSION, userId: SESSION.userId, userName: SESSION.userName, genesysAccessToken: "genesys-token" },
		credentials: { region: TENANT.region, clientId: "cc", clientSecret: "secret", allowedDataTableIds: ["dt-1"], surveyDataTableId: "dt-1" },
		features,
		now: NOW,
	};
}

/** Gespeicherter Draft wie aus der App: Namen und IDs vergeben, dazu ein internes Feld, das nie ausgegeben werden darf. */
function savedDraft(id: string, title: string, version: number): Survey {
	const prepared = prepareDraft(
		{
			title,
			greeting_message: "Hallo",
			base_url: "https://umfrage.example.com/{token}",
			language: "en",
			web_theme_id: THEME_ID,
			questions: [
				{ type: "yes_no", title: "Zufrieden?", follow_ups: [{ condition: { operator: "equals", value: false }, question: { type: "comment", title: "Warum nicht?" } }] },
				{ type: "rating", title: "Wie gut?", options: { min_value: 1, max_value: 5, min_label: "schlecht" } },
			],
		} as unknown as Survey,
		{ surveyId: id, saved: null, version, webSurvey: true, now: "2026-10-01T10:00:00.000Z" }
	);
	assert.ok(prepared.ok);
	return { ...prepared.survey, internal_secret: "x" } as Survey;
}

function rowView(id: string, title: string, options: { prod?: boolean; lock?: Record<string, unknown> } = {}): SurveyRowView {
	const draft = savedDraft(id, title, 3);
	const prod = options.prod ? translateSurveyForFlow({ ...draft, version: 2 }) : "{}";
	const lock = options.lock ?? { locked_by: "", locked_since: "" };
	return {
		surveyId: id,
		row: { key: `survey_${id}`, Draft: JSON.stringify(draft), Stage: "{}", Prod: prod, Backup: "{}", lock: JSON.stringify(lock) },
		draft,
		lock: { locked_by: String(lock.locked_by ?? ""), locked_since: String(lock.locked_since ?? ""), ...(lock.via ? { via: lock.via as "ui" | "mcp" } : {}) },
		versions: { draft: 3, stage: null, prod: options.prod ? 2 : null, backup: null },
	};
}

interface FakeDeps extends McpToolDeps {
	calls: string[];
}

function fakeDeps(overrides: {
	roles?: string[] | PollyRolesResult;
	list?: SurveyListItem[];
	rows?: SurveyRowView[];
	deleting?: string[];
	themes?: WebTheme[];
} = {}): FakeDeps {
	const rows = overrides.rows ?? [];
	const calls: string[] = [];
	const roles = overrides.roles ?? ["polly_write", "polly_deploy", "polly_reporting"];
	return {
		calls,
		async pollyRoles() {
			calls.push("roles");
			return Array.isArray(roles) ? { ok: true, roles: new Set(roles) } : roles;
		},
		async readSurveyList() {
			calls.push("list");
			return { ok: true, value: overrides.list ?? [] };
		},
		async readSurveyRow(_store, surveyId): Promise<StoreResult<SurveyRowView>> {
			calls.push(`row:${surveyId}`);
			const view = rows.find((candidate) => candidate.surveyId === surveyId);
			return view ? { ok: true, value: view } : { ok: false, error: { code: "not_found" } };
		},
		async readSurveyRows() {
			calls.push("rows");
			return { ok: true, value: rows };
		},
		async findSurveysBeingDeleted() {
			return new Set(overrides.deleting ?? []);
		},
		async loadWebThemes() {
			calls.push("themes");
			return overrides.themes ?? [];
		},
	};
}

async function call(name: string, args: unknown, ctx = context(), deps: McpToolDeps = fakeDeps()): Promise<ToolCallResult> {
	const outcome = await callTool(name, args, ctx, deps);
	assert.equal(outcome.kind, "result", `Tool ${name} unbekannt`);
	return (outcome as { kind: "result"; result: ToolCallResult }).result;
}

/** Erfolg: `structuredContent` entspricht dem Ausgabeschema des Tools und steht auch als Text im Ergebnis. */
function success(name: string, result: ToolCallResult): Record<string, any> {
	assert.notEqual(result.isError, true, result.content[0]?.text);
	const output = TOOLS_V1.find((tool) => tool.name === name)!.output;
	const parsed = output.safeParse(result.structuredContent);
	assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
	assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
	return result.structuredContent as Record<string, any>;
}

function failure(result: ToolCallResult): { code: string; message: string; details: Record<string, any> } {
	assert.equal(result.isError, true);
	assert.equal(result.structuredContent, undefined);
	const error = JSON.parse(result.content[0].text);
	assert.deepEqual(Object.keys(error).sort(), ["code", "details", "message"]);
	return error;
}

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------

await test("Katalog: list_web_themes nur mit web_survey, alle Tools nur lesend", () => {
	assert.deepEqual(listToolsV1(false).map((tool) => tool.name), ["get_authoring_guide", "list_surveys", "get_survey", "validate_survey"]);
	const tools = listToolsV1(true);
	assert.deepEqual(tools.map((tool) => tool.name), ["get_authoring_guide", "list_surveys", "get_survey", "list_web_themes", "validate_survey"]);
	for (const tool of tools) {
		assert.equal(tool.inputSchema.type, "object");
		assert.equal(tool.outputSchema.type, "object");
		assert.equal("$schema" in tool.inputSchema, false);
		assert.equal(tool.annotations.readOnlyHint, true);
	}
	assert.equal(findToolV1("list_web_themes", false), undefined);
});

await test("Katalog: Web-Felder im Eingabeschema von validate_survey nur mit web_survey", () => {
	const surveyProps = (webSurvey: boolean) => {
		const schema = listToolsV1(webSurvey).find((tool) => tool.name === "validate_survey")!.inputSchema as any;
		return Object.keys(schema.properties.survey.properties);
	};
	assert.ok(surveyProps(true).includes("web_theme_id"));
	assert.ok(!surveyProps(false).includes("web_theme_id"));
	assert.ok(!surveyProps(false).includes("base_url"));
	// Servergeführte Felder gehören nicht zur Eingabe
	assert.ok(!surveyProps(true).includes("version"));
	assert.ok(!surveyProps(true).includes("id"));
});

// ---------------------------------------------------------------------------
// Eingabe (Schritt 1 der Pipeline)
// ---------------------------------------------------------------------------

await test("Eingabe: Whitelist-Kopie verwirft unbekannte und servergeführte Felder, options passend zum Typ", () => {
	const parsed = surveyInputSchema.parse({
		id: SURVEY_A,
		version: 99,
		created_at: "x",
		evil: "drop me",
		title: "T",
		questions: [
			{ type: "yes_no", title: "Q1", options: { labels: [{ label: "x" }] }, foo: 1 },
			{ type: "nps", title: "Q2", options: { min_value: 3, max_label: "top" } },
			{ type: "choice", title: "Q3", options: { labels: [{ label: "a", extra: 1 }, { id: "x", label: "b", synonyms: ["bb"] }], min_value: 1 } },
			{ type: "rating", title: "Q4", options: { min_value: 1, max_value: 5, labels: [] } },
		],
	});
	const survey = toSurveyInput(parsed);
	assert.deepEqual(survey, {
		title: "T",
		questions: [
			{ type: "yes_no", title: "Q1" },
			{ type: "nps", title: "Q2", options: { max_label: "top" } },
			{ type: "choice", title: "Q3", options: { labels: [{ label: "a" }, { id: "x", label: "b", synonyms: ["bb"] }] } },
			{ type: "rating", title: "Q4", options: { min_value: 1, max_value: 5 } },
		],
	});
});

await test("invalid_input: eigenes Fehlerformat mit Pfad, nichts gelesen", async () => {
	const deps = fakeDeps();
	const error = failure(await call("validate_survey", { survey: { title: "T", questions: [{ type: "matrix", title: "Q" }] } }, context(), deps));
	assert.equal(error.code, "invalid_input");
	assert.equal(error.details.issues[0].path, "survey.questions[0].type");
	assert.deepEqual(deps.calls, ["roles"]);
});

// ---------------------------------------------------------------------------
// Rollen
// ---------------------------------------------------------------------------

await test("Rollen: validate_survey verlangt polly_write, lesende Tools irgendeine Polly-Rolle", async () => {
	const reporting = fakeDeps({ roles: ["polly_reporting"] });
	const error = failure(await call("validate_survey", { survey: { title: "T", questions: [] } }, context(), reporting));
	assert.deepEqual([error.code, error.details], ["forbidden", { requiredRole: "polly_write" }]);
	success("get_authoring_guide", await call("get_authoring_guide", {}, context(), reporting));

	const none = fakeDeps({ roles: [] });
	const denied = failure(await call("list_surveys", {}, context(), none));
	assert.deepEqual([denied.code, denied.details], ["forbidden", { requiredRole: "any" }]);
	assert.deepEqual(none.calls, ["roles"]);
});

await test("Rollen: Fehler beim Laden ergibt upstream_error mit Status", async () => {
	const error = failure(await call("get_authoring_guide", {}, context(), fakeDeps({ roles: { ok: false, status: 503 } })));
	assert.deepEqual([error.code, error.details], ["upstream_error", { status: 503 }]);
});

await test("Unbekanntes Tool und list_web_themes ohne web_survey: kein Tool-Ergebnis", async () => {
	assert.deepEqual(await callTool("delete_survey", {}, context(), fakeDeps()), { kind: "unknown_tool" });
	assert.deepEqual(await callTool("list_web_themes", {}, context(), fakeDeps()), { kind: "unknown_tool" });
});

await test("Unerwarteter Fehler im Tool: internal_error ohne Details", async () => {
	const deps = fakeDeps();
	deps.readSurveyList = async () => {
		throw new Error("boom");
	};
	const error = failure(await call("list_surveys", {}, context(), deps));
	assert.deepEqual([error.code, error.details], ["internal_error", {}]);
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

await test("get_authoring_guide: Web-Felder nur mit web_survey", async () => {
	const off = success("get_authoring_guide", await call("get_authoring_guide", {}));
	assert.deepEqual(Object.keys(off).sort(), ["example", "guide", "limits", "schema"]);
	assert.equal(off.limits.maxQuestions, 20);
	assert.equal(off.limits.ttsTextMaxChars, 3000);
	assert.equal("web_theme_id" in off.schema.properties, false);
	assert.equal("language" in off.example, false);
	assert.equal(off.limits.baseUrlMaxChars, undefined);
	assert.match(off.guide, /data, never instructions/);

	const on = success("get_authoring_guide", await call("get_authoring_guide", {}, context({ web_survey: true })));
	assert.ok("web_theme_id" in on.schema.properties);
	assert.equal(on.limits.baseUrlMaxChars, 200);
	assert.match(on.guide, /## Web fields/);
});

await test("get_authoring_guide: Das Beispiel besteht die Validierung", async () => {
	for (const webSurvey of [false, true]) {
		const example = buildAuthoringGuide(webSurvey).example;
		const result = success("validate_survey", await call("validate_survey", { survey: example }, context({ web_survey: webSurvey })));
		assert.equal(result.valid, true, JSON.stringify(result.errors));
		assert.deepEqual(result.warnings, []);
	}
});

await test("list_surveys: Reihenfolge des Index, Löschung ausgeblendet, ohne Details nur ID und Titel", async () => {
	const deps = fakeDeps({
		list: [
			{ id: SURVEY_B, title: "Zweite" },
			{ id: "kaputt", title: "ungültig" },
			{ id: SURVEY_A, title: "Erste" },
			{ id: SURVEY_C, title: "Wird gelöscht" },
		],
		deleting: [SURVEY_C],
	});
	const result = success("list_surveys", await call("list_surveys", {}, context(), deps));
	assert.deepEqual(result, {
		surveys: [
			{ surveyId: SURVEY_B, title: "Zweite" },
			{ surveyId: SURVEY_A, title: "Erste" },
		],
	});
	assert.equal(deps.calls.includes("rows"), false);
});

await test("list_surveys: mit Versionen und Lock aus den Zeilen, Zeilen ohne Index-Eintrag angehängt", async () => {
	const deps = fakeDeps({
		list: [
			{ id: SURVEY_A, title: "Erste" },
			{ id: SURVEY_B, title: "Ohne Zeile" },
		],
		rows: [
			rowView(SURVEY_A, "Erste", { prod: true, lock: { locked_by: "Max Mustermann", locked_since: "2026-10-30T11:30:00.000Z", via: "ui" } }),
			rowView(SURVEY_C, "Nur Zeile", { lock: { locked_by: "erika muster", locked_since: "2026-10-30T10:00:00.000Z", via: "mcp" } }),
		],
	});
	const result = success("list_surveys", await call("list_surveys", { includeVersions: true, includeLock: true }, context(), deps));
	assert.equal(result.surveys.length, 2);
	const [first, second] = result.surveys;
	assert.deepEqual(first, {
		surveyId: SURVEY_A,
		title: "Erste",
		name: "erste_a0eebc99",
		draftVersion: 3,
		stageVersion: null,
		prodVersion: 2,
		lock: {
			lockedBy: "Max Mustermann",
			since: "2026-10-30T11:30:00.000Z",
			expiresAt: "2026-10-30T12:30:00.000Z",
			via: "ui",
			active: true,
			ownedByYou: false,
		},
	});
	assert.equal(second.surveyId, SURVEY_C);
	assert.equal(second.title, "Nur Zeile");
	// Abgelaufenes eigenes Lock
	assert.deepEqual([second.lock.active, second.lock.ownedByYou, second.lock.via], [false, true, "mcp"]);

	const versionsOnly = success("list_surveys", await call("list_surveys", { includeVersions: true }, context(), deps));
	assert.equal("lock" in versionsOnly.surveys[0], false);
});

await test("get_survey: Draft in fester Abbildung, interne Felder fehlen, Web-Felder nur mit web_survey", async () => {
	const deps = fakeDeps({ rows: [rowView(SURVEY_A, "Erste", { prod: true })] });
	const off = success("get_survey", await call("get_survey", { surveyId: SURVEY_A }, context(), deps));
	assert.deepEqual(Object.keys(off).sort(), ["draft", "lock", "payloadSize", "surveyId", "validation", "versions"]);
	assert.deepEqual(Object.keys(off.draft).sort(), [
		"closing_message",
		"created_at",
		"description",
		"greeting_message",
		"id",
		"name",
		"questions",
		"title",
		"updated_at",
		"version",
	]);
	assert.equal(off.draft.questions[0].follow_ups[0].question.title, "Warum nicht?");
	assert.deepEqual(off.draft.questions[1].options, { min_value: 1, max_value: 5, min_label: "schlecht" });
	assert.equal(off.lock, null);
	assert.deepEqual(off.versions, { draft: 3, stage: null, prod: 2, backup: null });
	assert.deepEqual(off.validation, { valid: true, errors: [], warnings: [] });
	assert.equal(off.payloadSize.level, "ok");
	assert.equal(off.payloadSize.limit, 31500);

	const on = success("get_survey", await call("get_survey", { surveyId: SURVEY_A }, context({ web_survey: true }), deps));
	assert.deepEqual([on.draft.base_url, on.draft.language, on.draft.web_theme_id], ["https://umfrage.example.com/{token}", "en", THEME_ID]);
});

await test("get_survey: Stage/Prod/Backup nach Wahl, deployter Stand in der Abbildung der Kunden-API", async () => {
	const deps = fakeDeps({ rows: [rowView(SURVEY_A, "Erste", { prod: true })] });
	const result = success("get_survey", await call("get_survey", { surveyId: SURVEY_A, fields: ["prod", "backup"] }, context(), deps));
	assert.equal("draft" in result, false);
	assert.equal("stage" in result, false);
	assert.equal(result.backup, null);
	assert.equal(result.prod.surveyId, SURVEY_A);
	assert.equal(result.prod.version, 2);
	assert.equal(result.prod.greeting, "Hallo");
	assert.equal(result.prod.questions.length, 3);
	assert.equal(result.prod.questions[0].questionId, result.prod.questions[0].questionId.toLowerCase());
	// Platzhalter-Bedingungen des Translators erscheinen nicht
	const rating = result.prod.questions.find((question: any) => question.type === "rating");
	assert.deepEqual(rating.conditions, []);
});

await test("get_survey: ungültiger Draft liefert Befunde statt Fehler, unbekannte Umfrage not_found", async () => {
	const view = rowView(SURVEY_A, "Erste");
	const draft = { ...view.draft!, questions: Array.from({ length: 21 }, (_, i) => ({ ...view.draft!.questions[1], id: `q${i}` })) };
	const deps = fakeDeps({ rows: [{ ...view, draft }] });
	const result = success("get_survey", await call("get_survey", { surveyId: SURVEY_A }, context(), deps));
	assert.equal(result.validation.valid, false);
	assert.ok(result.validation.errors.some((error: any) => error.code === "surveyMaxQuestions" && error.params.max === 20));
	assert.equal(result.payloadSize, null);

	const missing = failure(await call("get_survey", { surveyId: SURVEY_B }, context(), deps));
	assert.deepEqual([missing.code, missing.details], ["not_found", {}]);
});

await test("list_web_themes: ID, Name und Standard, keine Tokens", async () => {
	const theme: WebTheme = { id: THEME_ID, name: "Hausdesign", isDefault: true, tokens: {} as WebTheme["tokens"], updatedAt: "2026-10-01T00:00:00Z", updatedBy: "Erika" };
	const result = success("list_web_themes", await call("list_web_themes", {}, context({ web_survey: true }), fakeDeps({ themes: [theme] })));
	assert.deepEqual(result, { themes: [{ themeId: THEME_ID, name: "Hausdesign", isDefault: true }] });
});

await test("validate_survey: Namen und IDs vergibt der Server, Warnung bei abweichendem Namen", async () => {
	const result = success(
		"validate_survey",
		await call("validate_survey", { survey: { title: "Neu", name: "mein_name", questions: [{ type: "comment", title: "Und sonst?" }] } })
	);
	assert.equal(result.valid, true);
	assert.deepEqual(result.warnings.map((warning: any) => warning.code), ["name_immutable_ignored"]);
	assert.equal(result.payloadSize.level, "ok");
});

await test("validate_survey: 21 Fragen ergeben Befunde, kein Schreiben", async () => {
	const deps = fakeDeps();
	const questions = Array.from({ length: 21 }, (_, i) => ({ type: "comment", title: `Frage ${i}` }));
	const result = success("validate_survey", await call("validate_survey", { survey: { title: "Viel", questions } }, context(), deps));
	assert.equal(result.valid, false);
	assert.deepEqual(result.errors.map((error: any) => error.code), ["surveyMaxQuestions"]);
	assert.equal(result.payloadSize, null);
	assert.deepEqual(deps.calls, ["roles"]);
});

await test("validate_survey: Web-Felder ohne web_survey zurückgesetzt, mit web_survey Design geprüft", async () => {
	const survey = { title: "Web", web_theme_id: THEME_ID, questions: [{ type: "comment", title: "Und?" }] };
	const off = success("validate_survey", await call("validate_survey", { survey }));
	assert.deepEqual([off.valid, off.warnings.map((warning: any) => warning.code)], [true, ["web_settings_reset"]]);

	const unknown = success("validate_survey", await call("validate_survey", { survey }, context({ web_survey: true }), fakeDeps({ themes: [] })));
	assert.deepEqual(unknown.errors, [{ code: "theme_unknown", field: "web_theme_id", params: { themeId: THEME_ID } }]);
});

await test("validate_survey: gegen bestehende Umfrage behalten gespeicherte Namen, doppelte IDs ergeben invalid_id", async () => {
	const view = rowView(SURVEY_A, "Erste");
	const theme = { id: THEME_ID, name: "Haus", isDefault: true } as WebTheme;
	const deps = fakeDeps({ rows: [view], themes: [theme] });
	const input = { ...(view.draft as any), title: "Umbenannt" };
	const result = success(
		"validate_survey",
		await call("validate_survey", { survey: input, surveyId: SURVEY_A }, context({ web_survey: true }), deps)
	);
	assert.deepEqual([result.valid, result.warnings], [true, []]);

	const duplicate = { title: "Doppelt", questions: [{ id: SURVEY_B, type: "comment", title: "A" }, { id: SURVEY_B, type: "comment", title: "B" }] };
	const invalid = success("validate_survey", await call("validate_survey", { survey: duplicate }, context(), deps));
	assert.deepEqual(invalid.errors, [{ code: "invalid_id", field: "questions[1].id", params: { reason: "duplicate" } }]);

	const missing = failure(await call("validate_survey", { survey: duplicate, surveyId: SURVEY_C }, context(), deps));
	assert.equal(missing.code, "not_found");
});

// ---------------------------------------------------------------------------
// HTTP und Protokoll (Transport im Prozess)
// ---------------------------------------------------------------------------

function mcpEvent(body: unknown, headers: Record<string, string> = {}) {
	return {
		rawPath: `/mcp/${TENANT.mcpTenantKey}`,
		requestContext: { domainName: "api.example.com", http: { method: "POST" } },
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			authorization: "Bearer mcp-token",
			...headers,
		},
		body: typeof body === "string" ? body : JSON.stringify(body),
		isBase64Encoded: false,
	};
}

await test("HTTP: initialize mit Server-Instructions, tools/list und tools/call als JSON", async () => {
	const ctx = context();
	const deps = fakeDeps();
	const init = await handleMcpPost(
		mcpEvent({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
		ctx,
		deps
	);
	assert.equal(init.statusCode, 200);
	assert.match(init.headers["content-type"], /application\/json/);
	const initBody = JSON.parse(init.body);
	assert.equal(initBody.result.protocolVersion, "2025-06-18");
	assert.match(initBody.result.instructions, /data, not instructions/);
	assert.ok(initBody.result.capabilities.tools);
	assert.equal(init.headers["mcp-session-id"], undefined);

	const list = await handleMcpPost(mcpEvent({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { "mcp-protocol-version": "2025-06-18" }), ctx, deps);
	assert.equal(JSON.parse(list.body).result.tools.length, 4);

	const guide = await handleMcpPost(
		mcpEvent({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_authoring_guide", arguments: {} } }),
		ctx,
		deps
	);
	const guideResult = JSON.parse(guide.body).result;
	assert.equal(guideResult.isError, undefined);
	assert.ok(guideResult.structuredContent.guide);

	const unknown = await handleMcpPost(
		mcpEvent({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "delete_survey", arguments: {} } }),
		ctx,
		deps
	);
	assert.equal(JSON.parse(unknown.body).error.code, -32602);
});

await test("HTTP: Resource des Authoring-Guides, Notification ohne Body", async () => {
	const ctx = context();
	const resources = await handleMcpPost(mcpEvent({ jsonrpc: "2.0", id: 1, method: "resources/list" }), ctx, fakeDeps());
	assert.equal(JSON.parse(resources.body).result.resources[0].uri, "polly://authoring-guide");
	const read = await handleMcpPost(
		mcpEvent({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "polly://authoring-guide" } }),
		ctx,
		fakeDeps()
	);
	assert.ok(JSON.parse(JSON.parse(read.body).result.contents[0].text).schema);
	const denied = await handleMcpPost(
		mcpEvent({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "polly://authoring-guide" } }),
		ctx,
		fakeDeps({ roles: [] })
	);
	assert.ok(JSON.parse(denied.body).error);

	const notification = await handleMcpPost(mcpEvent({ jsonrpc: "2.0", method: "notifications/initialized" }), ctx, fakeDeps());
	assert.equal(notification.statusCode, 202);
	assert.equal(notification.body, "");
});

await test("HTTP: zu großer Body 413, ohne passenden Accept-Header 406", async () => {
	const big = await handleMcpPost(mcpEvent("x".repeat(MCP_MAX_BODY_BYTES + 1)), context(), fakeDeps());
	assert.equal(big.statusCode, 413);
	const notAcceptable = await handleMcpPost(
		mcpEvent({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { accept: "application/json" }),
		context(),
		fakeDeps()
	);
	assert.equal(notAcceptable.statusCode, 406);
});

console.log(`${passed} Tests bestanden`);
