import assert from "node:assert/strict";
import { parseInvitationRequest, parsePreviewRequest, INVITATION_COUNT_MAX } from "../amplify/functions/invitations/request";
import {
	buildStoredAnswers,
	parseProdSurvey,
	surveyLanguageOf,
	surveyVersionOf,
	toWebSurvey
} from "../amplify/functions/shared/web_survey_format";
import {
	normalizeToken,
	parseSubmitRequest,
	readRequestBody,
	WEB_SURVEY_MAX_BODY_BYTES
} from "../amplify/functions/web_survey/request";
import { isValidThemeId, parseWebThemeRequest, pickTheme, toWebTheme } from "../amplify/functions/shared/web_themes";
import { hasPollyRole } from "../src/domain/permissions/roleCheck";
import { DEFAULT_WEB_THEME_TOKENS, defaultWebThemeTokens } from "../src/domain/webTheme/webTheme";
import type { WebTheme } from "../src/domain/webTheme/webTheme";
import { pruneFlowAnswers } from "../src/domain/survey/flowNavigation";
import type { FlowCondition, FlowSurvey } from "../src/domain/survey/flowTypes";

let passed = 0;

function test(name: string, fn: () => void): void {
	try {
		fn();
		passed++;
		console.log(`ok - ${name}`);
	} catch (error) {
		console.error(`FAIL - ${name}`);
		throw error;
	}
}

const SURVEY_ID = "90f142be-4066-43cd-abef-31a426421b77";
const Q_RATING = "0c1b7195-1c3a-4856-b2f1-89733e9404b0";
const Q_CHOICE = "f1f68a0b-8b3c-4715-ad03-ff9cfc8ff9b3";
const Q_NPS = "85a238d2-78da-4ad5-9291-277394544779";
const Q_YES_NO = "86c4a809-d823-4946-9750-3069112948eb";
const Q_COMMENT = "c5a6e5c1-96cd-4bea-bd5e-d92696deb6a6";

function base(id: string, defaultNext: string | null, mandatory = false) {
	return {
		id,
		name: `frage_${id.slice(0, 8)}`,
		prompt: `Frage ${id.slice(0, 8)}`,
		description: `Hilfe ${id.slice(0, 8)}`,
		reprompt: "Bitte noch einmal",
		mandatory,
		default_next_question_id: defaultNext
	};
}

function conditions(lessThan: [number, string | null]): FlowCondition[] {
	return [
		{ operator: "equals", value: -1, next_question_id: null },
		{ operator: "less_than", value: lessThan[0], next_question_id: lessThan[1] },
		{ operator: "greater_than", value: 1000, next_question_id: null }
	];
}

function buildSurvey(): FlowSurvey {
	return {
		id: SURVEY_ID,
		name: "kundenservice_90f142be",
		title: "Kundenservice",
		description: "Beschreibung",
		greeting_prompt: "Hallo",
		closing_prompt: "Danke",
		language: "en",
		created_at: "2026-10-01T00:00:00.000Z",
		updated_at: "2026-10-02T00:00:00.000Z",
		start_question_id: Q_RATING,
		version: 4,
		type: "Flow",
		questions: [
			{
				...base(Q_RATING, Q_NPS, true),
				type: "rating",
				options: { values: [1, 2, 3, 4, 5], min_value: 1, max_value: 5, min_label: "schlecht", max_label: "super" },
				conditional_next_question: conditions([3, Q_CHOICE])
			},
			{
				...base(Q_CHOICE, Q_NPS),
				type: "choice",
				labels: ["Wartezeit", "Freundlichkeit"],
				synonyms: ["warten; dauer", ""],
				next_question_ids: [null, null]
			},
			{
				...base(Q_NPS, Q_YES_NO),
				type: "nps",
				options: { max_label: "sehr wahrscheinlich" },
				conditional_next_question: conditions([-1000, null])
			},
			{
				...base(Q_YES_NO, null),
				type: "yes_no",
				options: { yes_next_question_id: null, no_next_question_id: Q_COMMENT }
			},
			{ ...base(Q_COMMENT, null), type: "comment" }
		]
	};
}

// --- Rollen ---------------------------------------------------------------------------------

test("hasPollyRole: präfixierte Rolle der eigenen Installation, Groß-/Kleinschreibung egal", () => {
	assert.equal(hasPollyRole(["ACME_Polly_Deploy"], "polly_deploy", "acme"), true);
	assert.equal(hasPollyRole(["other_polly_deploy"], "polly_deploy", "acme"), false);
});

