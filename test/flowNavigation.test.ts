import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
	getNextQuestionId,
	getReachableQuestions,
	isAnswerValueValid,
	pruneFlowAnswers,
	validateFlowAnswers,
	type FlowAnswers
} from "../src/domain/survey/flowNavigation";
import type { FlowCondition, FlowQuestion, FlowSurvey } from "../src/domain/survey/flowTypes";
import type { Survey } from "../src/domain/survey/surveyTypes";
import { translateSurveyObject } from "../src/services/surveyFlowTranslator";

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

// Beispiel aus documentation/survey_translator_for_flow.md (ohne Synonyme/Reprompts, für die Navigation irrelevant)
const ZUFRIEDENHEIT = "0c1b7195-1c3a-4856-b2f1-89733e9404b0";
const WARUM_UNZUFRIEDEN = "f1f68a0b-8b3c-4715-ad03-ff9cfc8ff9b3";
const HINWEIS_SUPER = "7aec5fd3-7f1a-41ca-82d3-25a29250837b";
const EMPFEHLUNG = "85a238d2-78da-4ad5-9291-277394544779";
const WARUM_NICHT_EMPFEHLEN = "0f2bf646-3e62-4777-9e87-4f3445dfb8e6";
const WAS_GEFAELLT_GUT = "c5a6e5c1-96cd-4bea-bd5e-d92696deb6a6";
const KONTAKT_GEKLAERT = "86c4a809-d823-4946-9750-3069112948eb";
const WARUM_NICHT_GEKLAERT = "15dc33d5-da74-4655-a3ae-3d8093ffc1bc";

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

function conditions(
	equals: [number, string | null] = [-1, null],
	lessThan: [number, string | null] = [-1000, null],
	greaterThan: [number, string | null] = [1000, null]
): FlowCondition[] {
	return [
		{ operator: "equals", value: equals[0], next_question_id: equals[1] },
		{ operator: "less_than", value: lessThan[0], next_question_id: lessThan[1] },
		{ operator: "greater_than", value: greaterThan[0], next_question_id: greaterThan[1] }
	];
}

const SURVEY: FlowSurvey = {
	id: "90f142be-4066-43cd-abef-31a426421b77",
	name: "kundenservice_90f142be",
	title: "Kundenservice Feedback",
	description: "",
	greeting_prompt: "",
	closing_prompt: "",
	start_question_id: ZUFRIEDENHEIT,
	version: 3,
	type: "Flow",
	questions: [
		{
			...base(ZUFRIEDENHEIT, EMPFEHLUNG, true),
			type: "rating",
			options: { values: [0, 1, 2, 3, 4, 5, 6], min_value: 0, max_value: 6 },
			conditional_next_question: conditions(undefined, [2, WARUM_UNZUFRIEDEN], [4, HINWEIS_SUPER])
		},
		{
			...base(WARUM_UNZUFRIEDEN, EMPFEHLUNG),
			type: "choice",
			labels: ["Inhalt", "Freundlichkeit", "Beides"],
			synonyms: ["", "", ""],
			next_question_ids: [null, null, null]
		},
		{ ...base(HINWEIS_SUPER, EMPFEHLUNG), type: "comment" },
		{
			...base(EMPFEHLUNG, KONTAKT_GEKLAERT),
			type: "nps",
			conditional_next_question: conditions(undefined, [7, WARUM_NICHT_EMPFEHLEN], [8, WAS_GEFAELLT_GUT])
		},
		{ ...base(WARUM_NICHT_EMPFEHLEN, KONTAKT_GEKLAERT), type: "comment" },
		{ ...base(WAS_GEFAELLT_GUT, KONTAKT_GEKLAERT), type: "comment" },
		{
			...base(KONTAKT_GEKLAERT, null, true),
			type: "yes_no",
			options: { yes_next_question_id: null, no_next_question_id: WARUM_NICHT_GEKLAERT }
		},
		{ ...base(WARUM_NICHT_GEKLAERT, null), type: "comment" }
	]
};

function question(survey: FlowSurvey, id: string): FlowQuestion {
	const found = survey.questions.find(q => q.id === id);
	assert.ok(found, id);
	return found;
}

