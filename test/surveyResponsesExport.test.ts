import assert from "node:assert/strict";
import {
	CSV_HEADER,
	escapeCsvField,
	formatValue,
	neutralizeFormula,
	sessionToCsvRows
} from "../amplify/functions/survey_responses_export/csv";
import { addToSummary, createSummary } from "../amplify/functions/survey_responses_export/summary";

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

test("Header entspricht der Spezifikation plus status", () => {
	assert.equal(CSV_HEADER, "responseId;Survey Name;Survey-Version;QuestionId;Type;answeredAt;value;status");
});

test("escapeCsvField quotet Trennzeichen, Anführungszeichen und Zeilenumbrüche", () => {
	assert.equal(escapeCsvField("einfach"), "einfach");
	assert.equal(escapeCsvField("a;b"), '"a;b"');
	assert.equal(escapeCsvField('sagt "hi"'), '"sagt ""hi"""');
	assert.equal(escapeCsvField("zeile1\nzeile2"), '"zeile1\nzeile2"');
});

test("neutralizeFormula stellt bei Formelzeichen ein Hochkomma voran", () => {
	for (const text of ["=1+1", "+1", "-1", "@x", "\tx", "\rx"]) {
		assert.equal(neutralizeFormula(text), `'${text}`);
	}
	assert.equal(neutralizeFormula("normal"), "normal");
});

test("formatValue behandelt boolean, number, string und leere Werte", () => {
	assert.equal(formatValue(true), "true");
	assert.equal(formatValue(false), "false");
	assert.equal(formatValue(9), "9");
	assert.equal(formatValue(-3), "-3");
	assert.equal(formatValue("=SUM(A1)"), "'=SUM(A1)");
	assert.equal(formatValue("a;b"), '"a;b"');
	assert.equal(formatValue(null), "");
	assert.equal(formatValue(undefined), "");
});

test("sessionToCsvRows sortiert nach answeredAt und liefert pro Antwort eine Zeile", () => {
	const rows = sessionToCsvRows({
		responseId: "conv-1",
		surveyName: "kunde_1234",
		surveyVersion: 3,
		status: "completed",
		answers: {
			comment_b: { type: "comment", value: "gut; danke", answeredAt: "2026-01-01T10:00:02.000Z" },
			nps_a: { type: "nps", value: 9, answeredAt: "2026-01-01T10:00:01.000Z" }
		}
	});
	assert.deepEqual(rows, [
		"conv-1;kunde_1234;3;nps_a;nps;2026-01-01T10:00:01.000Z;9;completed",
		'conv-1;kunde_1234;3;comment_b;comment;2026-01-01T10:00:02.000Z;"gut; danke";completed'
	]);
});

test("Session ohne Antworten ergibt keine Zeilen", () => {
	assert.deepEqual(sessionToCsvRows({ responseId: "x", answers: {} }), []);
	assert.deepEqual(sessionToCsvRows({ responseId: "x" }), []);
});

test("addToSummary zählt Sessions, Antworten, Status und Versionen", () => {
	const summary = createSummary();
	addToSummary(summary, {
		responseId: "1",
		surveyVersion: 2,
		status: "completed",
		answers: { a: {}, b: {} }
	});
	addToSummary(summary, { responseId: "2", surveyVersion: 2, status: "partial", answers: { a: {} } });
	addToSummary(summary, { responseId: "3", status: "timed_out" });
	assert.equal(summary.sessions, 3);
	assert.equal(summary.answers, 3);
	assert.deepEqual(summary.statusCounts, { completed: 1, partial: 1, timed_out: 1 });
	assert.deepEqual(summary.versions, { "2": 2, "1": 1 });
});

console.log(`\n${passed} Tests bestanden`);
