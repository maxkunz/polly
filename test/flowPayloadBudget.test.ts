import assert from "node:assert/strict";
import type { Survey } from "../src/domain/survey/surveyTypes";
import { evaluateFlowPayloadSize, measureFlowPayload } from "../src/services/flowPayloadBudget";
import { translateSurveyForFlow } from "../src/services/surveyFlowTranslator";
import { FLOW_PAYLOAD_MAX_CHARS } from "../src/constants/surveyConstants";

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

function surveyWithDescription(description: string): Survey {
	return {
		id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
		name: "test_a0eebc99",
		title: "Test",
		description,
		questions: [
			{
				id: "47cc5f41-3b76-47b2-bd77-17bc2d44cfba",
				name: "kommentar_47cc5f41",
				type: "comment",
				title: "Haben Sie noch weitere Anmerkungen?"
			}
		]
	};
}

test("Unter 75 % ist die Größe unkritisch", () => {
	const size = evaluateFlowPayloadSize(FLOW_PAYLOAD_MAX_CHARS * 0.75 - 1);
	assert.equal(size.level, "ok");
});

test("Ab 75 % wird gewarnt", () => {
	const size = evaluateFlowPayloadSize(FLOW_PAYLOAD_MAX_CHARS * 0.75);
	assert.equal(size.level, "warn");
	assert.equal(size.percent, 75);
});

test("Genau am Limit ist noch zulässig", () => {
	const size = evaluateFlowPayloadSize(FLOW_PAYLOAD_MAX_CHARS);
	assert.equal(size.level, "warn");
	assert.equal(size.percent, 100);
});

test("Über dem Limit ist gesperrt", () => {
	assert.equal(evaluateFlowPayloadSize(FLOW_PAYLOAD_MAX_CHARS + 1).level, "exceeded");
});

test("Gemessen wird die Länge des übersetzten Flow-JSON inkl. Escapes", () => {
	const survey = surveyWithDescription('Zeile 1\n"Zitat"');
	assert.equal(measureFlowPayload(survey).length, translateSurveyForFlow(survey).length);
});

test("Lange Texte überschreiten das Budget", () => {
	const survey = surveyWithDescription("x".repeat(FLOW_PAYLOAD_MAX_CHARS));
	assert.equal(measureFlowPayload(survey).level, "exceeded");
});

console.log(`\n${passed} Tests bestanden`);
