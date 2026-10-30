import assert from "node:assert/strict";
import type { Survey, SurveyQuestion } from "../src/domain/survey/surveyTypes";
import { SURVEY_MAX_QUESTIONS, TTS_TEXT_MAX_CHARS } from "../src/constants/surveyConstants";
import { checkDeployable, prepareDraft, type PrepareDraftOptions } from "../amplify/functions/shared/survey_pipeline";
import {
	beginEdit,
	createSurvey,
	deploySurvey,
	endEdit,
	readSurveyRow,
	rollbackSurvey,
	saveDraft,
	type SurveyStoreContext
} from "../amplify/functions/shared/survey_store";
import { DataTableWriteError, addRow, putRow } from "../amplify/functions/shared/genesys_datatable";
import {
	clearInstallationMetaCache,
	loadDefaultBaseUrl,
	loadInstallationMeta,
	loadProjectTag
} from "../amplify/functions/shared/installation_meta";

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SURVEY_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const Q1 = "47cc5f41-3b76-47b2-bd77-17bc2d44cfba";
const Q2 = "58cf7b44-9336-4074-b5b8-5188f553a633";
const TABLE = "survey-table";
const NOW = "2026-10-30T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const HOUR_MS = 60 * 60 * 1000;

function question(overrides: Partial<SurveyQuestion> = {}): SurveyQuestion {
	return { id: Q1, name: "", type: "comment", title: "Was können wir besser machen?", ...overrides };
}

function survey(questions: SurveyQuestion[], overrides: Partial<Survey> = {}): Survey {
	return { id: SURVEY_ID, name: "", title: "Kundenzufriedenheit", questions, ...overrides };
}

function options(overrides: Partial<PrepareDraftOptions> = {}): PrepareDraftOptions {
	return { surveyId: SURVEY_ID, saved: null, version: 1, webSurvey: true, now: NOW, ...overrides };
}

/** `count` Kommentarfragen mit Titeln knapp unter dem TTS-Limit, um das Payload-Budget zu füllen. */
function bigQuestions(count: number): SurveyQuestion[] {
	return Array.from({ length: count }, (_, i) =>
		question({ id: `${String(i).padStart(8, "0")}-3b76-47b2-bd77-17bc2d44cfba`, title: `${i} ${"x".repeat(TTS_TEXT_MAX_CHARS - 100)}` })
	);
}

function lockJson(lockedBy: string, sinceMs: number, via?: "ui" | "mcp"): string {
	return JSON.stringify({ locked_by: lockedBy, locked_since: new Date(sinceMs).toISOString(), ...(via ? { via } : {}) });
}

// ---------------------------------------------------------------------------
// Data Table im Speicher statt Genesys
// ---------------------------------------------------------------------------

type Failure = { method: string; status: number; retryAfter?: string; key?: string };

class FakeDataTable {
	rows = new Map<string, Record<string, string>>();
	calls: Array<{ method: string; key: string; table: string }> = [];
	failures: Failure[] = [];
	private original = globalThis.fetch;

