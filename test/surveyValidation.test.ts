import assert from "node:assert/strict";
import type { FollowUpRule, QuestionOptions, Survey, SurveyQuestion } from "../src/domain/survey/surveyTypes";
import { resetWebSettings } from "../src/domain/survey/surveyTypes";
import { validateSurvey } from "../src/domain/survey/surveyValidator";
import { questionFieldIds, surveyFieldIds } from "../src/domain/survey/surveyFieldIds";
import { BASE_URL_MAX_CHARS, baseUrlError } from "../src/domain/survey/invitationLinks";

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

const Q = "47cc5f41-3b76-47b2-bd77-17bc2d44cfba";
const FU = "7d52f6c9-0a63-4b08-8e6f-4a377d611867";

function question(overrides: Partial<SurveyQuestion>): SurveyQuestion {
	return { id: Q, name: `frage_${Q.slice(0, 8)}`, type: "comment", title: "Frage", ...overrides };
}

function followUp(condition: FollowUpRule["condition"]): FollowUpRule {
	return {
		condition,
		question: { id: FU, name: "folgefrage_7d52f6c9", type: "comment", title: "Warum?" }
	};
}

function survey(questions: SurveyQuestion[]): Survey {
	return { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", name: "test_a0eebc99", title: "Test", questions };
}

function fieldIdsOf(s: Survey): (string | undefined)[] {
	return validateSurvey(s).map(e => e.fieldId);
}

test("jeder Fehler einer gültig aufgebauten Umfrage hat eine Feld-ID", () => {
	const errors = validateSurvey(
		survey([
			question({ title: "", type: "rating", options: { min_value: 5, max_value: 3 } }),
			question({ id: FU, type: "choice", options: { labels: [{ id: "a", label: "" }] } })
		])
	);
	assert.ok(errors.length > 0);
	assert.ok(errors.every(e => e.fieldId), JSON.stringify(errors));
});

test("Umfrage ohne Fragen verweist auf den Fragenbereich", () => {
	assert.deepEqual(fieldIdsOf(survey([])), [surveyFieldIds.questions]);
});

test("Rating min/max verweist auf die Eingabefelder", () => {
	assert.deepEqual(
		fieldIdsOf(survey([question({ type: "rating", options: { min_value: 9, max_value: 3 } })])),
		[questionFieldIds.ratingMin(Q), questionFieldIds.ratingMin(Q)]
	);
	assert.deepEqual(
		fieldIdsOf(survey([question({ type: "rating", options: { min_value: 1, max_value: 9 } })])),
		[questionFieldIds.ratingMax(Q)]
	);
});

test("zu wenige Auswahloptionen verweisen auf den Optionsbereich, leere Option auf ihr Feld", () => {
	assert.deepEqual(
		fieldIdsOf(survey([question({ type: "choice", options: { labels: [{ id: "a", label: "" }] } })])),
		[questionFieldIds.options(Q), questionFieldIds.choiceOption(Q, 0)]
	);
});

test("Bedingungswert muss zum Typ der Elternfrage passen", () => {
	const choice = { labels: [{ id: "a", label: "A" }, { id: "b", label: "B" }] };
	const invalid: Array<[SurveyQuestion["type"], unknown, QuestionOptions | undefined]> = [
		["choice", "", choice],
		["choice", "geloescht", choice],
		["yes_no", "", undefined],
		["rating", null, { min_value: 1, max_value: 5 }],
		["nps", "", undefined]
	];
	for (const [type, value, options] of invalid) {
		const ids = fieldIdsOf(
			survey([question({ type, options, follow_ups: [followUp({ operator: "equals", value: value as never })] })])
		);
		assert.deepEqual(ids, [questionFieldIds.conditionValue(Q, 0)], `${type} mit ${JSON.stringify(value)}`);
	}

	const valid: Array<[SurveyQuestion["type"], unknown, QuestionOptions | undefined]> = [
		["choice", "b", choice],
		["yes_no", false, undefined],
		["rating", 3, { min_value: 1, max_value: 5 }],
		["nps", 0, undefined]
	];
	for (const [type, value, options] of valid) {
		const errors = validateSurvey(
			survey([question({ type, options, follow_ups: [followUp({ operator: "equals", value: value as never })] })])
		);
		assert.deepEqual(errors, [], `${type} mit ${JSON.stringify(value)}`);
	}
});

test("Kommentarfrage mit Folgefragen verweist auf den Folgefragenbereich", () => {
	assert.deepEqual(
		fieldIdsOf(survey([question({ type: "comment", follow_ups: [followUp({ operator: "equals", value: 1 })] })])),
		[questionFieldIds.followUps(Q)]
	);
});

test("Folgefragen nutzen dieselben Feld-IDs wie Hauptfragen", () => {
	const s = survey([question({ type: "yes_no", follow_ups: [followUp({ operator: "equals", value: true })] })]);
	s.questions[0].follow_ups![0].question.title = "";
	assert.deepEqual(fieldIdsOf(s), [questionFieldIds.title(FU)]);
});

test("Folgefragen mit eigenen Folgefragen verweisen auf den Folgefragenbereich der Elternfrage", () => {
	const s = survey([question({ type: "yes_no", follow_ups: [followUp({ operator: "equals", value: true })] })]);
	const nested = s.questions[0].follow_ups![0].question;
	nested.type = "yes_no";
	nested.follow_ups = [
		{ condition: { operator: "equals", value: true }, question: { id: "c4d2b8a0-1111-4222-8333-944455556666", name: "x_c4d2b8a0", type: "comment", title: "" } }
	];
	// Nur der Tiefenfehler – die verschachtelte Frage (leerer Titel) wird nicht weiter geprüft
	assert.deepEqual(fieldIdsOf(s), [questionFieldIds.followUps(Q)]);
});

function fieldsOf(s: Survey): string[] {
	return validateSurvey(s).map(e => e.field);
}

test("Basis-URL: leer und gültige https-URLs sind erlaubt", () => {
	for (const baseUrl of [undefined, "", "  ", "https://example.com", "https://example.com/{token}", "https://example.com/umfrage?x=1", "https://example.com/?t={token}"]) {
		assert.deepEqual(fieldIdsOf({ ...survey([question({})]), base_url: baseUrl }), [], String(baseUrl));
	}
});

test("Basis-URL: http, relative URLs, Leerzeichen und mehrere Platzhalter verweisen auf das Feld", () => {
	for (const baseUrl of ["http://example.com", "example.com", "/s/{token}", "https://exa mple.com", "https://", "javascript:alert(1)", "https://example.com/{token}/{token}"]) {
		assert.deepEqual(fieldIdsOf({ ...survey([question({})]), base_url: baseUrl }), [surveyFieldIds.baseUrl], baseUrl);
	}
});

test("Basis-URL: höchstens BASE_URL_MAX_CHARS Zeichen", () => {
	const prefix = "https://example.com/";
	const atLimit = prefix + "a".repeat(BASE_URL_MAX_CHARS - prefix.length);
	assert.deepEqual(fieldIdsOf({ ...survey([question({})]), base_url: atLimit }), []);
	assert.deepEqual(fieldIdsOf({ ...survey([question({})]), base_url: atLimit + "a" }), [surveyFieldIds.baseUrl]);
	assert.equal(baseUrlError(atLimit + "a"), "baseUrlTooLong");
});

test("Sprache: nur de, en, fr; fehlend ist erlaubt", () => {
	for (const language of [undefined, "de", "en", "fr"] as const) {
		assert.deepEqual(fieldIdsOf({ ...survey([question({})]), language }), [], String(language));
	}
	assert.deepEqual(fieldIdsOf({ ...survey([question({})]), language: "xx" as never }), [surveyFieldIds.language]);
});

test("Web-Design: nur UUID; fehlend ist erlaubt", () => {
	assert.deepEqual(fieldIdsOf(survey([question({})])), []);
	assert.deepEqual(fieldIdsOf({ ...survey([question({})]), web_theme_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }), []);
	for (const value of ["", "default", "../x", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaaa"]) {
		assert.deepEqual(fieldIdsOf({ ...survey([question({})]), web_theme_id: value }), [surveyFieldIds.webTheme], value);
	}
});

test("Min/Max-Labels bei rating und nps sind auf 100 Zeichen begrenzt", () => {
	const ok = "a".repeat(100);
	const tooLong = "a".repeat(101);
	assert.deepEqual(fieldIdsOf(survey([question({ type: "nps", options: { min_label: ok, max_label: ok } })])), []);
	assert.deepEqual(
		fieldIdsOf(survey([question({ type: "nps", options: { min_label: tooLong, max_label: tooLong } })])),
		[questionFieldIds.minLabel(Q), questionFieldIds.maxLabel(Q)]
	);
	assert.deepEqual(
		fieldsOf(survey([question({ type: "rating", options: { min_value: 1, max_value: 5, max_label: tooLong } })])),
		[`${Q}.options.max_label`]
	);
	assert.deepEqual(
		fieldIdsOf(survey([question({ type: "rating", options: { min_value: 1, max_value: 5, max_label: tooLong } })])),
		[questionFieldIds.maxLabel(Q)]
	);
});

test("Ohne Feature Flag web_survey werden die Web-Felder nicht geprüft", () => {
	const s = { ...survey([question({})]), base_url: "http://x", language: "xx" as never, web_theme_id: "default" };
	assert.deepEqual(validateSurvey(s, { webSurvey: false }).map(e => e.fieldId), []);
	assert.deepEqual(validateSurvey(s).map(e => e.fieldId), [surveyFieldIds.baseUrl, surveyFieldIds.language, surveyFieldIds.webTheme]);
});

test("resetWebSettings setzt die Standardwerte einer neuen Umfrage", () => {
	const s: Survey = { ...survey([question({})]), base_url: "https://example.com/{token}", language: "fr", web_theme_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
	resetWebSettings(s);
	assert.equal(s.base_url, "");
	assert.equal(s.language, "de");
	assert.equal("web_theme_id" in s, false);
});

console.log(`\n${passed} Tests bestanden`);
