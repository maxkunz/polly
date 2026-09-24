import assert from "node:assert/strict";
import type { Survey } from "../src/domain/survey/surveyTypes";
import {
	SurveyFlowTranslationError,
	translateSurveyForFlow,
	translateSurveyObject,
	type FlowChoiceQuestion,
	type FlowNpsQuestion,
	type FlowRatingQuestion,
	type FlowYesNoQuestion
} from "../src/services/surveyFlowTranslator";

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

function assertThrows(fn: () => void, message: string): void {
	assert.throws(fn, SurveyFlowTranslationError, message);
}

// ---------------------------------------------------------------------------
// Fixture: Beispiel aus documentation/survey_definition.md
// ---------------------------------------------------------------------------

function buildExampleSurvey(): Survey {
	return {
		id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
		name: "Kundenzufriedenheit 2026",
		title: "Kundenzufriedenheit 2026",
		description: "Jährliche Umfrage zur Nutzerzufriedenheit.",
		greeting_message: "Vielen Dank, dass Sie sich 3 Minuten Zeit nehmen, um Ihre Gedanken mit uns zu teilen.",
		closing_message: "Vielen Dank für Ihr Feedback!",
		created_at: "2026-06-30T12:00:00Z",
		updated_at: "2026-08-06T12:00:00Z",
		version: 1,
		questions: [
			{
				id: "c2aab111-1e2f-6aa0-dd8f-8dd1df502c33",
				type: "yes_no",
				name: "frage_yesno",
				title: "Würden Sie unseren Service weiterempfehlen?",
				description: "Berücksichtigen Sie Ihre Gesamterfahrung der letzten 12 Monate.",
				reprompt_message: "Bitte beantworten Sie diese Frage.",
				mandatory: false,
				follow_ups: [
					{
						condition: { operator: "equals", value: false },
						question: {
							id: "7d52f6c9-0a63-4b08-8e6f-4a377d611867",
							name: "frage_warum",
							type: "comment",
							title: "Was war das Hauptproblem?",
							description: "Bitte beschreiben Sie, was Sie unzufrieden gemacht hat."
						}
					}
				]
			},
			{
				id: "25f822ac-d1a1-4ea6-b9b0-9f44e13fc1ab",
				name: "frage_funktion",
				type: "choice",
				title: "Welche Funktion nutzen Sie am häufigsten?",
				description: "Wählen Sie die Hauptfunktion, die Ihren Workflow bestimmt.",
				reprompt_message: "Bitte beantworten Sie diese Frage.",
				mandatory: false,
				options: {
					labels: [
						{ id: "58cf7b44-9336-4074-b5b8-5188f553a633", label: "Dashboard-Analysen" },
						{ id: "9ab33f3e-3294-4f40-8f9f-07ec812d3345", label: "Automatisierte Exporte" }
					]
				},
				follow_ups: [
					{
						condition: { operator: "equals", value: "9ab33f3e-3294-4f40-8f9f-07ec812d3345" },
						question: {
							id: "341fb62c-8cd7-48f0-b997-759081e7d82e",
							name: "frage_zufrieden_export",
							type: "rating",
							title: "Wie zufrieden sind Sie mit der Leistung der automatisierten Exporte?",
							description: "Bewerten Sie mit 1 bis 5 Sternen.",
							options: { min_value: 1, max_value: 5 }
						}
					}
				]
			},
			{
				id: "8b7fc93c-cf8e-4a64-9a3b-2401f11a84f5",
				name: "frage_ui",
				type: "rating",
				title: "Wie würden Sie unser UI-Design bewerten?",
				description: "Skala von 1 (schlecht) bis 8 (ausgezeichnet).",
				reprompt_message: "Bitte beantworten Sie diese Frage.",
				mandatory: false,
				options: { min_value: 1, max_value: 8 },
				follow_ups: [
					{
						condition: { operator: "less_than", value: 3 },
						question: {
							id: "f6211181-e234-4a8f-8cb4-3074092b35a3",
							name: "frage_ui_verbessern",
							type: "comment",
							title: "Wie können wir das Design verbessern?",
							description: "Sagen Sie uns, was sich unintuitiv oder klobig angefühlt hat."
						}
					}
				]
			},
			{
				id: "be7d1c15-4fa8-48aa-b7bc-1e5f88cb077d",
				name: "frage_nps",
				type: "nps",
				title: "Wie wahrscheinlich ist es, dass Sie uns einem Kollegen weiterempfehlen?",
				description: "Net Promoter Score von 0 bis 10.",
				reprompt_message: "Bitte beantworten Sie diese Frage.",
				mandatory: false,
				follow_ups: [
					{
						condition: { operator: "greater_than", value: 8 },
						question: {
							id: "ecb58dcf-336c-4f76-80db-0e693b827e8a",
							name: "frage_nps_positiv",
							type: "comment",
							title: "Was gefällt Ihnen am besten an uns?",
							description: "Wir würden gerne erfahren, was Ihnen am besten gefällt."
						}
					}
				]
			},
			{
				id: "47cc5f41-3b76-47b2-bd77-17bc2d44cfba",
				name: "frage_weiteres",
				type: "comment",
				title: "Haben Sie noch weitere Anmerkungen?",
				description: "Teilen Sie uns gerne weiteres Feedback mit, das oben nicht behandelt wurde.",
				reprompt_message: "Bitte beantworten Sie diese Frage.",
				mandatory: false
			}
		]
	};
}