	install(): this {
		globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
			const url = new URL(String(input));
			const method = init.method ?? "GET";
			const match = url.pathname.match(/^\/api\/v2\/flows\/datatables\/([^/]+)\/rows(?:\/([^/]+))?$/);
			assert.ok(match, `unerwartete URL ${url}`);
			const table = decodeURIComponent(match[1]);
			const body = init.body ? JSON.parse(String(init.body)) : undefined;
			const key = match[2] ? decodeURIComponent(match[2]) : body?.key;
			this.calls.push({ method, key, table });

			const failureIndex = this.failures.findIndex(f => f.method === method && (!f.key || f.key === key));
			if (failureIndex !== -1) {
				const [failure] = this.failures.splice(failureIndex, 1);
				const headers = failure.retryAfter !== undefined ? { "Retry-After": failure.retryAfter } : undefined;
				return new Response("{}", { status: failure.status, headers });
			}

			if (method === "GET") {
				const row = this.rows.get(key);
				return row ? new Response(JSON.stringify(row), { status: 200 }) : new Response("{}", { status: 404 });
			}
			if (method === "PUT") {
				if (!this.rows.has(key)) return new Response("{}", { status: 404 });
				this.rows.set(key, body);
				return new Response(JSON.stringify(body), { status: 200 });
			}
			if (method === "POST") {
				if (this.rows.has(key)) return new Response("{}", { status: 409 });
				this.rows.set(key, body);
				return new Response(JSON.stringify(body), { status: 200 });
			}
			return new Response("{}", { status: 405 });
		}) as typeof fetch;
		return this;
	}

	restore(): void {
		globalThis.fetch = this.original;
	}

	writes(): Array<{ method: string; key: string }> {
		return this.calls.filter(call => call.method !== "GET").map(({ method, key }) => ({ method, key }));
	}

	surveyRow(id = SURVEY_ID): Record<string, string> {
		const row = this.rows.get(`survey_${id}`);
		assert.ok(row, `Zeile survey_${id} fehlt`);
		return row;
	}

	draft(id = SURVEY_ID): Survey {
		return JSON.parse(this.surveyRow(id).Draft);
	}

	/** Legt `survey_<id>` mit gespeichertem Draft (über die Pipeline, wie die App) an. */
	seedSurvey(draft: Survey, extra: Partial<Record<"Stage" | "Prod" | "Backup" | "lock", string>> = {}): Survey {
		const prepared = prepareDraft(draft, options({ version: draft.version ?? 1 }));
		assert.ok(prepared.ok);
		this.rows.set(`survey_${SURVEY_ID}`, {
			key: `survey_${SURVEY_ID}`,
			Draft: JSON.stringify(prepared.survey),
			Stage: "{}",
			Prod: "{}",
			Backup: "{}",
			lock: JSON.stringify({ locked_by: "", locked_since: "" }),
			...extra
		});
		this.rows.set("survey_list", {
			key: "survey_list",
			Draft: JSON.stringify([{ id: SURVEY_ID, title: prepared.survey.title }]),
			Stage: "{}",
			Prod: "{}",
			Backup: "{}",
			lock: JSON.stringify({ locked_by: "", locked_since: "" })
		});
		return prepared.survey;
	}
}

async function withTable(fn: (table: FakeDataTable) => Promise<void>): Promise<void> {
	const table = new FakeDataTable().install();
	try {
		await fn(table);
	} finally {
		table.restore();
	}
}

function ctx(overrides: Partial<SurveyStoreContext> = {}): SurveyStoreContext {
	return {
		tenantId: "tenant-1",
		credentials: { region: "mypurecloud.de", surveyDataTableId: TABLE },
		token: "user-token",
		userName: "Ada Lovelace",
		isBeingDeleted: async () => false,
		now: () => new Date(NOW),
		...overrides
	};
}

const WRITE = { webSurvey: true };

// ---------------------------------------------------------------------------
// Pipeline (rein)
// ---------------------------------------------------------------------------

await test("Pipeline: servergeführte Felder, fehlende IDs und Namen vergibt der Server, Eingabe bleibt unverändert", () => {
	const input = survey([question({ id: "" as string, name: "" })], { version: 99, created_at: "1999-01-01", id: "egal" });
	const snapshot = JSON.stringify(input);
	const result = prepareDraft(input, options({ version: 3 }));
	assert.ok(result.ok);
	assert.equal(JSON.stringify(input), snapshot);
	assert.equal(result.survey.id, SURVEY_ID);
	assert.equal(result.survey.version, 3);
	assert.equal(result.survey.created_at, NOW);
	assert.equal(result.survey.updated_at, NOW);
	assert.equal(result.survey.name, "kundenzufriedenheit_a0eebc99");
	assert.match(result.survey.questions[0].id, /^[0-9a-f-]{36}$/);
	assert.match(result.survey.questions[0].name, /^was_koennen_wir_besser_machen_[0-9a-f]{8}$/);
	assert.deepEqual(result.warnings, []);
});

await test("Pipeline: created_at bleibt aus der gespeicherten Fassung", () => {
	const saved = survey([question({ name: "frage_alt" })], { created_at: "2026-01-01T00:00:00.000Z", name: "alt" });
	const result = prepareDraft(survey([question()]), options({ saved, version: 2 }));
	assert.ok(result.ok);
	assert.equal(result.survey.created_at, "2026-01-01T00:00:00.000Z");
});