function reachableIds(survey: FlowSurvey, answers: FlowAnswers): string[] {
	return getReachableQuestions(survey, answers).map(q => q.id);
}

// ---------------------------------------------------------------------------
// Verzweigungen
// ---------------------------------------------------------------------------

test("ohne Antworten: nur die Hauptfragen, Folgefragen bleiben ausgeblendet", () => {
	assert.deepEqual(reachableIds(SURVEY, {}), [ZUFRIEDENHEIT, EMPFEHLUNG, KONTAKT_GEKLAERT]);
});

test("rating: less_than und greater_than blenden die jeweilige Folgefrage direkt unter der Elternfrage ein", () => {
	assert.deepEqual(reachableIds(SURVEY, { [ZUFRIEDENHEIT]: 1 }), [ZUFRIEDENHEIT, WARUM_UNZUFRIEDEN, EMPFEHLUNG, KONTAKT_GEKLAERT]);
	assert.deepEqual(reachableIds(SURVEY, { [ZUFRIEDENHEIT]: 5 }), [ZUFRIEDENHEIT, HINWEIS_SUPER, EMPFEHLUNG, KONTAKT_GEKLAERT]);
});

test("rating: Vergleiche sind strikt (Grenzwerte lösen keine Folgefrage aus)", () => {
	for (const value of [2, 3, 4]) {
		assert.deepEqual(reachableIds(SURVEY, { [ZUFRIEDENHEIT]: value }), [ZUFRIEDENHEIT, EMPFEHLUNG, KONTAKT_GEKLAERT], String(value));
	}
});

test("nps: Verzweigung über less_than / greater_than, dazwischen default", () => {
	assert.equal(getNextQuestionId(question(SURVEY, EMPFEHLUNG), 6), WARUM_NICHT_EMPFEHLEN);
	assert.equal(getNextQuestionId(question(SURVEY, EMPFEHLUNG), 7), KONTAKT_GEKLAERT);
	assert.equal(getNextQuestionId(question(SURVEY, EMPFEHLUNG), 8), KONTAKT_GEKLAERT);
	assert.equal(getNextQuestionId(question(SURVEY, EMPFEHLUNG), 9), WAS_GEFAELLT_GUT);
});

test("yes_no: Verweis null bei ja ⇒ default (hier Umfrage-Ende), nein ⇒ Folgefrage", () => {
	assert.equal(getNextQuestionId(question(SURVEY, KONTAKT_GEKLAERT), true), null);
	assert.equal(getNextQuestionId(question(SURVEY, KONTAKT_GEKLAERT), false), WARUM_NICHT_GEKLAERT);
	assert.deepEqual(reachableIds(SURVEY, { [KONTAKT_GEKLAERT]: false }), [ZUFRIEDENHEIT, EMPFEHLUNG, KONTAKT_GEKLAERT, WARUM_NICHT_GEKLAERT]);
});

test("choice: next_question_ids null ⇒ default, nicht Umfrage-Ende", () => {
	assert.equal(getNextQuestionId(question(SURVEY, WARUM_UNZUFRIEDEN), "Beides"), EMPFEHLUNG);
});

test("comment: immer default", () => {
	assert.equal(getNextQuestionId(question(SURVEY, HINWEIS_SUPER), "Toll"), EMPFEHLUNG);
	assert.equal(getNextQuestionId(question(SURVEY, WARUM_NICHT_GEKLAERT), "Hm"), null);
});

test("alle Verzweigungen gleichzeitig", () => {
	const answers = { [ZUFRIEDENHEIT]: 0, [WARUM_UNZUFRIEDEN]: "Inhalt", [EMPFEHLUNG]: 10, [KONTAKT_GEKLAERT]: false };
	assert.deepEqual(reachableIds(SURVEY, answers), [
		ZUFRIEDENHEIT,
		WARUM_UNZUFRIEDEN,
		EMPFEHLUNG,
		WAS_GEFAELLT_GUT,
		KONTAKT_GEKLAERT,
		WARUM_NICHT_GEKLAERT
	]);
});

