import assert from "node:assert/strict";
import {
	createEmptyQuestion,
	createEmptySurvey,
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

console.log(`\n${passed} Tests bestanden`);