await test("Pipeline: gespeicherte Namen bleiben (name_immutable_ignored), neue entstehen aus dem Titel", () => {
	const saved = survey([question({ name: "frage_gespeichert" })], { name: "umfrage_gespeichert" });
	const input = survey(
		[question({ name: "umbenannt", title: "Neuer Titel" }), question({ id: Q2, name: "selbst_gewaehlt", title: "Zweite Frage" })],
		{ name: "umfrage_neu" }
	);
	const result = prepareDraft(input, options({ saved, version: 2 }));
	assert.ok(result.ok);
	assert.equal(result.survey.name, "umfrage_gespeichert");
	assert.equal(result.survey.questions[0].name, "frage_gespeichert");
	assert.equal(result.survey.questions[1].name, "zweite_frage_58cf7b44");
	assert.deepEqual(
		result.warnings.map(w => [w.code, w.details?.path, w.details?.name]),
		[
			["name_immutable_ignored", "survey.name", "umfrage_gespeichert"],
			["name_immutable_ignored", "questions[0].name", "frage_gespeichert"],
			["name_immutable_ignored", "questions[1].name", "zweite_frage_58cf7b44"]
		]
	);
});

await test("Pipeline: unveränderter Name ergibt keine Warnung", () => {
	const saved = survey([question({ name: "frage_gespeichert" })], { name: "umfrage_gespeichert" });
	const result = prepareDraft(survey([question({ name: "frage_gespeichert" })], { name: "umfrage_gespeichert" }), options({ saved }));
	assert.ok(result.ok);
	assert.deepEqual(result.warnings, []);
});

await test("Pipeline: ID keine UUID oder doppelt → invalid_id mit Pfad; gespeicherte Alt-ID bleibt erlaubt", () => {
	const notUuid = prepareDraft(survey([question({ id: "frage-1" })]), options());
	assert.deepEqual(!notUuid.ok && notUuid.error, { code: "invalid_id", details: { path: "questions[0].id", reason: "not_uuid" } });

	const followUp = question({ type: "yes_no", follow_ups: [{ condition: { operator: "equals", value: false }, question: question({ title: "Warum?" }) }] });
	const duplicate = prepareDraft(survey([followUp]), options());
	assert.deepEqual(!duplicate.ok && duplicate.error, {
		code: "invalid_id",
		details: { path: "questions[0].follow_ups[0].question.id", reason: "duplicate" }
	});

	const saved = survey([question({ id: "frage-1", name: "frage_alt" })]);
	assert.ok(prepareDraft(survey([question({ id: "frage-1" })]), options({ saved })).ok);

	// Umfrage und Fragen teilen sich die Zuordnung der technischen Namen, deshalb auch nicht die Umfrage-ID
	const surveyIdReused = prepareDraft(survey([question({ id: SURVEY_ID })]), options());
	assert.deepEqual(!surveyIdReused.ok && surveyIdReused.error, { code: "invalid_id", details: { path: "questions[0].id", reason: "duplicate" } });
});

await test("Pipeline: IDs von Auswahloptionen werden vergeben und geprüft", () => {
	const choice = question({ type: "choice", options: { labels: [{ id: "", label: "Ja" }, { id: "", label: "Nein" }] } });
	const result = prepareDraft(survey([choice]), options());
	assert.ok(result.ok);
	const labels = (result.survey.questions[0].options as { labels: Array<{ id: string }> }).labels;
	assert.equal(labels.length, 2);
	assert.notEqual(labels[0].id, labels[1].id);

	const duplicate = question({ type: "choice", options: { labels: [{ id: Q2, label: "Ja" }, { id: Q2, label: "Nein" }] } });
	const failed = prepareDraft(survey([duplicate]), options());
	assert.equal(!failed.ok && failed.error.details?.path, "questions[0].options.labels[1].id");
});

await test(`Pipeline: mehr als ${SURVEY_MAX_QUESTIONS} Fragen → validation_failed mit Code und rohen Parametern`, () => {
	const questions = Array.from({ length: SURVEY_MAX_QUESTIONS + 1 }, () => question({ id: "" }));
	const result = prepareDraft(survey(questions), options());
	assert.ok(!result.ok);
	assert.equal(result.error.code, "validation_failed");
	assert.deepEqual(result.error.details?.errors, [
		{ field: "survey.questions", code: "surveyMaxQuestions", params: { count: SURVEY_MAX_QUESTIONS + 1, max: SURVEY_MAX_QUESTIONS } }
	]);
});

await test("Pipeline: ohne web_survey werden Web-Felder zurückgesetzt, Warnung nur bei Änderung", () => {
	const changed = prepareDraft(survey([question()], { base_url: "https://example.com/{token}", language: "en", web_theme_id: "x" }), options({ webSurvey: false }));
	assert.ok(changed.ok);
	assert.equal(changed.survey.base_url, "");
	assert.equal(changed.survey.language, "de");
	assert.ok(!("web_theme_id" in changed.survey));
	assert.deepEqual(changed.warnings, [{ code: "web_settings_reset" }]);

	const unchanged = prepareDraft(survey([question()], { base_url: "", language: "de" }), options({ webSurvey: false }));
	assert.ok(unchanged.ok);
	assert.deepEqual(unchanged.warnings, []);
});