test("hasPollyRole: unpräfixierte Rolle gilt immer, ohne projectTag nur sie", () => {
	assert.equal(hasPollyRole(["polly_deploy"], "polly_deploy", "acme"), true);
	assert.equal(hasPollyRole(["POLLY_DEPLOY"], "polly_deploy"), true);
	assert.equal(hasPollyRole(["acme_polly_deploy"], "polly_deploy"), false);
	assert.equal(hasPollyRole(["polly_write"], "polly_deploy", "acme"), false);
	assert.equal(hasPollyRole([], "polly_deploy", "acme"), false);
});

// --- POST /invitations ------------------------------------------------------------------------

const NOW = 1_800_000_000;

test("parseInvitationRequest: gültige Anfrage mit und ohne exp", () => {
	assert.deepEqual(parseInvitationRequest({ surveyId: SURVEY_ID, count: 3, multi: false }, NOW), {
		ok: true,
		request: { surveyId: SURVEY_ID, count: 3, multi: false }
	});
	assert.deepEqual(parseInvitationRequest({ surveyId: SURVEY_ID, count: 1, multi: true, exp: NOW + 60 }, NOW), {
		ok: true,
		request: { surveyId: SURVEY_ID, count: 1, multi: true, exp: NOW + 60 }
	});
	// exp: null zählt wie fehlend
	assert.equal(parseInvitationRequest({ surveyId: SURVEY_ID, count: 1, multi: true, exp: null }, NOW).ok, true);
});

test("parsePreviewRequest: nur surveyId, sonst nichts übernommen", () => {
	assert.deepEqual(parsePreviewRequest({ surveyId: SURVEY_ID }), { ok: true, surveyId: SURVEY_ID });
	// Laufzeit und Mehrfachnutzung setzt der Server, Felder des Clients werden ignoriert
	assert.deepEqual(parsePreviewRequest({ surveyId: SURVEY_ID, exp: 4102444800, multi: false }), { ok: true, surveyId: SURVEY_ID });
	assert.equal(parsePreviewRequest({ surveyId: "nope" }).ok, false);
	assert.equal(parsePreviewRequest({}).ok, false);
	assert.equal(parsePreviewRequest(null).ok, false);
	assert.equal(parsePreviewRequest([SURVEY_ID]).ok, false);
});

test("parseInvitationRequest: Anzahl 1 bis 5000", () => {
	for (const count of [0, INVITATION_COUNT_MAX + 1, 1.5, "3", -1]) {
		assert.equal(parseInvitationRequest({ surveyId: SURVEY_ID, count, multi: true }, NOW).ok, false, `count ${count}`);
	}
	assert.equal(parseInvitationRequest({ surveyId: SURVEY_ID, count: INVITATION_COUNT_MAX, multi: true }, NOW).ok, true);
});

test("parseInvitationRequest: surveyId, multi und exp werden geprüft", () => {
	assert.equal(parseInvitationRequest({ surveyId: "survey_1", count: 1, multi: true }, NOW).ok, false);
	assert.equal(parseInvitationRequest({ surveyId: SURVEY_ID, count: 1, multi: "true" }, NOW).ok, false);
	assert.equal(parseInvitationRequest({ surveyId: SURVEY_ID, count: 1, multi: true, exp: NOW }, NOW).ok, false);
	assert.equal(parseInvitationRequest({ surveyId: SURVEY_ID, count: 1, multi: true, exp: NOW + 0.5 }, NOW).ok, false);
	assert.equal(parseInvitationRequest({ surveyId: SURVEY_ID, count: 1, multi: true, exp: "2027-01-01" }, NOW).ok, false);
	assert.equal(parseInvitationRequest(null, NOW).ok, false);
	assert.equal(parseInvitationRequest([], NOW).ok, false);
});

// --- web_survey: Requests ------------------------------------------------------------------------

test("readRequestBody: Grenze 64 KB, auch bei Base64 und Mehrbyte-Zeichen", () => {
	assert.deepEqual(readRequestBody({ body: "{}" }), { ok: true, text: "{}" });
	assert.deepEqual(readRequestBody({}), { ok: true, text: "" });
	assert.equal(readRequestBody({ body: "a".repeat(WEB_SURVEY_MAX_BODY_BYTES) }).ok, true);
	assert.equal(readRequestBody({ body: "a".repeat(WEB_SURVEY_MAX_BODY_BYTES + 1) }).ok, false);
	// 3 Bytes pro Zeichen: Zeichenzahl unter, Byteanzahl über der Grenze
	assert.equal(readRequestBody({ body: "€".repeat(WEB_SURVEY_MAX_BODY_BYTES / 2) }).ok, false);
	const encoded = Buffer.from('{"a":1}').toString("base64");
	assert.deepEqual(readRequestBody({ body: encoded, isBase64Encoded: true }), { ok: true, text: '{"a":1}' });
	const tooLarge = Buffer.from("a".repeat(WEB_SURVEY_MAX_BODY_BYTES + 1)).toString("base64");
	assert.equal(readRequestBody({ body: tooLarge, isBase64Encoded: true }).ok, false);
});