// ---------------------------------------------------------------------------
// Survey-Ebene
// ---------------------------------------------------------------------------

test("Survey-Felder werden umbenannt, start_question_id und type gesetzt", () => {
	const flow = translateSurveyObject(buildExampleSurvey());
	assert.equal(flow.id, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
	assert.equal(flow.name, "Kundenzufriedenheit 2026");
	assert.equal(flow.greeting_prompt, "Vielen Dank, dass Sie sich 3 Minuten Zeit nehmen, um Ihre Gedanken mit uns zu teilen.");
	assert.equal(flow.closing_prompt, "Vielen Dank für Ihr Feedback!");
	assert.equal(flow.start_question_id, "c2aab111-1e2f-6aa0-dd8f-8dd1df502c33");
	assert.equal(flow.type, "Flow");
});

test("Fragen werden per Tiefensuche flach abgelegt (Haupt-, Folge- und verschachtelte Folgefragen)", () => {
	const flow = translateSurveyObject(buildExampleSurvey());
	const ids = flow.questions.map(q => q.id);
	assert.deepEqual(ids, [
		"c2aab111-1e2f-6aa0-dd8f-8dd1df502c33", // yes_no
		"7d52f6c9-0a63-4b08-8e6f-4a377d611867", // -> comment (Folgefrage)
		"25f822ac-d1a1-4ea6-b9b0-9f44e13fc1ab", // choice
		"341fb62c-8cd7-48f0-b997-759081e7d82e", // -> rating (Folgefrage)
		"8b7fc93c-cf8e-4a64-9a3b-2401f11a84f5", // rating
		"f6211181-e234-4a8f-8cb4-3074092b35a3", // -> comment (Folgefrage)
		"be7d1c15-4fa8-48aa-b7bc-1e5f88cb077d", // nps
		"ecb58dcf-336c-4f76-80db-0e693b827e8a", // -> comment (Folgefrage)
		"47cc5f41-3b76-47b2-bd77-17bc2d44cfba" // comment
	]);
});

test("default_next_question_id: Folgefrage geht zur nächsten Hauptfrage weiter, letzte Frage ist null", () => {
	const flow = translateSurveyObject(buildExampleSurvey());
	const byId = new Map(flow.questions.map(q => [q.id, q]));

	// Hauptfrage 1 (yes_no) -> Hauptfrage 2 (choice)
	assert.equal(byId.get("c2aab111-1e2f-6aa0-dd8f-8dd1df502c33")!.default_next_question_id, "25f822ac-d1a1-4ea6-b9b0-9f44e13fc1ab");
	// Folgefrage der yes_no-Frage erbt denselben Continuation-Punkt
	assert.equal(byId.get("7d52f6c9-0a63-4b08-8e6f-4a377d611867")!.default_next_question_id, "25f822ac-d1a1-4ea6-b9b0-9f44e13fc1ab");

	// Hauptfrage 3 (rating "UI") -> Hauptfrage 4 (nps); Folgefrage erbt denselben Punkt
	assert.equal(byId.get("8b7fc93c-cf8e-4a64-9a3b-2401f11a84f5")!.default_next_question_id, "be7d1c15-4fa8-48aa-b7bc-1e5f88cb077d");
	assert.equal(byId.get("f6211181-e234-4a8f-8cb4-3074092b35a3")!.default_next_question_id, "be7d1c15-4fa8-48aa-b7bc-1e5f88cb077d");

	// Letzte Hauptfrage (comment) -> null
	assert.equal(byId.get("47cc5f41-3b76-47b2-bd77-17bc2d44cfba")!.default_next_question_id, null);
});

// ---------------------------------------------------------------------------
// yes_no
// ---------------------------------------------------------------------------

test("yes_no: nur no-Folgefrage vorhanden -> yes_next_question_id ist null", () => {
	const flow = translateSurveyObject(buildExampleSurvey());
	const yesNo = flow.questions.find(q => q.id === "c2aab111-1e2f-6aa0-dd8f-8dd1df502c33") as FlowYesNoQuestion;
	assert.equal(yesNo.options.yes_next_question_id, null);
	assert.equal(yesNo.options.no_next_question_id, "7d52f6c9-0a63-4b08-8e6f-4a377d611867");
});

test("yes_no: doppelte Folgefrage für dieselbe Bedingung wirft Fehler", () => {
	const survey = buildExampleSurvey();
	survey.questions[0].follow_ups!.push({
		condition: { operator: "equals", value: false },
		question: { id: "dup", name: "dup", type: "comment", title: "dup" }
	});
	assertThrows(() => translateSurveyObject(survey), "yes_no doppelte Bedingung");
});

test("yes_no: anderer Operator als equals wirft Fehler", () => {
	const survey = buildExampleSurvey();
	survey.questions[0].follow_ups![0].condition.operator = "less_than";
	assertThrows(() => translateSurveyObject(survey), "yes_no falscher Operator");
});

// ---------------------------------------------------------------------------
// choice
// ---------------------------------------------------------------------------

test("choice: Label-ID wird auf den richtigen Index gemappt, Labels ohne Folgefrage -> null", () => {
	const flow = translateSurveyObject(buildExampleSurvey());
	const choice = flow.questions.find(q => q.id === "25f822ac-d1a1-4ea6-b9b0-9f44e13fc1ab") as FlowChoiceQuestion;
	assert.deepEqual(choice.labels, ["Dashboard-Analysen", "Automatisierte Exporte"]);
	assert.deepEqual(choice.next_question_ids, [null, "341fb62c-8cd7-48f0-b997-759081e7d82e"]);
});

test("choice: unbekannte Label-ID in Bedingung wirft Fehler", () => {
	const survey = buildExampleSurvey();
	survey.questions[1].follow_ups![0].condition.value = "unbekannte-id";
	assertThrows(() => translateSurveyObject(survey), "choice unbekannte Label-ID");
});

test("choice: dieselbe Label-ID mehrfach in Bedingungen wirft Fehler", () => {
	const survey = buildExampleSurvey();
	survey.questions[1].follow_ups!.push({
		condition: { operator: "equals", value: "9ab33f3e-3294-4f40-8f9f-07ec812d3345" },
		question: { id: "dup", name: "dup", type: "comment", title: "dup" }
	});
	assertThrows(() => translateSurveyObject(survey), "choice doppelte Label-ID");
});

// ---------------------------------------------------------------------------
// rating
// ---------------------------------------------------------------------------

test("rating: values wird von min bis max lückenlos erzeugt", () => {
	const flow = translateSurveyObject(buildExampleSurvey());
	const rating = flow.questions.find(q => q.id === "8b7fc93c-cf8e-4a64-9a3b-2401f11a84f5") as FlowRatingQuestion;
	assert.deepEqual(rating.options.values, [1, 2, 3, 4, 5, 6, 7, 8]);
	assert.equal(rating.options.min_value, 1);
	assert.equal(rating.options.max_value, 8);
});

test("rating: fehlende Operatoren werden als ungültige Platzhalter-Bedingung ergänzt", () => {
	const flow = translateSurveyObject(buildExampleSurvey());
	const rating = flow.questions.find(q => q.id === "8b7fc93c-cf8e-4a64-9a3b-2401f11a84f5") as FlowRatingQuestion;
	assert.deepEqual(rating.conditional_next_question, [
		{ operator: "equals", value: -1, next_question_id: null },
		{ operator: "less_than", value: 3, next_question_id: "f6211181-e234-4a8f-8cb4-3074092b35a3" },
		{ operator: "greater_than", value: 1000, next_question_id: null }
	]);
});

test("rating: derselbe Operator mehrfach wirft Fehler", () => {
	const survey = buildExampleSurvey();
	survey.questions[2].follow_ups!.push({
		condition: { operator: "less_than", value: 2 },
		question: { id: "dup", name: "dup", type: "comment", title: "dup" }
	});
	assertThrows(() => translateSurveyObject(survey), "rating doppelter Operator");
});

// ---------------------------------------------------------------------------
// nps
// ---------------------------------------------------------------------------

test("nps: ohne Folgefragen werden alle drei Operatoren als Platzhalter angelegt", () => {
	const survey = buildExampleSurvey();
	survey.questions[3].follow_ups = [];
	const flow = translateSurveyObject(survey);
	const nps = flow.questions.find(q => q.id === "be7d1c15-4fa8-48aa-b7bc-1e5f88cb077d") as FlowNpsQuestion;
	assert.deepEqual(nps.conditional_next_question, [
		{ operator: "equals", value: -1, next_question_id: null },
		{ operator: "less_than", value: -1000, next_question_id: null },
		{ operator: "greater_than", value: 1000, next_question_id: null }
	]);
});

test("nps: hat keine options", () => {
	const flow = translateSurveyObject(buildExampleSurvey());
	const nps = flow.questions.find(q => q.id === "be7d1c15-4fa8-48aa-b7bc-1e5f88cb077d") as FlowNpsQuestion;
	assert.equal((nps as any).options, undefined);
});

// ---------------------------------------------------------------------------
// comment
// ---------------------------------------------------------------------------

test("comment: Folgefragen an einer comment-Frage werfen einen Fehler", () => {
	const survey = buildExampleSurvey();
	(survey.questions[4] as any).follow_ups = [
		{ condition: { operator: "equals", value: true }, question: { id: "x", name: "x", type: "comment", title: "x" } }
	];
	assertThrows(() => translateSurveyObject(survey), "comment mit Folgefragen");
});

// ---------------------------------------------------------------------------
// translateSurveyForFlow / Fehlerfälle
// ---------------------------------------------------------------------------

test("translateSurveyForFlow: leerer Draft wirft Fehler", () => {
	assertThrows(() => translateSurveyForFlow(""), "leerer String");
	assertThrows(() => translateSurveyForFlow(null as any), "null");
	assertThrows(() => translateSurveyForFlow(undefined as any), "undefined");
});

test("translateSurveyForFlow: Draft ohne Fragen ('{}') wirft Fehler", () => {
	assertThrows(() => translateSurveyForFlow("{}"), "Draft ohne Fragen");
});

test("translateSurveyForFlow: ungültiges JSON wirft Fehler", () => {
	assertThrows(() => translateSurveyForFlow("{not-valid-json"), "ungültiges JSON");
});

test("translateSurveyForFlow: gültiger Draft liefert serialisiertes Flow-JSON", () => {
	const draft = JSON.stringify(buildExampleSurvey());
	const result = translateSurveyForFlow(draft);
	const parsed = JSON.parse(result);
	assert.equal(parsed.type, "Flow");
	assert.equal(parsed.questions.length, 9);
});

console.log(`\n${passed} Tests erfolgreich.`);
