import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
	createInvitationKey,
	invitationKeyId,
	signInvitation,
	verifyInvitation,
	type InvitationClaims
} from "../amplify/functions/shared/invitation_token";
import { PREVIEW_TOKEN_TTL_SECONDS } from "../src/domain/survey/invitationLinks";

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

const SECRET = "a".repeat(32) + "B".repeat(32);
const PREVIOUS_SECRET = "previous-secret-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";
const NOW = 1792155364;
const KEY = createInvitationKey(SECRET);
const PREVIOUS_KEY = createInvitationKey(PREVIOUS_SECRET);

const CLAIMS: InvitationClaims = {
	tenant_id: "org-tenant-123",
	survey_id: "3ee3807f-5ace-4e8a-9b9b-f48139f05c31",
	token_id: "65ca85ba-9137-4ebb-b845-06e4d7c2e960",
	multi: true,
	iat: NOW,
	exp: 1793487599
};

function encode(value: unknown): string {
	return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** Baut ein JWT mit beliebigem Header/Payload und gültiger HS256-Signatur. */
function craft(header: unknown, payload: unknown, secret = SECRET): string {
	const input = `${encode(header)}.${encode(payload)}`;
	return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}

function validHeader(secret = SECRET): Record<string, unknown> {
	return { alg: "HS256", typ: "JWT", kid: invitationKeyId(secret) };
}

function decodePart(jwt: string, index: number): any {
	return JSON.parse(Buffer.from(jwt.split(".")[index], "base64url").toString("utf8"));
}

test("signieren und prüfen ergibt dieselben Claims", () => {
	const jwt = signInvitation(CLAIMS, KEY, NOW);
	assert.deepEqual(verifyInvitation(jwt, [KEY], NOW), { ok: true, claims: CLAIMS });
});

test("Header enthält alg HS256, typ JWT und kid = erste 8 Zeichen des SHA-256-Hashs", () => {
	const header = decodePart(signInvitation(CLAIMS, KEY, NOW), 0);
	assert.deepEqual(header, { alg: "HS256", typ: "JWT", kid: invitationKeyId(SECRET) });
	assert.match(header.kid, /^[0-9a-f]{8}$/);
	assert.notEqual(invitationKeyId(SECRET), invitationKeyId(PREVIOUS_SECRET));
});

test("ohne exp läuft die Einladung nie ab", () => {
	const { exp: _exp, ...withoutExp } = CLAIMS;
	const jwt = signInvitation(withoutExp, KEY, NOW);
	assert.equal("exp" in decodePart(jwt, 1), false);
	assert.deepEqual(verifyInvitation(jwt, [KEY], 4102444800), { ok: true, claims: withoutExp });
});

test("Einmal-Einladung (multi=false) bleibt erhalten", () => {
	const claims = { ...CLAIMS, multi: false };
	assert.deepEqual(verifyInvitation(signInvitation(claims, KEY, NOW), [KEY], NOW), { ok: true, claims });
});

test("Rotation: mit dem vorherigen Schlüssel signierte Links bleiben gültig", () => {
	const jwt = signInvitation(CLAIMS, PREVIOUS_KEY, NOW);
	assert.equal(verifyInvitation(jwt, [KEY, PREVIOUS_KEY], NOW).ok, true);
	assert.deepEqual(verifyInvitation(jwt, [KEY], NOW), { ok: false, error: "invalid" });
});

test("Schlüssel ohne Secret werden übergangen", () => {
	const jwt = signInvitation(CLAIMS, KEY, NOW);
	assert.equal(verifyInvitation(jwt, [{ kid: KEY.kid, secret: "" }, KEY], NOW).ok, true);
	assert.deepEqual(verifyInvitation(jwt, [], NOW), { ok: false, error: "invalid" });
});

test("manipulierte Signatur ist ungültig", () => {
	const jwt = signInvitation(CLAIMS, KEY, NOW);
	const [h, p, s] = jwt.split(".");
	const flipped = (s[0] === "A" ? "B" : "A") + s.slice(1);
	assert.deepEqual(verifyInvitation(`${h}.${p}.${flipped}`, [KEY], NOW), { ok: false, error: "invalid" });
	assert.deepEqual(verifyInvitation(`${h}.${p}.${s.slice(0, -2)}`, [KEY], NOW), { ok: false, error: "invalid" });
});

test("andere Schreibweise derselben Signatur (Füllbits) ist ungültig", () => {
	const jwt = signInvitation(CLAIMS, KEY, NOW);
	const [h, p, s] = jwt.split(".");
	// 32 Byte = 43 base64url-Zeichen, die letzten 2 Bits des letzten Zeichens sind Füllbits
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
	const last = alphabet.indexOf(s[s.length - 1]);
	const variant = s.slice(0, -1) + alphabet[last ^ 1];
	assert.deepEqual(Buffer.from(variant, "base64url"), Buffer.from(s, "base64url"));
	assert.deepEqual(verifyInvitation(`${h}.${p}.${variant}`, [KEY], NOW), { ok: false, error: "invalid" });
});

test("manipulierte Payload (multi umgeschaltet) ist ungültig", () => {
	const jwt = signInvitation({ ...CLAIMS, multi: false }, KEY, NOW);
	const [h, , s] = jwt.split(".");
	const tampered = `${h}.${encode({ ...CLAIMS, multi: true })}.${s}`;
	assert.deepEqual(verifyInvitation(tampered, [KEY], NOW), { ok: false, error: "invalid" });
});

test("falscher Schlüssel ist ungültig, auch wenn der kid passt", () => {
	const forged = craft(validHeader(SECRET), CLAIMS, "anderer-schluessel");
	assert.deepEqual(verifyInvitation(forged, [KEY], NOW), { ok: false, error: "invalid" });
});

test("falsches alg ist ungültig (none, HS512, RS256, fehlend)", () => {
	for (const alg of ["none", "HS512", "RS256", "hs256", undefined]) {
		const jwt = craft({ ...validHeader(), alg }, CLAIMS);
		assert.deepEqual(verifyInvitation(jwt, [KEY], NOW), { ok: false, error: "invalid" }, String(alg));
	}
	const unsigned = `${encode({ ...validHeader(), alg: "none" })}.${encode(CLAIMS)}.`;
	assert.deepEqual(verifyInvitation(unsigned, [KEY], NOW), { ok: false, error: "invalid" });
});

test("falscher, fehlender oder unbekannter kid ist ungültig", () => {
	for (const kid of ["00000000", invitationKeyId(PREVIOUS_SECRET), 12345678, undefined]) {
		const jwt = craft({ ...validHeader(), kid }, CLAIMS);
		assert.deepEqual(verifyInvitation(jwt, [KEY], NOW), { ok: false, error: "invalid" }, String(kid));
	}
});

test("falsches typ ist ungültig, fehlendes typ wird akzeptiert", () => {
	assert.deepEqual(verifyInvitation(craft({ ...validHeader(), typ: "JWE" }, CLAIMS), [KEY], NOW), {
		ok: false,
		error: "invalid"
	});
	const { typ: _typ, ...withoutTyp } = validHeader();
	assert.equal(verifyInvitation(craft(withoutTyp, CLAIMS), [KEY], NOW).ok, true);
});

test("abgelaufenes exp ergibt expired, Grenze: exp ist die letzte gültige Sekunde", () => {
	const jwt = signInvitation(CLAIMS, KEY, NOW);
	assert.equal(verifyInvitation(jwt, [KEY], CLAIMS.exp! - 1).ok, true);
	assert.equal(verifyInvitation(jwt, [KEY], CLAIMS.exp!).ok, true);
	assert.deepEqual(verifyInvitation(jwt, [KEY], CLAIMS.exp! + 1), { ok: false, error: "expired" });
	assert.deepEqual(verifyInvitation(jwt, [KEY], CLAIMS.exp! + 86400), { ok: false, error: "expired" });
});

test("abgelaufen und manipuliert ergibt invalid, nicht expired", () => {
	const forged = craft(validHeader(), CLAIMS, "anderer-schluessel");
	assert.deepEqual(verifyInvitation(forged, [KEY], CLAIMS.exp! + 1), { ok: false, error: "invalid" });
});

test("fehlende oder falsch typisierte Pflicht-Claims sind ungültig", () => {
	const cases: Record<string, unknown>[] = [
		{ tenant_id: undefined },
		{ tenant_id: "" },
		{ tenant_id: 42 },
		{ survey_id: undefined },
		{ survey_id: "  " },
		{ token_id: undefined },
		{ multi: undefined },
		{ multi: "true" },
		{ iat: undefined },
		{ iat: "1792155364" },
		{ iat: 1.5 },
		{ exp: "1793487599" },
		{ exp: null },
		{ exp: -1 }
	];
	for (const patch of cases) {
		const payload: Record<string, unknown> = { ...CLAIMS, ...patch };
		for (const [key, value] of Object.entries(patch)) {
			if (value === undefined) delete payload[key];
		}
		assert.deepEqual(verifyInvitation(craft(validHeader(), payload), [KEY], NOW), { ok: false, error: "invalid" }, JSON.stringify(patch));
	}
});

test("unbekannte Claims werden nicht übernommen", () => {
	const result = verifyInvitation(craft(validHeader(), { ...CLAIMS, admin: true }), [KEY], NOW);
	assert.deepEqual(result, { ok: true, claims: CLAIMS });
});

test("Payload, die kein Objekt ist, ist ungültig", () => {
	for (const payload of [null, [], "text", 42]) {
		assert.deepEqual(verifyInvitation(craft(validHeader(), payload), [KEY], NOW), { ok: false, error: "invalid" });
	}
});

test("kaputtes Format ist ungültig", () => {
	const jwt = signInvitation(CLAIMS, KEY, NOW);
	const [h, p, s] = jwt.split(".");
	for (const value of ["", "abc", `${h}.${p}`, `${jwt}.extra`, `${h}.${p}.${s}=`, `${h}!.${p}.${s}`, `..`]) {
		assert.deepEqual(verifyInvitation(value, [KEY], NOW), { ok: false, error: "invalid" }, value);
	}
	const notJson = `${Buffer.from("kein json").toString("base64url")}.${p}.${s}`;
	assert.deepEqual(verifyInvitation(notJson, [KEY], NOW), { ok: false, error: "invalid" });
	assert.deepEqual(verifyInvitation(undefined as unknown as string, [KEY], NOW), { ok: false, error: "invalid" });
});

test("iat in der Zukunft ist ungültig, kleine Uhrabweichung wird toleriert", () => {
	assert.equal(verifyInvitation(craft(validHeader(), { ...CLAIMS, iat: NOW + 60 }), [KEY], NOW).ok, true);
	assert.deepEqual(verifyInvitation(craft(validHeader(), { ...CLAIMS, iat: NOW + 3600 }), [KEY], NOW), {
		ok: false,
		error: "invalid"
	});
});

test("signiert nur die bekannten Claims", () => {
	const jwt = signInvitation({ ...CLAIMS, count: 5000, internal: "x" } as InvitationClaims, KEY, NOW);
	assert.deepEqual(decodePart(jwt, 1), CLAIMS);
});

test("signieren lehnt exp in der Vergangenheit, exp <= iat und iat in der Zukunft ab", () => {
	assert.throws(() => signInvitation({ ...CLAIMS, exp: NOW - 1 }, KEY, NOW));
	assert.throws(() => signInvitation({ ...CLAIMS, exp: NOW }, KEY, NOW));
	assert.throws(() => signInvitation({ ...CLAIMS, iat: NOW + 10, exp: NOW + 5 }, KEY, NOW));
	assert.throws(() => signInvitation({ ...CLAIMS, iat: NOW + 3600 }, KEY, NOW));
});

test("signieren lehnt fehlenden Schlüssel und ungültige Claims ab", () => {
	assert.throws(() => createInvitationKey(""));
	assert.throws(() => signInvitation(CLAIMS, { kid: KEY.kid, secret: "" }, NOW));
	assert.throws(() => signInvitation({ ...CLAIMS, tenant_id: "" }, KEY, NOW));
	assert.throws(() => signInvitation({ ...CLAIMS, exp: 1.5 }, KEY, NOW));
});

test("Webvorschau: stage-Claim bleibt erhalten, ohne stage kein Feld", () => {
	const claims: InvitationClaims = { ...CLAIMS, stage: true, exp: NOW + PREVIEW_TOKEN_TTL_SECONDS };
	const jwt = signInvitation(claims, KEY, NOW);
	assert.equal(decodePart(jwt, 1).stage, true);
	assert.deepEqual(verifyInvitation(jwt, [KEY], NOW), { ok: true, claims });
	assert.equal("stage" in decodePart(signInvitation(CLAIMS, KEY, NOW), 1), false);
});

test("Webvorschau: stage: false wird verworfen, andere Typen sind ungültig", () => {
	const withFalse = craft(validHeader(), { ...CLAIMS, stage: false });
	assert.deepEqual(verifyInvitation(withFalse, [KEY], NOW), { ok: true, claims: CLAIMS });
	assert.deepEqual(verifyInvitation(craft(validHeader(), { ...CLAIMS, stage: "true" }), [KEY], NOW), { ok: false, error: "invalid" });
});

test("Webvorschau: stage ohne exp oder mit längerer Laufzeit ist ungültig", () => {
	const { exp: _exp, ...withoutExp } = CLAIMS;
	assert.deepEqual(verifyInvitation(craft(validHeader(), { ...withoutExp, stage: true }), [KEY], NOW), { ok: false, error: "invalid" });
	const tooLong = craft(validHeader(), { ...CLAIMS, stage: true, exp: NOW + PREVIEW_TOKEN_TTL_SECONDS + 1 });
	assert.deepEqual(verifyInvitation(tooLong, [KEY], NOW), { ok: false, error: "invalid" });
	assert.throws(() => signInvitation({ ...withoutExp, stage: true }, KEY, NOW));
	assert.throws(() => signInvitation({ ...CLAIMS, stage: true, exp: NOW + PREVIEW_TOKEN_TTL_SECONDS + 1 }, KEY, NOW));
});

test("Webvorschau: nach 7 Tagen abgelaufen", () => {
	const exp = NOW + PREVIEW_TOKEN_TTL_SECONDS;
	const jwt = signInvitation({ ...CLAIMS, stage: true, exp }, KEY, NOW);
	assert.equal(verifyInvitation(jwt, [KEY], exp).ok, true);
	assert.deepEqual(verifyInvitation(jwt, [KEY], exp + 1), { ok: false, error: "expired" });
});

console.log(`\n${passed} Tests bestanden`);