test("normalizeToken: trimmt, leere und überlange Werte zählen als fehlend", () => {
	assert.equal(normalizeToken("  abc.def.ghi "), "abc.def.ghi");
	assert.equal(normalizeToken(""), "");
	assert.equal(normalizeToken(undefined), "");
	assert.equal(normalizeToken(42), "");
	assert.equal(normalizeToken("a".repeat(5000)), "");
});

test("parseSubmitRequest: Pflichtfelder token, surveyVersion (Ganzzahl) und answers (Objekt)", () => {
	const ok = parseSubmitRequest(JSON.stringify({ token: "a.b.c", surveyVersion: 4, answers: { x: 1 } }));
	assert.deepEqual(ok, { ok: true, request: { token: "a.b.c", surveyVersion: 4, answers: { x: 1 } } });

	for (const body of [
		"kein json",
		"[]",
		JSON.stringify({ surveyVersion: 4, answers: {} }),
		JSON.stringify({ token: "a.b.c", surveyVersion: "4", answers: {} }),
		JSON.stringify({ token: "a.b.c", surveyVersion: 4.5, answers: {} }),
		JSON.stringify({ token: "a.b.c", surveyVersion: 4, answers: [] }),
		JSON.stringify({ token: "a.b.c", surveyVersion: 4, answers: null })
	]) {
		assert.equal(parseSubmitRequest(body).ok, false, body);
	}
});

test("parseSubmitRequest: submissionId optional, nur als UUID, klein geschrieben", () => {
	const base = { token: "a.b.c", surveyVersion: 4, answers: {} };
	const withId = parseSubmitRequest(JSON.stringify({ ...base, submissionId: "0F8FAD5B-D9CB-469F-A165-70867728950E" }));
	assert.deepEqual(withId, {
		ok: true,
		request: { ...base, submissionId: "0f8fad5b-d9cb-469f-a165-70867728950e" }
	});
	const withoutId = parseSubmitRequest(JSON.stringify(base));
	assert.equal(withoutId.ok && withoutId.request.submissionId, undefined);

	for (const submissionId of ["", "abc", 42, null, "0f8fad5b-d9cb-469f-a165-70867728950e-x", "survey_0f8fad5b"]) {
		assert.equal(parseSubmitRequest(JSON.stringify({ ...base, submissionId })).ok, false, String(submissionId));
	}
});

// --- Prod-Stand und bereinigtes Flow-JSON -------------------------------------------------------

test("parseProdSurvey: liest JSON-String und Objekt, prüft die ID", () => {
	const survey = buildSurvey();
	assert.equal(parseProdSurvey(JSON.stringify(survey), SURVEY_ID)?.id, SURVEY_ID);
	assert.equal(parseProdSurvey(survey, SURVEY_ID)?.id, SURVEY_ID);
	assert.equal(parseProdSurvey(JSON.stringify(survey), "11111111-1111-1111-1111-111111111111"), null);
});

test("parseProdSurvey: kein Prod-Stand oder kaputtes JSON ergibt null", () => {
	for (const raw of [undefined, null, "", "   ", "{}", "[]", "{kaputt", JSON.stringify({ id: SURVEY_ID, questions: [] })]) {
		assert.equal(parseProdSurvey(raw, SURVEY_ID), null, String(raw));
	}
});

test("parseProdSurvey: Fragen mit fehlenden Navigationsfeldern ergeben null", () => {
	const broken = [
		(s: any) => { s.questions[0].options = undefined; },
		(s: any) => { s.questions[0].conditional_next_question = undefined; },
		(s: any) => { s.questions[1].labels = "Wartezeit"; },
		(s: any) => { s.questions[3].options = null; },
		(s: any) => { s.questions[4].type = "slider"; },
		(s: any) => { s.questions[4].id = 5; },
		(s: any) => { s.start_question_id = 7; }
	];
	for (const breakIt of broken) {
		const survey: any = buildSurvey();
		breakIt(survey);
		assert.equal(parseProdSurvey(JSON.stringify(survey), SURVEY_ID), null, breakIt.toString());
	}
});