// Eigene Umfrage für Bedingungsreihenfolge, choice-Folgefragen und Verschachtelung
const Q_RATING = "rating-1";
const Q_EQUALS = "equals-folge";
const Q_LESS = "less-folge";
const Q_GREATER = "greater-folge";
const Q_CHOICE = "choice-2";
const Q_CHOICE_A = "choice-folge-a";
const Q_NESTED = "verschachtelt";
const Q_LAST = "ende-3";

const ORDER_SURVEY: FlowSurvey = {
	...SURVEY,
	start_question_id: Q_RATING,
	questions: [
		{
			...base(Q_RATING, Q_CHOICE),
			type: "rating",
			options: { values: [1, 2, 3, 4, 5, 6, 7, 8], min_value: 1, max_value: 8 },
			// Bei 3 passen alle drei, bei 4 less_than und greater_than: die Reihenfolge entscheidet
			conditional_next_question: [
				{ operator: "greater_than", value: 2, next_question_id: Q_GREATER },
				{ operator: "less_than", value: 5, next_question_id: Q_LESS },
				{ operator: "equals", value: 3, next_question_id: Q_EQUALS }
			]
		},
		{ ...base(Q_EQUALS, Q_CHOICE), type: "comment" },
		{ ...base(Q_LESS, Q_CHOICE), type: "comment" },
		{ ...base(Q_GREATER, Q_CHOICE), type: "comment" },
		{
			...base(Q_CHOICE, Q_LAST),
			type: "choice",
			labels: ["A", "B"],
			synonyms: ["", ""],
			next_question_ids: [Q_CHOICE_A, null]
		},
		{
			...base(Q_CHOICE_A, Q_LAST, true),
			type: "yes_no",
			options: { yes_next_question_id: Q_NESTED, no_next_question_id: null }
		},
		{ ...base(Q_NESTED, Q_LAST, true), type: "comment" },
		{ ...base(Q_LAST, null), type: "comment" }
	]
};

test("Reihenfolge der Bedingungen: equals vor less_than vor greater_than, unabhängig von der Position im Array", () => {
	const rating = question(ORDER_SURVEY, Q_RATING);
	assert.equal(getNextQuestionId(rating, 3), Q_EQUALS);
	assert.equal(getNextQuestionId(rating, 4), Q_LESS);
	assert.equal(getNextQuestionId(rating, 1), Q_LESS);
	assert.equal(getNextQuestionId(rating, 6), Q_GREATER);
});

test("zutreffende Bedingung mit next_question_id null ⇒ default, auch wenn eine spätere Bedingung passen würde", () => {
	const rating: FlowQuestion = {
		...base("r", "default"),
		type: "rating",
		options: { values: [0, 1, 2], min_value: 0, max_value: 2 },
		conditional_next_question: conditions([1, null], [5, "less"])
	};
	assert.equal(getNextQuestionId(rating, 1), "default");
	assert.equal(getNextQuestionId(rating, 0), "less");
});

test("choice: Folgefrage nur für das zugeordnete Label, verschachtelte Folgefragen folgen direkt", () => {
	assert.deepEqual(reachableIds(ORDER_SURVEY, { [Q_CHOICE]: "B" }), [Q_RATING, Q_CHOICE, Q_LAST]);
	assert.deepEqual(reachableIds(ORDER_SURVEY, { [Q_CHOICE]: "A" }), [Q_RATING, Q_CHOICE, Q_CHOICE_A, Q_LAST]);
	assert.deepEqual(reachableIds(ORDER_SURVEY, { [Q_CHOICE]: "A", [Q_CHOICE_A]: true }), [
		Q_RATING,
		Q_CHOICE,
		Q_CHOICE_A,
		Q_NESTED,
		Q_LAST
	]);
});

test("ungültige Antwort zählt bei der Navigation als unbeantwortet", () => {
	assert.equal(getNextQuestionId(question(SURVEY, ZUFRIEDENHEIT), 9), EMPFEHLUNG);
	assert.equal(getNextQuestionId(question(SURVEY, ZUFRIEDENHEIT), "1"), EMPFEHLUNG);
	assert.equal(getNextQuestionId(question(ORDER_SURVEY, Q_CHOICE), "a"), Q_LAST);
	assert.equal(getNextQuestionId(question(SURVEY, KONTAKT_GEKLAERT), "false"), null);
});

