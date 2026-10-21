import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FlowCondition, FlowSurvey } from "../src/domain/survey/flowTypes";
import { getReachableQuestions } from "../src/domain/survey/flowNavigation";
import type { WebSurvey } from "../src/domain/survey/webSurveyTypes";
import {
	WEB_SURVEY_MAX_TOKEN_CHARS,
	WEB_SURVEY_THROTTLE_RETRY_DELAY_MS,
	answersForSubmit,
	classifyLoadResponse,
	classifySubmitResponse,
	createSubmissionId,
	isWebSurvey,
	pickBrowserLanguage,
	questionDepths,
	readInvitationToken,
	retryOnceWhenThrottled,
	scaleValues,
	unreachableAnswerIds
} from "../src/domain/survey/webSurveyPage";
import { toWebSurvey } from "../amplify/functions/shared/web_survey_format";
import { DEFAULT_WEB_THEME_TOKENS } from "../src/domain/webTheme/webTheme";

let passed = 0;
const pending: Promise<void>[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
	const run = async () => {
		try {
			await fn();
			passed++;
			console.log(`ok - ${name}`);
		} catch (error) {
			console.error(`FAIL - ${name}`);
			throw error;
		}
	};
	pending.push(run());
}

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ0IjoxfQ.abc-_123";

// Hauptfragen RATING → KOMMENTAR; Folgefragen: RATING < 3 → GRUND (choice), GRUND „Preis“ → PREIS_DETAIL (verschachtelt)
const RATING = "11111111-1111-4111-8111-111111111111";
const GRUND = "22222222-2222-4222-8222-222222222222";
const PREIS_DETAIL = "33333333-3333-4333-8333-333333333333";
const KOMMENTAR = "44444444-4444-4444-8444-444444444444";
const EMPFEHLUNG = "55555555-5555-4555-8555-555555555555";