test("toWebSurvey: ohne name, reprompt, synonyms und Zeitstempel; Labels und Navigation bleiben", () => {
	const web = toWebSurvey(buildSurvey());
	const json = JSON.stringify(web);
	for (const hidden of ["kundenservice_90f142be", "frage_", "Bitte noch einmal", "warten; dauer", "created_at", "updated_at", "reprompt", "synonyms"]) {
		assert.equal(json.includes(hidden), false, hidden);
	}
	assert.equal(web.version, 4);
	assert.equal(web.language, "en");
	assert.equal(web.start_question_id, Q_RATING);
	assert.equal(web.questions.length, 5);

	const [rating, choice, nps, yesNo, comment] = web.questions;
	assert.deepEqual(rating, {
		id: Q_RATING,
		prompt: "Frage 0c1b7195",
		description: "Hilfe 0c1b7195",
		mandatory: true,
		default_next_question_id: Q_NPS,
		type: "rating",
		options: { values: [1, 2, 3, 4, 5], min_value: 1, max_value: 5, min_label: "schlecht", max_label: "super" },
		conditional_next_question: conditions([3, Q_CHOICE])
	});
	assert.equal(choice.type === "choice" && choice.labels.join(","), "Wartezeit,Freundlichkeit");
	assert.deepEqual(nps.type === "nps" && nps.options, { max_label: "sehr wahrscheinlich" });
	assert.deepEqual(yesNo.type === "yes_no" && yesNo.options, { yes_next_question_id: null, no_next_question_id: Q_COMMENT });
	assert.equal(comment.type, "comment");
});

test("toWebSurvey: nps ohne Labels hat keine options", () => {
	const survey = buildSurvey();
	(survey.questions[2] as any).options = {};
	const nps = toWebSurvey(survey).questions[2];
	assert.equal("options" in nps, false);
});

test("language fehlt oder ist unbekannt: ausdrücklich de; version fehlt: 0", () => {
	const survey = buildSurvey();
	delete survey.language;
	delete survey.version;
	assert.equal(surveyLanguageOf(survey), "de");
	assert.equal(surveyVersionOf(survey), 0);
	assert.equal(toWebSurvey(survey).language, "de");
	(survey as any).language = "tlh";
	assert.equal(surveyLanguageOf(survey), "de");
});

test("buildStoredAnswers: Schlüssel ist der technische Fragename, Format wie im Flow", () => {
	const survey = buildSurvey();
	const now = "2026-10-19T10:00:00.000Z";
	const answers = pruneFlowAnswers(survey, {
		[Q_RATING]: 2,
		[Q_CHOICE]: "Wartezeit",
		[Q_NPS]: 9,
		[Q_YES_NO]: false,
		[Q_COMMENT]: "",
		"unbekannt": "x"
	});
	assert.deepEqual(buildStoredAnswers(survey, answers, now), {
		frage_0c1b7195: { type: "rating", value: 2, answeredAt: now },
		frage_f1f68a0b: { type: "choice", value: "Wartezeit", answeredAt: now },
		frage_85a238d2: { type: "nps", value: 9, answeredAt: now },
		frage_86c4a809: { type: "yes_no", value: false, answeredAt: now }
	});
});

const THEME_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THEME_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THEME_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function theme(id: string, isDefault: boolean, primary: string): WebTheme {
	const tokens = defaultWebThemeTokens();
	tokens.colors.primary = primary;
	return { id, name: id.slice(0, 4), isDefault, tokens, updatedAt: "2026-10-20T00:00:00.000Z" };
}

test("pickTheme: gewähltes Design, sonst Standard, sonst keines", () => {
	const themes = [theme(THEME_A, false, "#aa0000"), theme(THEME_B, true, "#00bb00")];
	assert.equal(pickTheme(themes, THEME_A)?.colors.primary, "#aa0000", "gewähltes Design");
	assert.equal(pickTheme(themes)?.colors.primary, "#00bb00", "ohne Wahl: Standard");
	assert.equal(pickTheme(themes, null)?.colors.primary, "#00bb00");
	assert.equal(pickTheme(themes, THEME_C)?.colors.primary, "#00bb00", "gelöschtes Design: Standard");
	assert.equal(pickTheme([theme(THEME_A, false, "#aa0000")], THEME_C), undefined, "ohne Standard: eingebautes Design");
	assert.equal(pickTheme([], THEME_A), undefined);
	assert.equal(pickTheme(themes, THEME_A.toUpperCase())?.colors.primary, "#aa0000", "Groß- und Kleinschreibung egal");
});

