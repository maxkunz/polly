import assert from "node:assert/strict";
import type { Survey, SurveyQuestion } from "../src/domain/survey/surveyTypes";
import { createDefaultChoiceOptions, createEmptyQuestion } from "../src/domain/survey/surveyTypes";
import { surveyRules } from "../src/domain/survey/surveyRules";
import { FlowTranslationError, translateSurveyForFlow } from "../src/domain/survey/flowTranslator";
import { measureFlowPayload } from "../src/domain/survey/flowPayload";
import { checkSurveyLockConflict, isSurveyLockOwnedBy, isSurveyLockStale, parseSurveyLock, surveyLockExpiresAtMs } from "../src/domain/survey/surveyLock";
import { validateSurvey } from "../src/domain/survey/surveyValidator";
import { SurveyFlowTranslationError } from "../src/services/surveyFlowTranslator";
import { TTS_TEXT_MAX_CHARS, SURVEY_MAX_QUESTIONS } from "../src/constants/surveyConstants";

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

function question(overrides: Partial<SurveyQuestion> = {}): SurveyQuestion {
	return { id: Q, name: "frage_47cc5f41", type: "comment", title: "Was können wir besser machen?", ...overrides };
}

function survey(questions: SurveyQuestion[], overrides: Partial<Survey> = {}): Survey {
	return { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", name: "test_a0eebc99", title: "Test", questions, ...overrides };
}

test("Gültige Umfrage ergibt keine Befunde", () => {
	assert.deepEqual(surveyRules(survey([question()])), []);
});

test("Befunde tragen Code und rohe Parameter, keinen Text", () => {
	const issues = surveyRules(survey([question()], { greeting_message: "x".repeat(TTS_TEXT_MAX_CHARS + 1) }));
	assert.equal(issues.length, 1);
	assert.equal(issues[0].code, "ttsTextTooLong");
	assert.deepEqual(issues[0].params, {
		label: "greeting",
		length: TTS_TEXT_MAX_CHARS + 1,
		max: TTS_TEXT_MAX_CHARS
	});
	assert.equal(issues[0].field, "survey.greeting_message");
	assert.ok(!("message" in issues[0]));
});

test("Mehr als 20 Fragen: surveyMaxQuestions mit Anzahl und Grenze", () => {
	const questions = Array.from({ length: SURVEY_MAX_QUESTIONS + 1 }, (_, i) => question({ id: `${Q}-${i}` }));
	const issues = surveyRules(survey(questions));
	assert.deepEqual(issues.map(issue => [issue.code, issue.params]), [
		["surveyMaxQuestions", { count: SURVEY_MAX_QUESTIONS + 1, max: SURVEY_MAX_QUESTIONS }]
	]);
});

test("Fehler an Fragen und Folgefragen nennen die Frage", () => {
	const issues = surveyRules(survey([
		question({
			type: "choice",
			options: { labels: [{ id: "a", label: "Ja" }, { id: "b", label: " ja " }] },
			follow_ups: [{ condition: { operator: "equals", value: "x" }, question: question({ id: "fu", title: "" }) }]
		})
	]));
	assert.deepEqual(issues.map(issue => [issue.code, issue.questionId, issue.params]), [
		["choiceOptionDuplicate", Q, { number: 2, otherNumber: 1 }],
		["followUpValueRequired", Q, {}],
		["questionTitleRequired", "fu", {}]
	]);
});

test("Web-Felder werden nur mit Option webSurvey geprüft", () => {
	const s = survey([question()], { base_url: "http://example.com", language: "xx" as never, web_theme_id: "kein-design" });
	assert.deepEqual(surveyRules(s).map(issue => issue.code), ["baseUrlInvalid", "languageInvalid", "webThemeInvalid"]);
	assert.deepEqual(surveyRules(s, { webSurvey: false }), []);
});

test("Adapter: gleiche Felder wie die Regeln, Meldung statt Code", () => {
	const s = survey([question({ title: "", reprompt_message: "x".repeat(TTS_TEXT_MAX_CHARS + 1) })]);
	const issues = surveyRules(s);
	const errors = validateSurvey(s);
	assert.deepEqual(
		errors.map(({ message: _message, ...rest }) => rest),
		issues.map(({ code: _code, params: _params, ...rest }) => rest)
	);
	assert.ok(errors.every(error => error.message && !error.message.startsWith("validation.")));
	// Zahlen beim TTS-Limit formatiert (de: Tausenderpunkt)
	assert.ok(errors[1].message.includes("3.001"), errors[1].message);
});

test("Translator: FlowTranslationError mit Schlüssel, Parametern und Frage", () => {
	const draft = survey([question({ type: "yes_no", follow_ups: [{ condition: { operator: "equals", value: "x" }, question: question({ id: "fu" }) }] })]);
	assert.throws(() => translateSurveyForFlow(draft), (error: unknown) => {
		assert.ok(error instanceof FlowTranslationError);
		assert.equal(error.key, "yesNoInvalidValue");
		assert.deepEqual(error.params, { value: `"x"` });
		assert.deepEqual(error.question, { id: Q, name: "frage_47cc5f41" });
		return true;
	});
	assert.throws(() => translateSurveyForFlow(""), (error: unknown) => error instanceof FlowTranslationError && error.key === "emptyDraft" && !error.question);
	assert.throws(() => measureFlowPayload("{kaputt"), (error: unknown) => error instanceof FlowTranslationError && error.key === "invalidJson");
});

test("Translator-Adapter übersetzt FlowTranslationError", () => {
	const error = new SurveyFlowTranslationError("noQuestions");
	assert.ok(!error.message.startsWith("translator."), error.message);
});

test("Lock: via wird gelesen, unbekannte Werte verworfen", () => {
	const lock = { locked_by: "Anna", locked_since: "2026-10-30T10:00:00.000Z" };
	assert.deepEqual(parseSurveyLock(JSON.stringify({ ...lock, via: "mcp" })), { ...lock, via: "mcp" });
	assert.deepEqual(parseSurveyLock({ ...lock, via: "ui" }), { ...lock, via: "ui" });
	assert.deepEqual(parseSurveyLock({ ...lock, via: "bot" }), lock);
	assert.deepEqual(parseSurveyLock(lock), lock);
});

test("Lock: Besitz, Ablauf und Konflikt mit übergebener Uhr", () => {
	const lock = { locked_by: " Anna ", locked_since: "2026-10-30T10:00:00.000Z" };
	const since = Date.parse(lock.locked_since);
	assert.ok(isSurveyLockOwnedBy(lock, "anna"));
	assert.ok(!isSurveyLockOwnedBy(lock, "  "));
	assert.equal(surveyLockExpiresAtMs(lock, 60), since + 60 * 60 * 1000);
	assert.equal(surveyLockExpiresAtMs({ locked_by: "Anna", locked_since: "kaputt" }), null);
	assert.ok(!isSurveyLockStale(lock, 60, since + 59 * 60 * 1000));
	assert.ok(isSurveyLockStale(lock, 60, since + 60 * 60 * 1000));
	assert.ok(isSurveyLockStale({ locked_by: "", locked_since: lock.locked_since }, 60, since));
	assert.ok(checkSurveyLockConflict(lock, "Bert", 60, since).hasConflict);
	assert.ok(!checkSurveyLockConflict(lock, "Bert", 60, since + 2 * 60 * 60 * 1000).hasConflict);
	assert.ok(!checkSurveyLockConflict(lock, "ANNA", 60, since).hasConflict);
});

test("Choice-Vorgaben kommen vom Aufrufer", () => {
	assert.deepEqual(createDefaultChoiceOptions(n => `Option ${n}`).labels.map(label => label.label), ["Option 1", "Option 2"]);
	const custom = createEmptyQuestion("choice", n => `Antwort ${n}`);
	assert.deepEqual((custom.options as { labels: { label: string }[] }).labels.map(label => label.label), ["Antwort 1", "Antwort 2"]);
	// Ohne Aufrufer-Text neutral vorbelegt, damit die neue Frage nicht sofort ungültig ist
	const choice = createEmptyQuestion("choice");
	assert.deepEqual((choice.options as { labels: { label: string }[] }).labels.map(label => label.label), ["Option 1", "Option 2"]);
	const codes = surveyRules(survey([{ ...choice, title: "Welche?" }])).map(issue => issue.code);
	assert.ok(!codes.includes("choiceOptionEmpty"), codes.join(", "));
});

console.log(`\n${passed} Tests bestanden`);