await test("Pipeline: web_theme_id muss beim Mandanten existieren (theme_unknown)", () => {
	const themeId = "7d52f6c9-0a63-4b08-8e6f-4a377d611867";
	const unknown = prepareDraft(survey([question()], { web_theme_id: themeId }), options({ knownThemeIds: new Set(["anderes"]) }));
	assert.deepEqual(!unknown.ok && unknown.error, { code: "theme_unknown", details: { themeId } });
	assert.ok(prepareDraft(survey([question()], { web_theme_id: themeId }), options({ knownThemeIds: new Set([themeId]) })).ok);
});

await test("Pipeline: Payload-Budget beim Draft nur Warnung, beim Deploy Fehler", () => {
	const warn = prepareDraft(survey(bigQuestions(4)), options());
	assert.ok(warn.ok);
	assert.equal(warn.payloadSize.level, "warn");
	assert.deepEqual(warn.warnings.map(w => w.code), ["payload_budget_75"]);

	const tooBig = prepareDraft(survey(bigQuestions(12)), options());
	assert.ok(tooBig.ok);
	assert.equal(tooBig.payloadSize.level, "exceeded");
	assert.deepEqual(tooBig.warnings.map(w => w.code), ["payload_budget_exceeded"]);
	const deploy = checkDeployable(tooBig.survey, { webSurvey: true });
	assert.ok(!deploy.ok);
	assert.equal(deploy.error.code, "payload_too_large");
	assert.equal(deploy.error.details?.limit, 31500);
});

// ---------------------------------------------------------------------------
// Data-Table-Schreibzugriff
// ---------------------------------------------------------------------------

await test("Allow-List: nur die Umfrage-Data-Table des Mandanten, Zeilen __meta/__lock werden nicht geschrieben", async () => {
	await withTable(async table => {
		const row = { key: `survey_${SURVEY_ID}`, Draft: "{}" };
		const noTable = { region: "mypurecloud.de", surveyDataTableId: "" };
		await assert.rejects(putRow(noTable, "t", `survey_${SURVEY_ID}`, row), (err: DataTableWriteError) => err.code === "table_not_allowed");
		await assert.rejects(addRow(noTable, "t", row), (err: DataTableWriteError) => err.code === "table_not_allowed");
		const own = { region: "mypurecloud.de", surveyDataTableId: TABLE };
		for (const key of ["__meta", "__lock", "survey_keine-uuid", "survey_"]) {
			await assert.rejects(putRow(own, "t", key, row), (err: DataTableWriteError) => err.code === "row_not_allowed");
			await assert.rejects(addRow(own, "t", { ...row, key }), (err: DataTableWriteError) => err.code === "row_not_allowed");
		}
		assert.equal(table.calls.length, 0);

		await putRow(own, "t", "survey_list", { key: "survey_list", Draft: "[]" }).catch(() => undefined);
		assert.deepEqual(table.calls, [{ method: "PUT", key: "survey_list", table: TABLE }]);
	});
});

await test("Schreiben: 429 wird mit Retry-After wiederholt, danach upstream_error mit throttled", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()]));
		table.failures.push({ method: "PUT", status: 429, retryAfter: "0" });
		assert.ok((await beginEdit(ctx(), SURVEY_ID)).ok);
		assert.equal(table.calls.filter(c => c.method === "PUT").length, 2);

		table.failures.push(...[1, 2, 3].map(() => ({ method: "PUT", status: 429, retryAfter: "0" })));
		const result = await beginEdit(ctx(), SURVEY_ID);
		assert.deepEqual(!result.ok && result.error, { code: "upstream_error", details: { status: 429, throttled: true } });
	});
});

await test("Schreiben: Wiederholung nur im Zeitbudget; fehlendes Retry-After zählt als Standardwartezeit", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()]));
		// 6,5 s Restbudget: reicht für Retry-After 0 plus Aufruf (6 s), nicht für die Standardwartezeit 1 s plus Aufruf
		const tight = () => ctx({ deadline: Date.now() + 6500 });
		table.failures.push({ method: "PUT", status: 429, retryAfter: "0" });
		assert.ok((await beginEdit(tight(), SURVEY_ID)).ok);

		table.failures.push({ method: "PUT", status: 429 });
		const noHeader = await beginEdit(tight(), SURVEY_ID);
		assert.deepEqual(!noHeader.ok && noHeader.error, { code: "upstream_error", details: { status: 429, throttled: true } });
		assert.equal(table.calls.filter(c => c.method === "PUT").length, 3);
	});
});

