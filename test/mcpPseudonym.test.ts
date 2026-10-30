import assert from "node:assert/strict";
import {
	CURSOR_MAX_CHARS,
	derivePseudonymKeys,
	openCursor,
	pseudonymize,
	sealCursor
} from "../amplify/functions/shared/pseudonym";

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

const SECRET = "test-secret-with-at-least-32-bytes-0123456789";
const keys = derivePseudonymKeys(SECRET);
const binding = { tenantId: "tenant-a", surveyId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };
const CONVERSATION_ID = "5b0c0f7e-2f9d-4b1e-9c33-7d0a1e2b3c4d";
const HOUR_MS = 60 * 60 * 1000;

test("Secret unter 32 Bytes wird abgelehnt", () => {
	assert.throws(() => derivePseudonymKeys("zu-kurz"), /too short/);
	assert.doesNotThrow(() => derivePseudonymKeys(Buffer.alloc(32, 1)));
});

test("HMAC- und Cursor-Schlüssel sind verschieden und deterministisch", () => {
	assert.notDeepEqual(keys.hmacKey, keys.cursorKey);
	assert.deepEqual(derivePseudonymKeys(SECRET).hmacKey, keys.hmacKey);
	assert.equal(keys.hmacKey.byteLength, 32);
	assert.equal(keys.cursorKey.byteLength, 32);
});

test("Pseudonym: Format r_<base64url>, 128 bit, ohne Klar-ID", () => {
	const pseudonym = pseudonymize(keys, "tenant-a", "survey-1", CONVERSATION_ID);
	assert.match(pseudonym, /^r_[A-Za-z0-9_-]{22}$/);
	assert.ok(!pseudonym.includes(CONVERSATION_ID.slice(0, 8)));
});

test("Pseudonym: stabil pro Mandant und Umfrage, verschieden zwischen Mandanten, Umfragen, Werten und Secrets", () => {
	const a = pseudonymize(keys, "tenant-a", "survey-1", CONVERSATION_ID);
	assert.equal(pseudonymize(keys, "tenant-a", "survey-1", CONVERSATION_ID), a);
	assert.notEqual(pseudonymize(keys, "tenant-b", "survey-1", CONVERSATION_ID), a);
	assert.notEqual(pseudonymize(keys, "tenant-a", "survey-2", CONVERSATION_ID), a);
	assert.notEqual(pseudonymize(keys, "tenant-a", "survey-1", `${CONVERSATION_ID}x`), a);
	assert.notEqual(pseudonymize(derivePseudonymKeys(`${SECRET}-anders`), "tenant-a", "survey-1", CONVERSATION_ID), a);
});

test("Pseudonym: Mandant, Umfrage und Wert lassen sich nicht verschieben", () => {
	assert.notEqual(pseudonymize(keys, "a", "s", "b:c"), pseudonymize(keys, "a:b", "s", "c"));
	assert.notEqual(pseudonymize(keys, "ab", "s", "c"), pseudonymize(keys, "a", "bs", "c"));
	assert.notEqual(pseudonymize(keys, "a", "sb", "c"), pseudonymize(keys, "a", "s", "bc"));
});

test("Cursor: Rundreise liefert den Inhalt, Klar-IDs stehen nicht im Cursor", () => {
	const payload = { after: { surveyStartedAt: "2026-10-30T10:00:00.000Z", conversationId: CONVERSATION_ID } };
	const cursor = sealCursor(keys, binding, payload, Date.now() + HOUR_MS);
	assert.match(cursor, /^[A-Za-z0-9_-]+$/);
	assert.ok(!cursor.includes(CONVERSATION_ID));
	assert.ok(!Buffer.from(cursor, "base64url").toString("latin1").includes(CONVERSATION_ID));
	assert.deepEqual(openCursor(keys, binding, cursor), payload);
});

test("Cursor: zweimal versiegelt ergibt verschiedene Werte (zufälliger IV)", () => {
	const expires = Date.now() + HOUR_MS;
	assert.notEqual(sealCursor(keys, binding, { n: 1 }, expires), sealCursor(keys, binding, { n: 1 }, expires));
});

test("Cursor: fremder Mandant, fremde Umfrage oder anderes Secret → undefined", () => {
	const cursor = sealCursor(keys, binding, { n: 1 }, Date.now() + HOUR_MS);
	assert.equal(openCursor(keys, { ...binding, tenantId: "tenant-b" }, cursor), undefined);
	assert.equal(openCursor(keys, { ...binding, surveyId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" }, cursor), undefined);
	assert.equal(openCursor(derivePseudonymKeys(`${SECRET}-anders`), binding, cursor), undefined);
});

test("Cursor: abgelaufen → undefined, genau am Ablauf ebenfalls", () => {
	const now = Date.now();
	const cursor = sealCursor(keys, binding, { n: 1 }, now + 1000);
	assert.deepEqual(openCursor(keys, binding, cursor, now + 999), { n: 1 });
	assert.equal(openCursor(keys, binding, cursor, now + 1000), undefined);
	assert.equal(openCursor(keys, binding, sealCursor(keys, binding, { n: 1 }, now - 1), now), undefined);
});

test("Cursor: jedes veränderte Byte wird erkannt", () => {
	const cursor = sealCursor(keys, binding, { n: 1 }, Date.now() + HOUR_MS);
	const raw = Buffer.from(cursor, "base64url");
	for (let i = 0; i < raw.byteLength; i++) {
		const tampered = Buffer.from(raw);
		tampered[i] ^= 0x01;
		assert.equal(openCursor(keys, binding, tampered.toString("base64url")), undefined, `Byte ${i}`);
	}
});

test("Cursor: Unsinn, falsche Typen und Überlänge → undefined", () => {
	for (const value of [undefined, null, 42, {}, "", "!!!", "abc", "a".repeat(CURSOR_MAX_CHARS + 1), Buffer.alloc(40).toString("base64url")]) {
		assert.equal(openCursor(keys, binding, value), undefined);
	}
});

console.log(`\n${passed} Tests bestanden`);