test("parseWebThemeRequest: Name, Standard-Markierung, Tokens", () => {
	const ok = parseWebThemeRequest({ name: "  CI Blau  ", isDefault: true, tokens: { colors: { primary: "#0000FF" } }, extra: 1 });
	assert.ok(ok.ok);
	assert.equal(ok.request.name, "CI Blau");
	assert.equal(ok.request.isDefault, true);
	assert.equal(ok.request.tokens.colors.primary, "#0000ff");
	assert.equal(ok.request.tokens.colors.text, DEFAULT_WEB_THEME_TOKENS.colors.text);
	const withoutDefault = parseWebThemeRequest({ name: "x", tokens: {} });
	assert.ok(withoutDefault.ok && withoutDefault.request.isDefault === false);

	assert.equal(parseWebThemeRequest(null).ok, false);
	assert.equal(parseWebThemeRequest([]).ok, false);
	assert.equal(parseWebThemeRequest({ name: "", tokens: {} }).ok, false);
	assert.equal(parseWebThemeRequest({ name: "   ", tokens: {} }).ok, false);
	assert.equal(parseWebThemeRequest({ name: "x".repeat(61), tokens: {} }).ok, false);
	assert.ok(parseWebThemeRequest({ name: "x".repeat(60), tokens: {} }).ok);
	assert.equal(parseWebThemeRequest({ name: "a\nb", tokens: {} }).ok, false);
	assert.equal(parseWebThemeRequest({ name: 5, tokens: {} }).ok, false);
	assert.equal(parseWebThemeRequest({ name: "x", isDefault: "yes", tokens: {} }).ok, false);
	assert.equal(parseWebThemeRequest({ name: "x" }).ok, false, "Tokens fehlen");
	assert.equal(parseWebThemeRequest({ name: "x", tokens: { colors: { text: "url(x)" } } }).ok, false);
});

test("parseWebThemeRequest: expectedUpdatedAt für optimistisches Sperren", () => {
	const create = parseWebThemeRequest({ name: "x", tokens: {} });
	assert.ok(create.ok && create.request.expectedUpdatedAt === null, "fehlt = neues Design");
	const explicitNull = parseWebThemeRequest({ name: "x", tokens: {}, expectedUpdatedAt: null });
	assert.ok(explicitNull.ok && explicitNull.request.expectedUpdatedAt === null);
	const update = parseWebThemeRequest({ name: "x", tokens: {}, expectedUpdatedAt: "2026-10-20T10:00:00.000Z" });
	assert.ok(update.ok && update.request.expectedUpdatedAt === "2026-10-20T10:00:00.000Z");
	assert.equal(parseWebThemeRequest({ name: "x", tokens: {}, expectedUpdatedAt: "" }).ok, false);
	assert.equal(parseWebThemeRequest({ name: "x", tokens: {}, expectedUpdatedAt: 5 }).ok, false);
	assert.equal(parseWebThemeRequest({ name: "x", tokens: {}, expectedUpdatedAt: "x".repeat(41) }).ok, false);
});

test("toWebTheme: DynamoDB-Eintrag prüfen und auffüllen", () => {
	const item = {
		tenantId: "t1",
		themeId: THEME_A,
		name: "CI",
		isDefault: true,
		tokens: { fontFamily: "serif" },
		updatedAt: "2026-10-20T10:00:00.000Z",
		updatedBy: "Anna"
	};
	const result = toWebTheme(item);
	assert.ok(result);
	assert.deepEqual(Object.keys(result).sort(), ["id", "isDefault", "name", "tokens", "updatedAt", "updatedBy"]);
	assert.equal(result.id, THEME_A);
	assert.equal(result.tokens.fontFamily, "serif");
	assert.deepEqual(result.tokens.text, DEFAULT_WEB_THEME_TOKENS.text);
	assert.equal(toWebTheme({ ...item, updatedBy: undefined })?.updatedBy, undefined);
	assert.equal(toWebTheme({ ...item, tokens: { fontFamily: "Comic Sans" } }), null);
	assert.equal(toWebTheme({ ...item, themeId: "x" }), null);
	assert.equal(toWebTheme(undefined), null);
	assert.ok(isValidThemeId(THEME_A));
	assert.equal(isValidThemeId("../a"), false);
});

console.log(`\n${passed} Tests bestanden`);