await test("Schreiben: andere HTTP-Fehler liefern den Status ohne throttled", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()]));
		table.failures.push({ method: "PUT", status: 403 });
		const result = await beginEdit(ctx(), SURVEY_ID);
		assert.deepEqual(!result.ok && result.error, { code: "upstream_error", details: { status: 403 } });
		assert.equal(table.calls.filter(c => c.method === "PUT").length, 1);
	});
});

// ---------------------------------------------------------------------------
// Store: anlegen
// ---------------------------------------------------------------------------

await test("create_survey: schreibt Zeile ohne Lock und Index, Version 1, IDs vom Server", async () => {
	await withTable(async table => {
		const result = await createSurvey(ctx(), survey([question()], { id: "vom-client" }), WRITE);
		assert.ok(result.ok);
		const { surveyId, version } = result.value;
		assert.notEqual(surveyId, "vom-client");
		assert.equal(version, 1);
		const draft = table.draft(surveyId);
		assert.equal(draft.id, surveyId);
		assert.equal(draft.version, 1);
		assert.equal(JSON.parse(table.surveyRow(surveyId).lock).locked_by, "");
		assert.deepEqual(JSON.parse(table.rows.get("survey_list")!.Draft), [{ id: surveyId, title: "Kundenzufriedenheit" }]);
		assert.deepEqual(table.writes(), [
			{ method: "POST", key: `survey_${surveyId}` },
			{ method: "POST", key: "survey_list" }
		]);
	});
});

await test("create_survey: 21 Fragen → validation_failed, nichts geschrieben", async () => {
	await withTable(async table => {
		const questions = Array.from({ length: SURVEY_MAX_QUESTIONS + 1 }, () => question({ id: "" }));
		const result = await createSurvey(ctx(), survey(questions), WRITE);
		assert.equal(!result.ok && result.error.code, "validation_failed");
		assert.deepEqual(table.calls, []);
	});
});

await test("create_survey: ohne Zeitbudget für den Index nur Warnung, die Umfrage bleibt gespeichert", async () => {
	await withTable(async table => {
		const result = await createSurvey(ctx({ deadline: Date.now() + 1000 }), survey([question()]), WRITE);
		assert.ok(result.ok);
		assert.deepEqual(result.value.warnings, [{ code: "survey_list_not_updated" }]);
		assert.deepEqual(table.writes(), [{ method: "POST", key: `survey_${result.value.surveyId}` }]);
	});
});

await test("create_survey: unlesbarer Index ergibt Warnung, die Umfrage bleibt gespeichert", async () => {
	await withTable(async table => {
		table.rows.set("survey_list", { key: "survey_list", Draft: "kein json" });
		const result = await createSurvey(ctx(), survey([question()]), WRITE);
		assert.ok(result.ok);
		assert.deepEqual(result.value.warnings, [{ code: "survey_list_not_updated" }]);
		assert.ok(table.rows.has(`survey_${result.value.surveyId}`));
		assert.equal(table.rows.get("survey_list")!.Draft, "kein json");
	});
});

// ---------------------------------------------------------------------------
// Store: Lock
// ---------------------------------------------------------------------------

await test("begin_edit: fremdes gültiges Lock → survey_locked mit Details, nichts geschrieben", async () => {
	await withTable(async table => {
		const since = NOW_MS - 10 * 60 * 1000;
		table.seedSurvey(survey([question()]), { lock: lockJson("Grace Hopper", since) });
		const result = await beginEdit(ctx(), SURVEY_ID);
		assert.deepEqual(!result.ok && result.error, {
			code: "survey_locked",
			details: {
				lockedBy: "Grace Hopper",
				since: new Date(since).toISOString(),
				expiresAt: new Date(since + HOUR_MS).toISOString(),
				via: "ui"
			}
		});
		assert.deepEqual(table.writes(), []);

		// Ablauf nach der Uhr aus ctx.now, nicht nach Date.now()
		assert.ok((await beginEdit(ctx({ now: () => new Date(since + HOUR_MS) }), SURVEY_ID)).ok);
	});
});