test("defektes Flow-JSON: unbekannte ID oder Zyklus beendet den Ablauf", () => {
	const unknownRef: FlowSurvey = {
		...SURVEY,
		start_question_id: "a",
		questions: [{ ...base("a", "fehlt"), type: "comment" }]
	};
	assert.deepEqual(reachableIds(unknownRef, {}), ["a"]);

	const cycle: FlowSurvey = {
		...SURVEY,
		start_question_id: "a",
		questions: [
			{ ...base("a", "b"), type: "comment" },
			{ ...base("b", "a"), type: "comment" }
		]
	};
	assert.deepEqual(reachableIds(cycle, {}), ["a", "b"]);
	assert.deepEqual(reachableIds({ ...SURVEY, start_question_id: null }, {}), []);
});

// ---------------------------------------------------------------------------
// Wertebereiche
// ---------------------------------------------------------------------------

test("rating: ganze Zahl im Bereich min..max", () => {
	const rating = question(SURVEY, ZUFRIEDENHEIT);
	for (const value of [0, 3, 6]) assert.equal(isAnswerValueValid(rating, value), true, String(value));
	for (const value of [-1, 7, 2.5, "3", NaN, Infinity, true, null]) {
		assert.equal(isAnswerValueValid(rating, value), false, String(value));
	}
	assert.equal(isAnswerValueValid(question(ORDER_SURVEY, Q_RATING), 0), false);
});

test("nps: ganze Zahl 0..10", () => {
	const nps = question(SURVEY, EMPFEHLUNG);
	for (const value of [0, 10]) assert.equal(isAnswerValueValid(nps, value), true, String(value));
	for (const value of [-1, 11, 5.5, "5"]) assert.equal(isAnswerValueValid(nps, value), false, String(value));
});

test("choice: muss exakt ein Label sein", () => {
	const choice = question(SURVEY, WARUM_UNZUFRIEDEN);
	assert.equal(isAnswerValueValid(choice, "Freundlichkeit"), true);
	for (const value of ["freundlichkeit", "Freundlichkeit ", "Sonstiges", 1, ["Inhalt"]]) {
		assert.equal(isAnswerValueValid(choice, value), false, String(value));
	}
});

test("yes_no: nur bool", () => {
	const yesNo = question(SURVEY, KONTAKT_GEKLAERT);
	assert.equal(isAnswerValueValid(yesNo, true), true);
	assert.equal(isAnswerValueValid(yesNo, false), true);
	for (const value of ["true", 1, 0, "ja"]) assert.equal(isAnswerValueValid(yesNo, value), false, String(value));
});

test("comment: Text mit höchstens 2000 Zeichen", () => {
	const comment = question(SURVEY, HINWEIS_SUPER);
	assert.equal(isAnswerValueValid(comment, "x".repeat(2000)), true);
	assert.equal(isAnswerValueValid(comment, "x".repeat(2001)), false);
	assert.equal(isAnswerValueValid(comment, 42), false);
});

// ---------------------------------------------------------------------------
// Prüfung beim Absenden
// ---------------------------------------------------------------------------

test("vollständige, gültige Antworten: keine Fehler", () => {
	const answers = { [ZUFRIEDENHEIT]: 1, [WARUM_UNZUFRIEDEN]: "Beides", [EMPFEHLUNG]: 3, [WARUM_NICHT_EMPFEHLEN]: "Zu teuer", [KONTAKT_GEKLAERT]: true };
	assert.deepEqual(validateFlowAnswers(SURVEY, answers), []);
});

test("Pflichtangaben: fehlend, null und Leertext zählen als nicht beantwortet", () => {
	assert.deepEqual(validateFlowAnswers(SURVEY, {}), [
		{ questionId: ZUFRIEDENHEIT, code: "required" },
		{ questionId: KONTAKT_GEKLAERT, code: "required" }
	]);
	assert.deepEqual(validateFlowAnswers(SURVEY, { [ZUFRIEDENHEIT]: null, [KONTAKT_GEKLAERT]: true }), [
		{ questionId: ZUFRIEDENHEIT, code: "required" }
	]);
	const nestedMandatory = { [Q_CHOICE]: "A", [Q_CHOICE_A]: true, [Q_NESTED]: "   " };
	assert.deepEqual(validateFlowAnswers(ORDER_SURVEY, nestedMandatory), [{ questionId: Q_NESTED, code: "required" }]);
});

