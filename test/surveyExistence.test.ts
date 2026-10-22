import assert from "node:assert/strict";
import { checkSurveyExists, clearSurveyExistenceCache } from "../amplify/functions/shared/genesys_survey_check";
import type { TenantCredentials } from "../amplify/functions/shared/tenant_auth";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
	clearSurveyExistenceCache();
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
const ROW_KEY = `survey_${SURVEY_ID}`;

function credentials(overrides: Partial<TenantCredentials> = {}): TenantCredentials {
	return {
		region: "mypurecloud.de",
		clientId: "client-ok",
		clientSecret: "secret",
		allowedDataTableIds: ["t1"],
		surveyDataTableId: "t1",
		...overrides
	};
}

type MockRoute = { status: number; body?: unknown } | Error;

/**
 * Ersetzt fetch. `row` antwortet auf Zeilenabrufe, `token` auf den Token-Endpunkt (Default 200).
 * Liefert die Anzahl der Zeilenabrufe.
 */
function mockFetch(row: MockRoute, token: MockRoute = { status: 200, body: { access_token: "tok", expires_in: 3600 } }) {
	const original = globalThis.fetch;
	const calls = { row: 0 };
	globalThis.fetch = (async (input: any) => {
		const url = String(input);
		const route = url.includes("/oauth/token") ? token : (calls.row++, row);
		if (route instanceof Error) throw route;
		return new Response(JSON.stringify(route.body ?? {}), { status: route.status });
	}) as typeof fetch;
	return { calls, restore: () => (globalThis.fetch = original) };
}

/** Verschiebt Date.now um `offsetMs` in die Zukunft. */
function shiftTime(offsetMs: number): () => void {
	const original = Date.now;
	Date.now = () => original() + offsetMs;
	return () => (Date.now = original);
}

async function main() {
	await test("exists: Zeile vorhanden, zweiter Aufruf aus dem Cache", async () => {
		const { calls, restore } = mockFetch({ status: 200, body: { key: ROW_KEY } });
		try {
			const first = await checkSurveyExists("tenant", SURVEY_ID, credentials());
			assert.deepEqual(first, { status: "exists", cached: false });
			const second = await checkSurveyExists("tenant", SURVEY_ID, credentials());
			assert.deepEqual(second, { status: "exists", cached: true });
			assert.equal(calls.row, 1);
		} finally {
			restore();
		}
	});

	await test("absent: Zeile 404, ebenfalls gecacht", async () => {
		const { calls, restore } = mockFetch({ status: 404 });
		try {
			assert.equal((await checkSurveyExists("tenant", SURVEY_ID, credentials())).status, "absent");
			const second = await checkSurveyExists("tenant", SURVEY_ID, credentials());
			assert.equal(second.status, "absent");
			assert.equal(second.cached, true);
			assert.equal(calls.row, 1);
		} finally {
			restore();
		}
	});

	await test("429: transient mit throttled, 60 s gecacht, danach neue Anfrage", async () => {
		const { calls, restore } = mockFetch({ status: 429 });
		try {
			const first = await checkSurveyExists("tenant", SURVEY_ID, credentials());
			assert.equal(first.status, "error");
			assert.equal(first.status === "error" && first.kind, "transient");
			assert.equal(first.status === "error" && first.throttled, true);
			assert.equal((await checkSurveyExists("tenant", SURVEY_ID, credentials())).cached, true);
			assert.equal(calls.row, 1);

			const restoreTime = shiftTime(61 * 1000);
			try {
				assert.equal((await checkSurveyExists("tenant", SURVEY_ID, credentials())).cached, false);
				assert.equal(calls.row, 2);
			} finally {
				restoreTime();
			}
		} finally {
			restore();
		}
	});

	await test("500 und Netzwerkfehler: transient", async () => {
		for (const row of [{ status: 500 }, new Error("socket hang up")]) {
			clearSurveyExistenceCache();
			const { restore } = mockFetch(row);
			try {
				const result = await checkSurveyExists("tenant", SURVEY_ID, credentials());
				assert.equal(result.status === "error" && result.kind, "transient");
				assert.equal(result.status === "error" && result.throttled, undefined);
			} finally {
				restore();
			}
		}
	});

	await test("401/403 auf die Zeile: config", async () => {
		for (const status of [401, 403]) {
			clearSurveyExistenceCache();
			const { restore } = mockFetch({ status });
			try {
				const result = await checkSurveyExists("tenant", SURVEY_ID, credentials());
				assert.equal(result.status === "error" && result.kind, "config");
			} finally {
				restore();
			}
		}
	});

	await test("Token-Abruf mit 401: config", async () => {
		const { calls, restore } = mockFetch({ status: 200 }, { status: 401 });
		try {
			const result = await checkSurveyExists("tenant", SURVEY_ID, credentials({ clientId: "client-revoked" }));
			assert.equal(result.status === "error" && result.kind, "config");
			assert.equal(calls.row, 0);
		} finally {
			restore();
		}
	});

	await test("Token-Abruf mit 503: transient", async () => {
		const { restore } = mockFetch({ status: 200 }, { status: 503 });
		try {
			const result = await checkSurveyExists("tenant", SURVEY_ID, credentials({ clientId: "client-down" }));
			assert.equal(result.status === "error" && result.kind, "transient");
		} finally {
			restore();
		}
	});

	await test("fehlende surveyDataTableId: config ohne Genesys-Aufruf", async () => {
		const { calls, restore } = mockFetch({ status: 200 });
		try {
			const result = await checkSurveyExists("tenant", SURVEY_ID, credentials({ surveyDataTableId: "" }));
			assert.equal(result.status === "error" && result.kind, "config");
			assert.equal(calls.row, 0);
		} finally {
			restore();
		}
	});

	await test("TTL: exists nach 30 min, absent nach 5 min neu gefragt", async () => {
		const exists = mockFetch({ status: 200 });
		try {
			await checkSurveyExists("tenant", SURVEY_ID, credentials());
			let restoreTime = shiftTime(29 * 60 * 1000);
			try {
				assert.equal((await checkSurveyExists("tenant", SURVEY_ID, credentials())).cached, true);
			} finally {
				restoreTime();
			}
			restoreTime = shiftTime(31 * 60 * 1000);
			try {
				assert.equal((await checkSurveyExists("tenant", SURVEY_ID, credentials())).cached, false);
			} finally {
				restoreTime();
			}
		} finally {
			exists.restore();
		}

		clearSurveyExistenceCache();
		const absent = mockFetch({ status: 404 });
		try {
			await checkSurveyExists("tenant", SURVEY_ID, credentials());
			let restoreTime = shiftTime(4 * 60 * 1000);
			try {
				assert.equal((await checkSurveyExists("tenant", SURVEY_ID, credentials())).cached, true);
			} finally {
				restoreTime();
			}
			restoreTime = shiftTime(6 * 60 * 1000);
			try {
				assert.equal((await checkSurveyExists("tenant", SURVEY_ID, credentials())).cached, false);
			} finally {
				restoreTime();
			}
		} finally {
			absent.restore();
		}
	});

	await test("Cache-Schlüssel enthält den Mandanten", async () => {
		const { calls, restore } = mockFetch({ status: 200 });
		try {
			await checkSurveyExists("tenant-a", SURVEY_ID, credentials());
			const other = await checkSurveyExists("tenant-b", SURVEY_ID, credentials());
			assert.equal(other.cached, false);
			assert.equal(calls.row, 2);
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