await test("begin_edit: abgelaufenes fremdes Lock wird übernommen, eigenes verlängert, via mcp", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()]), { lock: lockJson("Grace Hopper", NOW_MS - 2 * HOUR_MS) });
		const result = await beginEdit(ctx(), SURVEY_ID);
		assert.ok(result.ok);
		assert.deepEqual(result.value, { surveyId: SURVEY_ID, draftVersion: 1, expiresAt: new Date(Date.parse(NOW) + HOUR_MS).toISOString() });
		assert.deepEqual(JSON.parse(table.surveyRow().lock), { locked_by: "Ada Lovelace", locked_since: NOW, via: "mcp" });

		// Eigenes Lock (Groß-/Kleinschreibung egal) wird verlängert
		table.surveyRow().lock = lockJson("ada lovelace", NOW_MS - 5 * 60 * 1000, "ui");
		assert.ok((await beginEdit(ctx(), SURVEY_ID)).ok);
		assert.equal(JSON.parse(table.surveyRow().lock).via, "mcp");
	});
});

await test("end_edit: gibt nur das eigene Lock frei", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()]), { lock: lockJson("Grace Hopper", NOW_MS, "ui") });
		const foreign = await endEdit(ctx(), SURVEY_ID);
		assert.deepEqual(foreign.ok && foreign.value, { surveyId: SURVEY_ID, released: false });
		assert.equal(JSON.parse(table.surveyRow().lock).locked_by, "Grace Hopper");
		assert.deepEqual(table.writes(), []);

		table.surveyRow().lock = lockJson("Ada Lovelace", NOW_MS, "mcp");
		const own = await endEdit(ctx(), SURVEY_ID);
		assert.deepEqual(own.ok && own.value, { surveyId: SURVEY_ID, released: true });
		assert.equal(JSON.parse(table.surveyRow().lock).locked_by, "");
	});
});

// ---------------------------------------------------------------------------
// Store: Draft speichern
// ---------------------------------------------------------------------------

await test("save_draft: ohne eigenes Lock → lock_lost; in der App übernommen → lock_lost mit Details", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()]));
		const none = await saveDraft(ctx(), SURVEY_ID, survey([question()]), 1, WRITE);
		assert.deepEqual(!none.ok && none.error, { code: "lock_lost", details: {} });

		const since = NOW_MS - 60 * 1000;
		table.surveyRow().lock = lockJson("Grace Hopper", since, "ui");
		const taken = await saveDraft(ctx(), SURVEY_ID, survey([question()]), 1, WRITE);
		assert.equal(!taken.ok && taken.error.code, "lock_lost");
		assert.equal(!taken.ok && taken.error.details?.lockedBy, "Grace Hopper");
		assert.deepEqual(table.writes(), []);
	});
});

await test("save_draft: Draft-Version passt nicht → draft_conflict mit aktueller Version", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()], { version: 4 }), { lock: lockJson("Ada Lovelace", NOW_MS, "mcp") });
		const result = await saveDraft(ctx(), SURVEY_ID, survey([question()]), 3, WRITE);
		assert.deepEqual(!result.ok && result.error, { code: "draft_conflict", details: { current: 4 } });
		assert.deepEqual(table.writes(), []);
	});
});

await test("save_draft: Version +1, Namen unveränderlich, Lock verlängert, Index-Titel aktualisiert", async () => {
	await withTable(async table => {
		const saved = table.seedSurvey(survey([question()], { version: 4 }), { lock: lockJson("Ada Lovelace", NOW_MS - 50 * 60 * 1000, "mcp") });
		const input = survey([question({ name: "anders" }), question({ id: Q2, title: "Neu" })], { title: "Neuer Titel", name: "anders" });
		const result = await saveDraft(ctx(), SURVEY_ID, input, 4, WRITE);
		assert.ok(result.ok);
		assert.equal(result.value.version, 5);
		assert.equal(result.value.lockExpiresAt, new Date(Date.parse(NOW) + HOUR_MS).toISOString());
		assert.deepEqual(result.value.warnings.map(w => w.code), ["name_immutable_ignored", "name_immutable_ignored"]);

		const draft = table.draft();
		assert.equal(draft.version, 5);
		assert.equal(draft.name, saved.name);
		assert.equal(draft.questions[0].name, saved.questions[0].name);
		assert.equal(draft.questions[1].name, "neu_58cf7b44");
		assert.deepEqual(JSON.parse(table.surveyRow().lock), { locked_by: "Ada Lovelace", locked_since: NOW, via: "mcp" });
		assert.deepEqual(JSON.parse(table.rows.get("survey_list")!.Draft), [{ id: SURVEY_ID, title: "Neuer Titel" }]);
	});
});

