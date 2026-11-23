import assert from "node:assert/strict";
import {
	EMPTY_SURVEY_LOCK,
	buildSurveyListPayload,
	buildSurveyRowPayload,
	parseSurveyDraft,
	readFieldVersion,
	surveyRowKey,
	withSurveyListItem
} from "../src/domain/survey/surveyRow";

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

const currentRow = {
	key: surveyRowKey(ID),
	Draft: '{"version":6}',
	Stage: '{"version":5}',
	Prod: '{"version":5}',
	Backup: '{"version":4}',
	lock: '{"locked_by":"Anna","locked_since":"2026-10-13T08:00:00.000Z"}',
	// Von der API mitgelieferte Zusatzfelder dürfen nicht zurückgeschrieben werden
	updatedBy: "irrelevant"
};

test("Änderung ersetzt nur die angegebenen Felder, der Rest kommt aus der aktuellen Zeile", () => {
	assert.deepEqual(buildSurveyRowPayload(ID, currentRow, { lock: EMPTY_SURVEY_LOCK }), {
		key: `survey_${ID}`,
		Draft: '{"version":6}',
		Stage: '{"version":5}',
		Prod: '{"version":5}',
		Backup: '{"version":4}',
		lock: EMPTY_SURVEY_LOCK
	});
});

test("Prod-Deploy: Backup und Prod ersetzt, Draft/Stage/Lock bleiben", () => {
	const payload = buildSurveyRowPayload(ID, currentRow, { Backup: currentRow.Prod, Prod: '{"version":6}' });
	assert.equal(payload.Backup, '{"version":5}');
	assert.equal(payload.Prod, '{"version":6}');
	assert.equal(payload.Draft, currentRow.Draft);
	assert.equal(payload.Stage, currentRow.Stage);
	assert.equal(payload.lock, currentRow.lock);
});

test("neue Zeile: fehlende Felder werden leer vorbelegt", () => {
	assert.deepEqual(buildSurveyRowPayload(ID, null, { Draft: '{"version":1}' }), {
		key: `survey_${ID}`,
		Draft: '{"version":1}',
		Stage: "{}",
		Prod: "{}",
		Backup: "{}",
		lock: EMPTY_SURVEY_LOCK
	});
});

test("readFieldVersion liest die Version oder liefert null", () => {
	assert.equal(readFieldVersion('{"version":6}'), 6);
	assert.equal(readFieldVersion({ version: 2 }), 2);
	assert.equal(readFieldVersion("{}"), null);
	assert.equal(readFieldVersion(""), null);
	assert.equal(readFieldVersion("kein json"), null);
});

test("parseSurveyDraft liest den Draft oder liefert null", () => {
	assert.deepEqual(parseSurveyDraft('{"id":"a","version":2}'), { id: "a", version: 2 });
	assert.equal(parseSurveyDraft("{}"), null);
	assert.equal(parseSurveyDraft(""), null);
	assert.equal(parseSurveyDraft("kein json"), null);
	assert.equal(parseSurveyDraft("42"), null);
});

test("survey_list: Eintrag ersetzen oder anhängen, unverändert null; übrige Spalten bleiben", () => {
	const items = [{ id: "a", title: "Alt" }, { id: "b", title: "B" }];
	assert.deepEqual(withSurveyListItem(items, { id: "a", title: "Neu" }), [{ id: "a", title: "Neu" }, { id: "b", title: "B" }]);
	assert.deepEqual(withSurveyListItem(items, { id: "c", title: "C" }), [...items, { id: "c", title: "C" }]);
	assert.equal(withSurveyListItem(items, { id: "b", title: "B" }), null);
	assert.equal(items[0].title, "Alt");

	assert.deepEqual(buildSurveyListPayload(items, { Prod: "p", lock: "l" }), {
		key: "survey_list",
		Draft: JSON.stringify(items),
		Prod: "p",
		Stage: "{}",
		Backup: "{}",
		lock: "l"
	});
	assert.equal(buildSurveyListPayload([], null).lock, EMPTY_SURVEY_LOCK);
});

console.log(`\n${passed} Tests bestanden`);
