import assert from "node:assert/strict";
import type { Survey } from "../src/domain/survey/surveyTypes";
import { validateSurvey } from "../src/domain/survey/surveyValidator";
import { TTS_TEXT_MAX_CHARS } from "../src/constants/surveyConstants";

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

const QUESTION_ID = "47cc5f41-3b76-47b2-bd77-17bc2d44cfba";
const FOLLOW_UP_ID = "7d52f6c9-0a63-4b08-8e6f-4a377d611867";

function buildSurvey(texts: {
	greeting?: string;
	closing?: string;
	description?: string;
	title?: string;
	reprompt?: string;
	followUpReprompt?: string;
}): Survey {
	return {
		id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
		name: "test_a0eebc99",
		title: "Test",
		description: texts.description,
		greeting_message: texts.greeting,
		closing_message: texts.closing,
		questions: [
			{
				id: QUESTION_ID,
				name: "frage_47cc5f41",
				type: "yes_no",
				title: texts.title ?? "Waren Sie zufrieden?",
				reprompt_message: texts.reprompt,
				follow_ups: [
					{
						condition: { operator: "equals", value: false },
						question: {
							id: FOLLOW_UP_ID,
							name: "folgefrage_7d52f6c9",
							type: "comment",
							title: "Was war das Problem?",
							reprompt_message: texts.followUpReprompt
						}
					}
				]
			}
		]
	};
}

const atLimit = "x".repeat(TTS_TEXT_MAX_CHARS);
const overLimit = "x".repeat(TTS_TEXT_MAX_CHARS + 1);

test("Texte genau am Limit sind gültig", () => {
	const errors = validateSurvey(
		buildSurvey({ greeting: atLimit, closing: atLimit, title: atLimit, reprompt: atLimit, followUpReprompt: atLimit })
	);
	assert.deepEqual(errors, []);
});

test("Zu lange TTS-Texte sind harte Validierungsfehler", () => {
	const errors = validateSurvey(
		buildSurvey({ greeting: overLimit, closing: overLimit, title: overLimit, reprompt: overLimit, followUpReprompt: overLimit })
	);
	assert.deepEqual(
		errors.map(e => e.fieldId),
		[
			"survey_greeting_input",
			"survey_closing_input",
			`q_title_${QUESTION_ID}`,
			`q_reprompt_${QUESTION_ID}`,
			`fu_reprompt_${FOLLOW_UP_ID}`
		]
	);
});

test("Nicht gesprochene Texte (Beschreibung) sind nicht begrenzt", () => {
	assert.deepEqual(validateSurvey(buildSurvey({ description: overLimit })), []);
});

console.log(`\n${passed} Tests bestanden`);