test("Pflicht-Folgefrage zählt nur, wenn sie erreichbar ist", () => {
	assert.deepEqual(validateFlowAnswers(ORDER_SURVEY, { [Q_CHOICE]: "B" }), []);
	assert.deepEqual(validateFlowAnswers(ORDER_SURVEY, { [Q_CHOICE]: "A" }), [{ questionId: Q_CHOICE_A, code: "required" }]);
});

test("ungültiger Wert auf erreichbarer Frage", () => {
	assert.deepEqual(validateFlowAnswers(SURVEY, { [ZUFRIEDENHEIT]: 7, [KONTAKT_GEKLAERT]: "ja" }), [
		{ questionId: ZUFRIEDENHEIT, code: "invalid_value" },
		{ questionId: KONTAKT_GEKLAERT, code: "invalid_value" }
	]);
});

test("Antworten auf nicht erreichbare oder unbekannte Fragen", () => {
	const answers = { [ZUFRIEDENHEIT]: 3, [HINWEIS_SUPER]: "Super", [KONTAKT_GEKLAERT]: true, "gibt-es-nicht": 1 };
	assert.deepEqual(validateFlowAnswers(SURVEY, answers), [
		{ questionId: HINWEIS_SUPER, code: "not_reachable" },
		{ questionId: "gibt-es-nicht", code: "unknown_question" }
	]);
});

test("leere Antworten auf nicht erreichbare Fragen werden toleriert", () => {
	const answers = { [ZUFRIEDENHEIT]: 3, [HINWEIS_SUPER]: "", [WARUM_UNZUFRIEDEN]: null, [KONTAKT_GEKLAERT]: true };
	assert.deepEqual(validateFlowAnswers(SURVEY, answers), []);
});

test("Schlüssel wie __proto__ oder constructor sind unbekannte Fragen, keine Prototyp-Treffer", () => {
	const answers = JSON.parse(`{"${ZUFRIEDENHEIT}":3,"${KONTAKT_GEKLAERT}":true,"__proto__":1,"constructor":"x"}`);
	assert.deepEqual(validateFlowAnswers(SURVEY, answers), [
		{ questionId: "__proto__", code: "unknown_question" },
		{ questionId: "constructor", code: "unknown_question" }
	]);
});

// ---------------------------------------------------------------------------
// Bereinigen der Antworten
// ---------------------------------------------------------------------------

test("weggefallene Folgefrage: Antwort wird verworfen", () => {
	const answers = { [ZUFRIEDENHEIT]: 5, [HINWEIS_SUPER]: "Toll", [KONTAKT_GEKLAERT]: true };
	assert.deepEqual(pruneFlowAnswers(SURVEY, answers), answers);
	assert.deepEqual(pruneFlowAnswers(SURVEY, { ...answers, [ZUFRIEDENHEIT]: 3 }), { [ZUFRIEDENHEIT]: 3, [KONTAKT_GEKLAERT]: true });
});

test("ungültige, leere und unbekannte Antworten werden verworfen", () => {
	const answers = { [ZUFRIEDENHEIT]: 9, [EMPFEHLUNG]: "", [KONTAKT_GEKLAERT]: false, [WARUM_NICHT_GEKLAERT]: "Weil", fremd: 1 };
	assert.deepEqual(pruneFlowAnswers(SURVEY, answers), { [KONTAKT_GEKLAERT]: false, [WARUM_NICHT_GEKLAERT]: "Weil" });
});