await test("save_draft: release gibt das Lock frei; Prüffehler schreiben nichts", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()]), { lock: lockJson("Ada Lovelace", NOW_MS, "mcp") });
		const invalid = await saveDraft(ctx(), SURVEY_ID, survey([]), 1, WRITE);
		assert.equal(!invalid.ok && invalid.error.code, "validation_failed");
		assert.deepEqual(table.writes(), []);

		const released = await saveDraft(ctx(), SURVEY_ID, survey([question()]), 1, { ...WRITE, release: true });
		assert.ok(released.ok);
		assert.ok(!("lockExpiresAt" in released.value));
		assert.equal(JSON.parse(table.surveyRow().lock).locked_by, "");
		// Titel unverändert: Index wird nicht neu geschrieben
		assert.deepEqual(table.writes(), [{ method: "PUT", key: `survey_${SURVEY_ID}` }]);
	});
});

// ---------------------------------------------------------------------------
// Store: Deploy und Rollback
// ---------------------------------------------------------------------------

await test("deploy: Stage, dann Prod mit Backup; gleiche Version erneut → already_in_prod; Lock bleibt", async () => {
	await withTable(async table => {
		const ownLock = lockJson("Ada Lovelace", NOW_MS, "mcp");
		table.seedSurvey(survey([question()], { version: 2 }), { Prod: JSON.stringify({ id: SURVEY_ID, version: 1 }), lock: ownLock });

		const stage = await deploySurvey(ctx(), SURVEY_ID, "Stage", 2, WRITE);
		assert.deepEqual(stage.ok && stage.value, { surveyId: SURVEY_ID, target: "Stage", deployedVersion: 2, warnings: [] });
		assert.equal(JSON.parse(table.surveyRow().Stage).version, 2);
		assert.equal(JSON.parse(table.surveyRow().Prod).version, 1);

		assert.ok((await deploySurvey(ctx(), SURVEY_ID, "Prod", 2, WRITE)).ok);
		assert.equal(JSON.parse(table.surveyRow().Prod).version, 2);
		assert.deepEqual(JSON.parse(table.surveyRow().Backup), { id: SURVEY_ID, version: 1 });
		assert.equal(table.surveyRow().lock, ownLock);

		const again = await deploySurvey(ctx(), SURVEY_ID, "Prod", 2, WRITE);
		assert.deepEqual(!again.ok && again.error, { code: "already_in_prod", details: { version: 2 } });
		assert.deepEqual(JSON.parse(table.surveyRow().Backup), { id: SURVEY_ID, version: 1 });
	});
});

await test("deploy: fremdes Lock, falsche Version, zu großes Flow-JSON → Fehler, nichts geschrieben", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()]), { lock: lockJson("Grace Hopper", NOW_MS, "ui") });
		const locked = await deploySurvey(ctx(), SURVEY_ID, "Prod", 1, WRITE);
		assert.equal(!locked.ok && locked.error.code, "survey_locked");

		table.surveyRow().lock = lockJson("", 0);
		const conflict = await deploySurvey(ctx(), SURVEY_ID, "Stage", 7, WRITE);
		assert.deepEqual(!conflict.ok && conflict.error, { code: "draft_conflict", details: { current: 1 } });

		table.seedSurvey(survey(bigQuestions(12)));
		const tooBig = await deploySurvey(ctx(), SURVEY_ID, "Stage", 1, WRITE);
		assert.equal(!tooBig.ok && tooBig.error.code, "payload_too_large");
		assert.deepEqual(table.writes(), []);
	});
});

await test("rollback: prod_conflict, no_backup, sonst Backup → Prod", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()], { version: 3 }), { Prod: JSON.stringify({ version: 3 }) });
		const noBackup = await rollbackSurvey(ctx(), SURVEY_ID, 3);
		assert.deepEqual(!noBackup.ok && noBackup.error, { code: "no_backup" });

		table.surveyRow().Backup = JSON.stringify({ version: 2 });
		const conflict = await rollbackSurvey(ctx(), SURVEY_ID, 2);
		assert.deepEqual(!conflict.ok && conflict.error, { code: "prod_conflict", details: { current: 3 } });
		assert.deepEqual(table.writes(), []);

		const ok = await rollbackSurvey(ctx(), SURVEY_ID, 3);
		assert.deepEqual(ok.ok && ok.value, { surveyId: SURVEY_ID, prodVersion: 2 });
		assert.deepEqual(JSON.parse(table.surveyRow().Prod), { version: 2 });
	});
});