function base(id: string, defaultNext: string | null, mandatory = false) {
	return {
		id,
		name: `frage_${id.slice(0, 8)}`,
		prompt: `Frage ${id.slice(0, 8)}`,
		description: "",
		reprompt: "",
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

const FLOW: FlowSurvey = {
	id: "99999999-9999-4999-8999-999999999999",
	name: "web_99999999",
	title: "Web-Umfrage",
	description: "intern",
	greeting_prompt: "Hallo",
	closing_prompt: "Danke",
	language: "en",
	start_question_id: RATING,
	version: 4,
	type: "Flow",
	questions: [
		{
			...base(RATING, EMPFEHLUNG, true),
			type: "rating",
			options: { values: [1, 2, 3, 4, 5], min_value: 1, max_value: 5, min_label: "schlecht", max_label: "gut" },
			conditional_next_question: conditions([3, GRUND])
		},
		{
			...base(GRUND, EMPFEHLUNG),
			type: "choice",
			labels: ["Preis", "Service"],
			synonyms: ["", ""],
			next_question_ids: [PREIS_DETAIL, null]
		},
		{ ...base(PREIS_DETAIL, EMPFEHLUNG), type: "comment" },
		{
			...base(EMPFEHLUNG, KOMMENTAR),
			type: "nps",
			conditional_next_question: conditions([-1000, null])
		},
		{ ...base(KOMMENTAR, null), type: "comment" }
	]
};

const SURVEY: WebSurvey = toWebSurvey(FLOW);

// ---------------------------------------------------------------------------
// Token und Sprache
// ---------------------------------------------------------------------------

test("Token aus /s/<jwt>, mit Schrägstrich am Ende und URL-kodiert", () => {
	assert.equal(readInvitationToken(`/s/${JWT}`, ""), JWT);
	assert.equal(readInvitationToken(`/s/${JWT}/`, ""), JWT);
	assert.equal(readInvitationToken(`/s/${encodeURIComponent(JWT)}`, ""), JWT);
});

test("Token aus ?token=, Pfad hat Vorrang", () => {
	assert.equal(readInvitationToken("/survey.html", `?token=${JWT}`), JWT);
	assert.equal(readInvitationToken("/survey.html", `?x=1&token=${JWT}`), JWT);
	assert.equal(readInvitationToken(`/s/${JWT}`, "?token=aaa.bbb.ccc"), JWT);
	assert.equal(readInvitationToken("/s/", `?token=${JWT}`), JWT);
});

test("kein oder unplausibler Token ⇒ leer (Seite zeigt „ungültig“ ohne Backend-Aufruf)", () => {
	assert.equal(readInvitationToken("/survey.html", ""), "");
	assert.equal(readInvitationToken("/s/", ""), "");
	assert.equal(readInvitationToken("/s/%E0%A4%A", ""), "", "kaputte Prozent-Kodierung");
	assert.equal(readInvitationToken("/s/<script>.a.b", ""), "");
	assert.equal(readInvitationToken("/survey.html", "?token=abc"), "", "nur ein Teil");
	assert.equal(readInvitationToken("/survey.html", "?token=a.b.c.d"), "", "vier Teile");
	assert.equal(readInvitationToken("/survey.html", "?token=a.b%20c.d"), "");
	const tooLong = `${"a".repeat(WEB_SURVEY_MAX_TOKEN_CHARS)}.b.c`;
	assert.equal(readInvitationToken(`/s/${tooLong}`, ""), "");
});

test("Browsersprache: erste unterstützte, sonst de", () => {
	assert.equal(pickBrowserLanguage(["fr-CA", "de"]), "fr");
	assert.equal(pickBrowserLanguage(["es-ES", "en-US"]), "en");
	assert.equal(pickBrowserLanguage(["EN"]), "en");
	assert.equal(pickBrowserLanguage(["es", "it"]), "de");
	assert.equal(pickBrowserLanguage([]), "de");
});

// ---------------------------------------------------------------------------
// Antworten der API
// ---------------------------------------------------------------------------

test("isWebSurvey akzeptiert das bereinigte Flow-JSON der Lambda", () => {
	assert.ok(isWebSurvey(SURVEY));
	assert.equal(SURVEY.language, "en");
	assert.ok(isWebSurvey(toWebSurvey({ ...FLOW, language: undefined })), "älterer Stand ohne language ⇒ de");
});

test("isWebSurvey lehnt unbrauchbare Fassungen ab", () => {
	assert.ok(!isWebSurvey(null));
	assert.ok(!isWebSurvey({ ...SURVEY, questions: [] }));
	assert.ok(!isWebSurvey({ ...SURVEY, language: "es" }));
	assert.ok(!isWebSurvey({ ...SURVEY, version: "4" }));
	assert.ok(!isWebSurvey({ ...SURVEY, questions: [{ ...SURVEY.questions[4], type: "unknown" }] }));
	assert.ok(!isWebSurvey({ ...SURVEY, questions: [{ ...SURVEY.questions[1], labels: [1, 2] }] }));
	const huge = { ...SURVEY.questions[0], options: { values: [], min_value: 0, max_value: 1_000_000 } };
	assert.ok(!isWebSurvey({ ...SURVEY, questions: [huge] }), "riesige Skala");
});

test("Laden: Status der Lambda und Drosselung", () => {
	assert.deepEqual(classifyLoadResponse(200, { status: "ok", survey: SURVEY }), { kind: "ok", survey: SURVEY, preview: false });
	for (const status of ["invalid", "expired", "used", "unavailable"] as const) {
		assert.deepEqual(classifyLoadResponse(200, { status }), { kind: status });
	}
	assert.deepEqual(classifyLoadResponse(429, { message: "Too Many Requests" }), { kind: "throttled" });
	assert.deepEqual(classifyLoadResponse(429, { status: "throttled" }), { kind: "throttled" });
	assert.deepEqual(classifyLoadResponse(502, { status: "error" }), { kind: "error" });
	assert.deepEqual(classifyLoadResponse(200, { status: "ok", survey: { id: "x" } }), { kind: "error" });
	assert.deepEqual(classifyLoadResponse(200, null), { kind: "error" });
	assert.deepEqual(classifyLoadResponse(500, "<html>"), { kind: "error" });
});

test("Laden: Webvorschau nur bei preview === true", () => {
	assert.deepEqual(classifyLoadResponse(200, { status: "ok", survey: SURVEY, preview: true }), { kind: "ok", survey: SURVEY, preview: true });
	assert.deepEqual(classifyLoadResponse(200, { status: "ok", survey: SURVEY, preview: "true" }), { kind: "ok", survey: SURVEY, preview: false });
	assert.deepEqual(classifyLoadResponse(200, { status: "ok", survey: SURVEY, preview: 1 }), { kind: "ok", survey: SURVEY, preview: false });
	// Vorschau-Absendung ohne Speicherung ist für die Seite ein normales ok
	assert.deepEqual(classifySubmitResponse(200, { status: "ok", preview: true }), { kind: "ok" });
});

test("Absenden: Status der Lambda", () => {
	assert.deepEqual(classifySubmitResponse(200, { status: "ok" }), { kind: "ok" });
	assert.deepEqual(classifySubmitResponse(403, { status: "invalid" }), { kind: "invalid" });
	assert.deepEqual(classifySubmitResponse(403, { status: "expired" }), { kind: "expired" });
	assert.deepEqual(classifySubmitResponse(409, { status: "used" }), { kind: "used" });
	assert.deepEqual(classifySubmitResponse(404, { status: "unavailable" }), { kind: "unavailable" });
	assert.deepEqual(classifySubmitResponse(409, { status: "survey_changed", survey: SURVEY }), { kind: "survey_changed", survey: SURVEY });
	assert.deepEqual(classifySubmitResponse(409, { status: "survey_changed" }), { kind: "survey_changed", survey: null });
	assert.deepEqual(classifySubmitResponse(429, {}), { kind: "throttled" });
	assert.deepEqual(classifySubmitResponse(400, { status: "invalid_request" }), { kind: "error" });
	assert.deepEqual(classifySubmitResponse(413, { status: "payload_too_large" }), { kind: "error" });
	assert.deepEqual(classifySubmitResponse(502, { status: "error" }), { kind: "error" });
	assert.deepEqual(classifySubmitResponse(200, { status: "used" }), { kind: "used" });
});

test("Design: gültiges übernehmen, ungültiges und fehlendes ignorieren", () => {
	const theme = { fontFamily: "serif", colors: { primary: "#AA0000" } };
	const expected = {
		...DEFAULT_WEB_THEME_TOKENS,
		fontFamily: "serif",
		colors: { ...DEFAULT_WEB_THEME_TOKENS.colors, primary: "#aa0000" }
	};
	assert.deepEqual(classifyLoadResponse(200, { status: "ok", survey: SURVEY, theme }), { kind: "ok", survey: SURVEY, theme: expected, preview: false });
	assert.deepEqual(classifyLoadResponse(404, { status: "unavailable", theme }), { kind: "unavailable", theme: expected });
	assert.deepEqual(classifySubmitResponse(409, { status: "used", theme }), { kind: "used", theme: expected });
	assert.deepEqual(
		classifySubmitResponse(409, { status: "survey_changed", survey: SURVEY, theme }),
		{ kind: "survey_changed", survey: SURVEY, theme: expected }
	);
	// Ungültiges Design ist kein Fehler: Die Umfrage erscheint im eingebauten Design
	const invalid = { colors: { text: "url(https://evil.example)" } };
	assert.deepEqual(classifyLoadResponse(200, { status: "ok", survey: SURVEY, theme: invalid }), { kind: "ok", survey: SURVEY, preview: false });
	assert.deepEqual(classifyLoadResponse(200, { status: "ok", survey: SURVEY, theme: null }), { kind: "ok", survey: SURVEY, preview: false });
	assert.deepEqual(classifySubmitResponse(409, { status: "survey_changed", survey: SURVEY, theme: "x" }), { kind: "survey_changed", survey: SURVEY });
	// Fehler und Drosselung tragen nie ein Design
	assert.deepEqual(classifyLoadResponse(502, { status: "error", theme }), { kind: "error" });
	assert.deepEqual(classifySubmitResponse(200, { status: "ok", theme }), { kind: "ok" });
});

test("Absenden: invalid_answers übernimmt nur wohlgeformte Fehler", () => {
	const result = classifySubmitResponse(400, {
		status: "invalid_answers",
		errors: [
			{ questionId: RATING, code: "required", extra: 1 },
			{ questionId: null, code: "invalid_answers" },
			{ questionId: 5, code: "required" },
			{ questionId: RATING, code: "<b>x</b>" },
			"text"
		]
	});
	assert.deepEqual(result, {
		kind: "invalid_answers",
		errors: [
			{ questionId: RATING, code: "required" },
			{ questionId: null, code: "invalid_answers" }
		]
	});
	assert.deepEqual(classifySubmitResponse(400, { status: "invalid_answers" }), { kind: "invalid_answers", errors: [] });
});

test("429: genau ein automatischer Wiederholungsversuch nach ca. 2 s", async () => {
	const waits: number[] = [];
	const wait = async (ms: number) => { waits.push(ms); };
	const sequence = (...kinds: string[]) => {
		let calls = 0;
		return { request: async () => ({ kind: kinds[Math.min(calls++, kinds.length - 1)] }), calls: () => calls };
	};

	const okFirst = sequence("ok");
	assert.equal((await retryOnceWhenThrottled(okFirst.request, wait)).kind, "ok");
	assert.equal(okFirst.calls(), 1);
	assert.deepEqual(waits, []);

	const okSecond = sequence("throttled", "ok");
	assert.equal((await retryOnceWhenThrottled(okSecond.request, wait)).kind, "ok");
	assert.equal(okSecond.calls(), 2);
	assert.deepEqual(waits, [WEB_SURVEY_THROTTLE_RETRY_DELAY_MS]);

	const always = sequence("throttled");
	assert.equal((await retryOnceWhenThrottled(always.request, wait)).kind, "throttled");
	assert.equal(always.calls(), 2);
});

// ---------------------------------------------------------------------------
// Formular
// ---------------------------------------------------------------------------

test("Einrückung: Hauptfragen 0, Folgefragen unter ihrer Elternfrage, verschachtelt tiefer", () => {
	const depthsFor = (answers: Record<string, unknown>) => {
		const reachable = getReachableQuestions(SURVEY, answers);
		const depths = questionDepths(SURVEY, reachable);
		return reachable.map(question => [question.id, depths.get(question.id)]);
	};
	assert.deepEqual(depthsFor({}), [[RATING, 0], [EMPFEHLUNG, 0], [KOMMENTAR, 0]]);
	assert.deepEqual(depthsFor({ [RATING]: 1 }), [[RATING, 0], [GRUND, 1], [EMPFEHLUNG, 0], [KOMMENTAR, 0]]);
	assert.deepEqual(depthsFor({ [RATING]: 1, [GRUND]: "Preis" }), [
		[RATING, 0], [GRUND, 1], [PREIS_DETAIL, 2], [EMPFEHLUNG, 0], [KOMMENTAR, 0]
	]);
});

test("weggefallene Folgefragen: ihre Antworten werden verworfen", () => {
	const answers = { [RATING]: 5, [GRUND]: "Preis", [PREIS_DETAIL]: "zu teuer", [KOMMENTAR]: "ok" };
	assert.deepEqual(unreachableAnswerIds(SURVEY, answers).sort(), [GRUND, PREIS_DETAIL].sort());
	assert.deepEqual(unreachableAnswerIds(SURVEY, { ...answers, [RATING]: 1 }), []);
});

test("Antworten zum Absenden: getrimmt, nur gültige Antworten auf erreichbare Fragen", () => {
	assert.deepEqual(
		answersForSubmit(SURVEY, {
			[RATING]: 1,
			[GRUND]: "Service",
			[PREIS_DETAIL]: "nicht erreichbar",
			[EMPFEHLUNG]: 11,
			[KOMMENTAR]: "  danke  ",
			unbekannt: "x"
		}),
		{ [RATING]: 1, [GRUND]: "Service", [KOMMENTAR]: "danke" }
	);
	assert.deepEqual(answersForSubmit(SURVEY, { [KOMMENTAR]: "   " }), {});
});

test("Skalenwerte: rating aus values (sortiert, im Bereich), sonst Bereich; nps 0..10", () => {
	const rating = SURVEY.questions[0];
	const nps = SURVEY.questions[3];
	assert.ok(rating.type === "rating" && nps.type === "nps");
	assert.deepEqual(scaleValues(rating), [1, 2, 3, 4, 5]);
	assert.deepEqual(scaleValues({ ...rating, options: { ...rating.options, values: [5, 1, 3, 3, 9, 2.5] } }), [1, 3, 5]);
	assert.deepEqual(scaleValues({ ...rating, options: { ...rating.options, values: [] } }), [1, 2, 3, 4, 5]);
	assert.deepEqual(scaleValues(nps), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("Lambda-Bundle: webSurveyPage und alle importierten Module kommen ohne @/-Alias und Pakete aus", () => {
	// Die Lambda web_survey importiert die Token-Grenze von hier (siehe Hinweis in flowTypes.ts)
	const root = resolve(dirname(new URL(import.meta.url).pathname), "../src/domain/survey/webSurveyPage.ts");
	const seen = new Set<string>();
	const queue = [root];
	while (queue.length > 0) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)) {
			const specifier = match[1] ?? match[2];
			assert.ok(specifier.startsWith("."), `${file}: Import "${specifier}" ist nicht relativ`);
			queue.push(resolve(dirname(file), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`));
		}
	}
	assert.ok(seen.size >= 3);
});

test("createSubmissionId: UUID v4, bei jedem Aufruf neu", () => {
	const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
	const first = createSubmissionId();
	assert.match(first, uuidV4);
	assert.notEqual(createSubmissionId(), first);
	// Version und Variante werden auch bei lauter 0xff-Bytes gesetzt
	const allOnes = createSubmissionId({ getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
		(array as unknown as Uint8Array).fill(0xff);
		return array;
	} });
	assert.equal(allOnes, "ffffffff-ffff-4fff-bfff-ffffffffffff");
});

await Promise.all(pending);
console.log(`\n${passed} Tests bestanden`);