test("Übernahme nach geänderter Umfrage: gleiche Frage-ID und weiterhin gültiger Wert bleiben", () => {
	// Neue Fassung: Skala nur noch 1..4, Option "Beides" entfernt
	const changed: FlowSurvey = {
		...SURVEY,
		version: 4,
		questions: SURVEY.questions.map(q => {
			if (q.type === "rating") return { ...q, options: { values: [1, 2, 3, 4], min_value: 1, max_value: 4 } };
			if (q.type === "choice") return { ...q, labels: ["Inhalt", "Freundlichkeit"], synonyms: ["", ""], next_question_ids: [null, null] };
			return q;
		})
	};
	const oldAnswers = { [ZUFRIEDENHEIT]: 1, [WARUM_UNZUFRIEDEN]: "Beides", [EMPFEHLUNG]: 9, [WAS_GEFAELLT_GUT]: "Alles", [KONTAKT_GEKLAERT]: true };
	assert.deepEqual(pruneFlowAnswers(changed, oldAnswers), {
		[ZUFRIEDENHEIT]: 1,
		[EMPFEHLUNG]: 9,
		[WAS_GEFAELLT_GUT]: "Alles",
		[KONTAKT_GEKLAERT]: true
	});
	assert.deepEqual(pruneFlowAnswers(changed, { ...oldAnswers, [ZUFRIEDENHEIT]: 6 }), {
		[EMPFEHLUNG]: 9,
		[WAS_GEFAELLT_GUT]: "Alles",
		[KONTAKT_GEKLAERT]: true
	});
});

// ---------------------------------------------------------------------------
// Zusammenspiel mit dem Translator
// ---------------------------------------------------------------------------

test("vom Translator erzeugtes Flow-JSON: verschachtelte Folgefragen erscheinen unter ihrer Elternfrage", () => {
	const draft: Survey = {
		id: "s1",
		name: "test_s1",
		title: "Test",
		questions: [
			{
				id: "q1",
				name: "q1",
				type: "choice",
				title: "Q1",
				options: { labels: [{ id: "l1", label: "Eins" }, { id: "l2", label: "Zwei" }] },
				follow_ups: [
					{
						condition: { operator: "equals", value: "l2" },
						question: {
							id: "q1a",
							name: "q1a",
							type: "nps",
							title: "Q1a",
							follow_ups: [
								{ condition: { operator: "greater_than", value: 8 }, question: { id: "q1a1", name: "q1a1", type: "comment", title: "Q1a1" } }
							]
						}
					}
				]
			},
			{ id: "q2", name: "q2", type: "yes_no", title: "Q2", mandatory: true }
		]
	};
	const flow = translateSurveyObject(draft);
	assert.deepEqual(reachableIds(flow, {}), ["q1", "q2"]);
	assert.deepEqual(reachableIds(flow, { q1: "Zwei" }), ["q1", "q1a", "q2"]);
	assert.deepEqual(reachableIds(flow, { q1: "Zwei", q1a: 9 }), ["q1", "q1a", "q1a1", "q2"]);
	assert.deepEqual(validateFlowAnswers(flow, { q1: "Eins", q1a: 9 }), [
		{ questionId: "q2", code: "required" },
		{ questionId: "q1a", code: "not_reachable" }
	]);
});

test("answers ist kein Objekt: invalid_answers statt Absturz, prune und Navigation behandeln es als leer", () => {
	for (const answers of [null, undefined, [], [5], "text", 42, true]) {
		const label = JSON.stringify(answers);
		assert.deepEqual(validateFlowAnswers(SURVEY, answers), [{ questionId: null, code: "invalid_answers" }], label);
		assert.deepEqual(pruneFlowAnswers(SURVEY, answers), {}, label);
		assert.deepEqual(reachableIds(SURVEY, answers as FlowAnswers), reachableIds(SURVEY, {}), label);
	}
});

test("Lambda-Bundle: flowNavigation und alle importierten Module kommen ohne @/-Alias und Pakete aus", () => {
	// ampx prüft mit amplify/tsconfig.json (kennt @/ nicht); Pakete wie vue-i18n würden das Bundle aufblähen
	const root = resolve(dirname(new URL(import.meta.url).pathname), "../src/domain/survey/flowNavigation.ts");
	const seen = new Set<string>();
	const pending = [root];
	while (pending.length > 0) {
		const file = pending.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)) {
			const specifier = match[1] ?? match[2];
			assert.ok(specifier.startsWith("."), `${file}: Import "${specifier}" ist nicht relativ`);
			pending.push(resolve(dirname(file), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`));
		}
	}
	assert.ok(seen.size >= 2);
});

console.log(`\n${passed} Tests bestanden`);