await test("not_found: fehlende Zeile, ungültige ID oder laufende Löschung (dann ohne Genesys-Aufruf)", async () => {
	await withTable(async table => {
		const missing = await readSurveyRow(ctx(), SURVEY_ID);
		assert.deepEqual(!missing.ok && missing.error, { code: "not_found" });
		const invalid = await beginEdit(ctx(), "keine-uuid");
		assert.deepEqual(!invalid.ok && invalid.error, { code: "not_found" });

		table.seedSurvey(survey([question()]));
		table.calls = [];
		const deleting = ctx({ isBeingDeleted: async () => true });
		for (const result of [
			await readSurveyRow(deleting, SURVEY_ID),
			await beginEdit(deleting, SURVEY_ID),
			await saveDraft(deleting, SURVEY_ID, survey([question()]), 1, WRITE),
			await deploySurvey(deleting, SURVEY_ID, "Prod", 1, WRITE),
			await rollbackSurvey(deleting, SURVEY_ID, null)
		]) {
			assert.deepEqual(!result.ok && result.error, { code: "not_found" });
		}
		assert.deepEqual(table.calls, []);
	});
});

await test("upstream_error: Genesys antwortet beim Lesen mit 500", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()]));
		table.failures.push({ method: "GET", status: 500 });
		const result = await readSurveyRow(ctx(), SURVEY_ID);
		assert.deepEqual(!result.ok && result.error, { code: "upstream_error", details: { status: 500 } });
	});
});

await test("readSurveyRow: Draft, Lock und Versionen", async () => {
	await withTable(async table => {
		table.seedSurvey(survey([question()], { version: 2 }), { Prod: JSON.stringify({ version: 1 }), lock: lockJson("Ada Lovelace", 0, "mcp") });
		const result = await readSurveyRow(ctx(), SURVEY_ID);
		assert.ok(result.ok);
		assert.deepEqual(result.value.versions, { draft: 2, stage: null, prod: 1, backup: null });
		assert.equal(result.value.draft?.title, "Kundenzufriedenheit");
		assert.equal(result.value.lock.via, "mcp");
	});
});

// ---------------------------------------------------------------------------
// Installationsdaten aus __meta
// ---------------------------------------------------------------------------

await test("installation_meta: Projekt-Tag, Flags, Basis-URL; einmal gelesen, 60 s gemerkt, fresh liest neu", async () => {
	clearInstallationMetaCache();
	await withTable(async table => {
		const meta = {
			setup: { projectTag: " acme " },
			features: { web_survey: true, mcp: "ja" },
			web: { defaultBaseUrl: "https://umfrage.example.com/s/{token}" }
		};
		table.rows.set("__meta", { key: "__meta", Draft: JSON.stringify(meta) });
		const access = { region: "mypurecloud.de", token: "t", dataTableId: TABLE };

		assert.deepEqual(await loadInstallationMeta("tenant-1", access), {
			projectTag: "acme",
			features: { web_survey: true },
			defaultBaseUrl: "https://umfrage.example.com/s/{token}"
		});
		assert.equal(await loadProjectTag("tenant-1", access), "acme");
		assert.equal(await loadDefaultBaseUrl("tenant-1", access), "https://umfrage.example.com/s/{token}");
		assert.equal(table.calls.length, 1);

		table.rows.set("__meta", { key: "__meta", Draft: JSON.stringify({ web: { defaultBaseUrl: "kein-link" } }) });
		assert.equal(await loadDefaultBaseUrl("tenant-1", access, true), undefined);
		assert.equal(await loadProjectTag("tenant-1", access), undefined);
		assert.equal(table.calls.length, 2);
	});
	clearInstallationMetaCache();
});

await test("installation_meta: fehlende Zeile ergibt leere Werte, Lesefehler werden nicht gemerkt", async () => {
	clearInstallationMetaCache();
	await withTable(async table => {
		const access = { region: "mypurecloud.de", token: "t", dataTableId: TABLE };
		table.failures.push({ method: "GET", status: 503 });
		await assert.rejects(loadInstallationMeta("tenant-1", access), (err: any) => err.status === 503);
		assert.deepEqual(await loadInstallationMeta("tenant-1", access), { features: {} });
		assert.equal(table.calls.length, 2);
	});
	clearInstallationMetaCache();
});

console.log(`\n${passed} Tests bestanden`);
