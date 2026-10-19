import assert from "node:assert/strict";
import {
	INVITATION_CSV_HEADER,
	buildInvitationCsv,
	buildInvitationUrl,
	expirationFromDate,
	formatInvitationExpiration
} from "../src/domain/survey/invitationLinks";

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

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ0IjoxfQ.abc-_123";
const ORIGIN = "https://polly.example.com";

test("Platzhalter {token} wird ersetzt", () => {
	assert.equal(buildInvitationUrl("https://baseurl.com/{token}", JWT, ORIGIN), `https://baseurl.com/${JWT}`);
	assert.equal(
		buildInvitationUrl("https://baseurl.com/survey?t={token}&x=1", JWT, ORIGIN),
		`https://baseurl.com/survey?t=${JWT}&x=1`
	);
});

test("ohne Platzhalter: ?token= bzw. &token=", () => {
	assert.equal(buildInvitationUrl("https://baseurl.com/page", JWT, ORIGIN), `https://baseurl.com/page?token=${JWT}`);
	assert.equal(
		buildInvitationUrl("https://baseurl.com/page?lang=de", JWT, ORIGIN),
		`https://baseurl.com/page?lang=de&token=${JWT}`
	);
	assert.equal(buildInvitationUrl("https://baseurl.com/page?", JWT, ORIGIN), `https://baseurl.com/page?token=${JWT}`);
	assert.equal(
		buildInvitationUrl("https://baseurl.com/page?a=1&", JWT, ORIGIN),
		`https://baseurl.com/page?a=1&token=${JWT}`
	);
});

test("Query wird vor einem #fragment eingefügt", () => {
	assert.equal(
		buildInvitationUrl("https://baseurl.com/page#umfrage", JWT, ORIGIN),
		`https://baseurl.com/page?token=${JWT}#umfrage`
	);
	assert.equal(
		buildInvitationUrl("https://baseurl.com/page?a=1#umfrage", JWT, ORIGIN),
		`https://baseurl.com/page?a=1&token=${JWT}#umfrage`
	);
});

test("ohne Basis-URL: Polly-Seite /s/<jwt>", () => {
	assert.equal(buildInvitationUrl("", JWT, ORIGIN), `${ORIGIN}/s/${JWT}`);
	assert.equal(buildInvitationUrl(undefined, JWT, ORIGIN), `${ORIGIN}/s/${JWT}`);
	assert.equal(buildInvitationUrl("   ", JWT, `${ORIGIN}/`), `${ORIGIN}/s/${JWT}`);
});

test("Ablaufdatum: Tagesende in lokaler Zeit", () => {
	const exp = expirationFromDate(new Date(2026, 11, 31, 9, 30));
	const date = new Date(exp * 1000);
	assert.equal(date.getFullYear(), 2026);
	assert.equal(date.getMonth(), 11);
	assert.equal(date.getDate(), 31);
	assert.equal(date.getHours(), 23);
	assert.equal(date.getMinutes(), 59);
	assert.equal(date.getSeconds(), 59);
	assert.match(formatInvitationExpiration(exp), /^2026-12-31T23:59:59[+-]\d{2}:\d{2}$/);
	assert.equal(formatInvitationExpiration(undefined), "");
});

test("CSV mit BOM, Kopfzeile, CRLF und leerem Expiration ohne exp", () => {
	const exp = expirationFromDate(new Date(2026, 11, 31));
	const csv = buildInvitationCsv([
		{ exp, multi: false, url: `${ORIGIN}/s/${JWT}` },
		{ multi: true, url: `${ORIGIN}/s/${JWT}` }
	]);
	assert.ok(csv.startsWith("\uFEFF"));
	const lines = csv.slice(1).split("\r\n");
	assert.equal(lines[0], INVITATION_CSV_HEADER);
	assert.equal(lines[0], "Expiration;Multi use;Complete URL");
	assert.equal(lines[1], `${formatInvitationExpiration(exp)};false;${ORIGIN}/s/${JWT}`);
	assert.equal(lines[2], `;true;${ORIGIN}/s/${JWT}`);
	assert.equal(lines[3], "");
	assert.equal(lines.length, 4);
});

test("CSV: Escape und Formelschutz in der URL", () => {
	const csv = buildInvitationCsv([
		{ multi: false, url: 'https://x.com/a;b?q="1"' },
		{ multi: false, url: "=HYPERLINK(\"https://evil\")" }
	]);
	const lines = csv.slice(1).split("\r\n");
	assert.equal(lines[1], ';false;"https://x.com/a;b?q=""1"""');
	assert.equal(lines[2], ';false;"\'=HYPERLINK(""https://evil"")"');
});

test("CSV ohne Zeilen enthält nur die Kopfzeile", () => {
	assert.equal(buildInvitationCsv([]), `\uFEFF${INVITATION_CSV_HEADER}\r\n`);
});

console.log(`\n${passed} Tests bestanden`);
