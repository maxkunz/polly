import assert from "node:assert/strict";
import { assertSurveyAbsent, isValidSurveyId } from "../amplify/functions/shared/genesys_survey_check";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
	try {
		await fn();
		passed++;
		console.log(`ok - ${name}`);
	} catch (error) {
		console.error(`FAIL - ${name}`);
		throw error;
	}
}

const SURVEY_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const OTHER_ID = "b1ffcd00-9c0b-4ef8-bb6d-6bb9bd380a22";

type MockRoutes = Record<string, { status: number; body?: unknown } | Error>;

/** Ersetzt fetch; Schlüssel = Zeilen-Key (z. B. "survey_<id>") einer Tabelle "<tableId>/<rowKey>" */
function mockFetch(routes: MockRoutes): () => void {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: any) => {
		const url = String(input);
		const match = url.match(/datatables\/([^/]+)\/rows\/([^?]+)/);
		const key = match ? `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}` : url;
		const route = routes[key];
		if (!route) return new Response("{}", { status: 404 });
		if (route instanceof Error) throw route;
		return new Response(JSON.stringify(route.body ?? {}), { status: route.status });
	}) as typeof fetch;
	return () => {
		globalThis.fetch = original;
	};
}

function listRow(ids: string[]) {
	return { status: 200, body: { key: "survey_list", Draft: JSON.stringify(ids.map((id) => ({ id, title: id }))) } };
}

async function check(routes: MockRoutes, tables = ["t1"]) {
	const restore = mockFetch(routes);
	try {
		return await assertSurveyAbsent("mypurecloud.de", "token", tables, SURVEY_ID);
	} finally {
		restore();
	}
}

async function main() {
	await test("isValidSurveyId akzeptiert nur UUIDs", () => {
		assert.equal(isValidSurveyId(SURVEY_ID), true);
		assert.equal(isValidSurveyId(""), false);
		assert.equal(isValidSurveyId("abc"), false);
		assert.equal(isValidSurveyId(`${SURVEY_ID}#x`), false);
		assert.equal(isValidSurveyId(`${SURVEY_ID}\n`), false);
		assert.equal(isValidSurveyId(undefined), false);
	});

	await test("absent: Zeile 404 und nicht in survey_list", async () => {
		const result = await check({ "t1/survey_list": listRow([OTHER_ID]) });
		assert.equal(result.status, "absent");
	});

	await test("exists: Zeile survey_<id> vorhanden", async () => {
		const result = await check({
			"t1/survey_list": listRow([]),
			[`t1/survey_${SURVEY_ID}`]: { status: 200, body: { key: `survey_${SURVEY_ID}` } }
		});
		assert.equal(result.status, "exists");
	});

	await test("exists: ID steht noch in survey_list", async () => {
		const result = await check({ "t1/survey_list": listRow([OTHER_ID, SURVEY_ID]) });
		assert.equal(result.status, "exists");
	});

	await test("error: survey_list fehlt (Tabelle evtl. nicht vorhanden)", async () => {
		const result = await check({});
		assert.equal(result.status, "error");
	});

	await test("error: 403 beim Lesen der Zeile", async () => {
		const result = await check({ [`t1/survey_${SURVEY_ID}`]: { status: 403 } });
		assert.equal(result.status, "error");
	});

	await test("error: 500 bei survey_list", async () => {
		const result = await check({ "t1/survey_list": { status: 500 } });
		assert.equal(result.status, "error");
	});

	await test("error: Netzwerkfehler", async () => {
		const result = await check({ [`t1/survey_${SURVEY_ID}`]: new Error("network down") });
		assert.equal(result.status, "error");
	});

	await test("error: survey_list nicht lesbar (kein JSON)", async () => {
		const result = await check({ "t1/survey_list": { status: 200, body: { Draft: "{kaputt" } } });
		assert.equal(result.status, "error");
	});

	await test("exists in zweiter Tabelle genügt für Ablehnung", async () => {
		const result = await check(
			{ "t1/survey_list": listRow([]), "t2/survey_list": listRow([SURVEY_ID]) },
			["t1", "t2"]
		);
		assert.equal(result.status, "exists");
	});

	await test("error ohne Tabellen oder mit ungültiger ID", async () => {
		const noTables = await check({}, []);
		assert.equal(noTables.status, "error");
		const restore = mockFetch({});
		try {
			const invalid = await assertSurveyAbsent("mypurecloud.de", "token", ["t1"], "nicht-gueltig");
			assert.equal(invalid.status, "error");
		} finally {
			restore();
		}
	});

	console.log(`${passed} tests passed`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
