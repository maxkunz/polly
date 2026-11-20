import assert from "node:assert/strict";
import {
	collectDeployedTechnicalNames,
	collectTechnicalNames,
	findTechnicalNameCollisions,
	createEmptyQuestion,
	createEmptySurvey,
	displayTechnicalName,
	ensureSurveyTechnicalNames,
	ensureTechnicalName,
	shortId
} from "../src/domain/survey/surveyTypes";

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

const ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

test("shortId liefert die ersten 8 Zeichen ohne Bindestriche", () => {
	assert.equal(shortId(ID), "a0eebc99");
});

test("Platzhalter wird aus dem Titel erzeugt", () => {
	assert.equal(ensureTechnicalName("umfrage_a0eebc99", "Kundenzufriedenheit 2026", ID, "umfrage"), "kundenzufriedenheit_2026_a0eebc99");
	assert.equal(ensureTechnicalName("frage_a0eebc99", "Wie zufrieden?", ID, "frage"), "wie_zufrieden_a0eebc99");
});

test("leerer Name wird aus dem Titel erzeugt", () => {
	assert.equal(ensureTechnicalName("", "Ärger & Spaß", ID, "frage"), "aerger_spass_a0eebc99");
	assert.equal(ensureTechnicalName(undefined, "", ID, "frage"), "frage_a0eebc99");
});

test("gespeicherter Name bleibt bei Titeländerung erhalten", () => {
	assert.equal(ensureTechnicalName("kundenzufriedenheit_a0eebc99", "Neuer Titel", ID, "umfrage"), "kundenzufriedenheit_a0eebc99");
});

test("Titel mit Präfix Umfrage/Frage ergibt einen festen Namen", () => {
	// Früher galt jeder Name mit Präfix "umfrage_"/"frage_" als Platzhalter und wurde neu erzeugt
	const surveyName = ensureTechnicalName("umfrage_a0eebc99", "Umfrage Kundenzufriedenheit", ID, "umfrage");
	assert.equal(surveyName, "umfrage_kundenzufriedenheit_a0eebc99");
	assert.equal(ensureTechnicalName(surveyName, "Anderer Titel", ID, "umfrage"), surveyName);

	const questionName = ensureTechnicalName("frage_a0eebc99", "Frage 1: Wie zufrieden?", ID, "frage");
	assert.equal(questionName, "frage_1_wie_zufrieden_a0eebc99");
	assert.equal(ensureTechnicalName(questionName, "Anderer Titel", ID, "frage"), questionName);
});

test("neue Umfrage erhält beim ersten Speichern Namen aus den Titeln", () => {
	const survey = createEmptySurvey();
	survey.title = "Umfrage Test";
	const question = createEmptyQuestion("comment");
	question.title = "Frage zum Service";
	survey.questions.push(question);

	ensureSurveyTechnicalNames(survey);
	assert.equal(survey.name, `umfrage_test_${shortId(survey.id)}`);
	assert.equal(question.name, `frage_zum_service_${shortId(question.id)}`);

	survey.title = "Geändert";
	question.title = "Geändert";
	ensureSurveyTechnicalNames(survey);
	assert.equal(survey.name, `umfrage_test_${shortId(survey.id)}`);
	assert.equal(question.name, `frage_zum_service_${shortId(question.id)}`);
});

test("ab der zweiten Version bleiben gespeicherte Namen unverändert, auch wenn sie wie ein Platzhalter aussehen", () => {
	// Version 1 gespeichert mit Titel "Umfrage" → Name entspricht exakt dem Platzhalter
	const survey = createEmptySurvey();
	survey.title = "Umfrage";
	const question = createEmptyQuestion("comment");
	question.title = "Frage";
	survey.questions.push(question);
	ensureSurveyTechnicalNames(survey);
	assert.equal(survey.name, `umfrage_${shortId(survey.id)}`);
	const saved = JSON.parse(JSON.stringify(survey));

	// Version 2: Titel geändert → Namen kommen aus der gespeicherten Fassung
	survey.title = "Kundenzufriedenheit";
	question.title = "Wie zufrieden?";
	ensureSurveyTechnicalNames(survey, collectTechnicalNames(saved));
	assert.equal(survey.name, `umfrage_${shortId(survey.id)}`);
	assert.equal(question.name, `frage_${shortId(question.id)}`);
});

test("neue Fragen in späteren Versionen erhalten einmalig einen Namen aus dem Titel", () => {
	const survey = createEmptySurvey();
	survey.title = "Test";
	survey.questions.push(createEmptyQuestion("comment"));
	survey.questions[0].title = "Erste";
	ensureSurveyTechnicalNames(survey);
	const saved = JSON.parse(JSON.stringify(survey));

	const added = createEmptyQuestion("yes_no");
	added.title = "Neue Frage";
	survey.questions.push(added);
	ensureSurveyTechnicalNames(survey, collectTechnicalNames(saved));
	assert.equal(added.name, `neue_frage_${shortId(added.id)}`);
});

test("collectTechnicalNames erfasst Umfrage, Fragen und Folgefragen", () => {
	const survey = createEmptySurvey();
	const question = createEmptyQuestion("yes_no");
	const followUp = createEmptyQuestion("comment");
	question.follow_ups = [{ condition: { operator: "equals", value: true }, question: followUp }];
	survey.questions.push(question);
	const names = collectTechnicalNames(survey);
	assert.deepEqual([...names.keys()].sort(), [survey.id, question.id, followUp.id].sort());
	assert.equal(collectTechnicalNames(null).size, 0);
});

test("displayTechnicalName: Vorschau aus dem Titel nur für ungespeicherte Elemente", () => {
	const survey = createEmptySurvey();
	survey.title = "Neuer Titel";
	assert.equal(displayTechnicalName(survey, false, "umfrage"), `neuer_titel_${shortId(survey.id)}`);
	// Gespeichert: Name bleibt, auch wenn er noch wie ein Platzhalter aussieht
	assert.equal(displayTechnicalName(survey, true, "umfrage"), survey.name);
});

test("findTechnicalNameCollisions: nur neue Elemente, auch gegen deployte Namen", () => {
	const survey = createEmptySurvey();
	const a = { ...createEmptyQuestion(), id: "47cc5f41-3b76-47b2-bd77-17bc2d44cfba", name: "", title: "Gleich" };
	const b = { ...createEmptyQuestion(), id: "47cc5f41-1111-4111-8111-111111111111", name: "", title: "Gleich" };
	survey.questions.push(a, b);
	ensureSurveyTechnicalNames(survey);
	assert.deepEqual(findTechnicalNameCollisions(survey), [{ id: b.id, name: "gleich_47cc5f41" }]);

	// Beide gespeichert (Altbestand): unveränderlich, keine Meldung
	assert.deepEqual(findTechnicalNameCollisions(survey, collectTechnicalNames(survey)), []);

	// Gegen deployte Fassung: fremde ID kollidiert, gleiche ID nicht; Groß-/Kleinschreibung zählt nicht
	survey.questions = [b];
	ensureSurveyTechnicalNames(survey);
	const deployed = collectDeployedTechnicalNames([JSON.stringify({ questions: [{ id: a.id, name: "Gleich_47cc5f41" }] }), "{kaputt", null]);
	assert.deepEqual(findTechnicalNameCollisions(survey, new Map(), deployed), [{ id: b.id, name: "gleich_47cc5f41" }]);
	survey.questions = [a];
	assert.deepEqual(findTechnicalNameCollisions(survey, new Map(), deployed), []);
});

console.log(`\n${passed} Tests bestanden`);
