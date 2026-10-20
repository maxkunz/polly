import assert from "node:assert/strict";
import {
	DEFAULT_WEB_THEME_TOKENS,
	FONT_STACKS,
	WEB_TEXT_ROLES,
	WEB_TEXT_SIZE_LIMITS,
	checkThemeContrast,
	contrastRatio,
	defaultWebThemeTokens,
	parsePreviewMessage,
	parseWebTheme,
	sanitizeWebThemeTokens,
	toCssVariables
} from "../src/domain/webTheme/webTheme";
import type { WebThemeTokens } from "../src/domain/webTheme/webTheme";

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

function withColors(colors: Partial<WebThemeTokens["colors"]>): WebThemeTokens {
	const tokens = defaultWebThemeTokens();
	tokens.colors = { ...tokens.colors, ...colors };
	return tokens;
}

test("sanitize: Defaults bleiben unverändert gültig", () => {
	assert.deepEqual(sanitizeWebThemeTokens(DEFAULT_WEB_THEME_TOKENS), DEFAULT_WEB_THEME_TOKENS);
});

test("sanitize: leeres Objekt wird mit Defaults aufgefüllt", () => {
	assert.deepEqual(sanitizeWebThemeTokens({}), DEFAULT_WEB_THEME_TOKENS);
});

test("sanitize: kein Objekt ist ungültig", () => {
	for (const input of [null, undefined, "x", 42, [], true]) {
		assert.equal(sanitizeWebThemeTokens(input), null);
	}
});

test("sanitize: Teil-Design wird aufgefüllt (fehlende Rollen, Felder und Farben)", () => {
	const result = sanitizeWebThemeTokens({
		fontFamily: "serif",
		text: { heading: { size: 40 }, hint: { weight: 500, lineHeight: 1.8 } },
		colors: { primary: "#AA0000" }
	});
	assert.ok(result);
	assert.equal(result.fontFamily, "serif");
	assert.deepEqual(result.text.heading, { size: 40, weight: 700, lineHeight: 1.25 });
	assert.deepEqual(result.text.hint, { size: 14, weight: 500, lineHeight: 1.8 });
	assert.deepEqual(result.text.body, DEFAULT_WEB_THEME_TOKENS.text.body);
	assert.equal(result.colors.primary, "#aa0000", "Farben klein geschrieben");
	assert.equal(result.colors.text, DEFAULT_WEB_THEME_TOKENS.colors.text);
	assert.equal(result.transparentBackground, false);
});

test("sanitize: unbekannte Felder und Rollen werden verworfen", () => {
	const result = sanitizeWebThemeTokens({
		css: "body { display: none }",
		text: { footer: { size: 99 }, body: { size: 18, color: "red" } },
		colors: { link: "url(https://evil.example)" }
	});
	assert.ok(result);
	assert.deepEqual(Object.keys(result).sort(), ["colors", "fontFamily", "schemaVersion", "text", "transparentBackground"]);
	assert.deepEqual(Object.keys(result.text), [...WEB_TEXT_ROLES]);
	assert.deepEqual(result.text.body, { size: 18, weight: 400, lineHeight: 1.5 });
	assert.equal("link" in result.colors, false);
});

test("sanitize: Farben nur als #rrggbb", () => {
	for (const value of [
		"url(https://evil.example/x.png)",
		"#fff",
		"#ffffff;",
		"#ffffff; background: url(x)",
		"expression(alert(1))",
		"red",
		"rgb(0,0,0)",
		" #ffffff",
		"#gggggg",
		123
	]) {
		assert.equal(sanitizeWebThemeTokens({ colors: { text: value } }), null, String(value));
	}
});

test("sanitize: Grenzen der Schriftgröße pro Rolle", () => {
	for (const role of WEB_TEXT_ROLES) {
		const { min, max } = WEB_TEXT_SIZE_LIMITS[role];
		assert.ok(sanitizeWebThemeTokens({ text: { [role]: { size: min } } }), `${role} min`);
		assert.ok(sanitizeWebThemeTokens({ text: { [role]: { size: max } } }), `${role} max`);
		assert.equal(sanitizeWebThemeTokens({ text: { [role]: { size: min - 1 } } }), null, `${role} < min`);
		assert.equal(sanitizeWebThemeTokens({ text: { [role]: { size: max + 1 } } }), null, `${role} > max`);
	}
	assert.equal(sanitizeWebThemeTokens({ text: { body: { size: 16.5 } } }), null, "nur ganze px");
	assert.equal(sanitizeWebThemeTokens({ text: { body: { size: "16" } } }), null, "keine Strings");
	assert.equal(sanitizeWebThemeTokens({ text: { body: { size: Number.NaN } } }), null);
});

test("sanitize: Stärke und Zeilenhöhe", () => {
	assert.equal(sanitizeWebThemeTokens({ text: { body: { weight: 800 } } }), null);
	assert.equal(sanitizeWebThemeTokens({ text: { body: { weight: "bold" } } }), null);
	assert.ok(sanitizeWebThemeTokens({ text: { body: { lineHeight: 1 } } }));
	assert.ok(sanitizeWebThemeTokens({ text: { body: { lineHeight: 2 } } }));
	assert.ok(sanitizeWebThemeTokens({ text: { body: { lineHeight: 1.15 } } }));
	assert.equal(sanitizeWebThemeTokens({ text: { body: { lineHeight: 0.9 } } }), null);
	assert.equal(sanitizeWebThemeTokens({ text: { body: { lineHeight: 2.1 } } }), null);
	assert.equal(sanitizeWebThemeTokens({ text: { body: { lineHeight: 1.234 } } }), null, "höchstens zwei Stellen");
	assert.equal(sanitizeWebThemeTokens({ text: { body: { lineHeight: Infinity } } }), null);
});

test("sanitize: Schrift, schemaVersion, Hintergrund und falsche Typen", () => {
	assert.equal(sanitizeWebThemeTokens({ fontFamily: "Comic Sans" }), null);
	assert.equal(sanitizeWebThemeTokens({ fontFamily: "toString" }), null);
	assert.equal(sanitizeWebThemeTokens({ schemaVersion: 2 }), null);
	assert.equal(sanitizeWebThemeTokens({ transparentBackground: "true" }), null);
	assert.equal(sanitizeWebThemeTokens({ transparentBackground: true })?.transparentBackground, true);
	assert.equal(sanitizeWebThemeTokens({ text: [] }), null);
	assert.equal(sanitizeWebThemeTokens({ text: { body: "16px" } }), null);
	assert.equal(sanitizeWebThemeTokens({ colors: "red" }), null);
});

test("sanitize: Ergebnis teilt keine Objekte mit den Defaults", () => {
	const result = sanitizeWebThemeTokens({});
	assert.ok(result);
	result.text.body.size = 20;
	result.colors.text = "#000000";
	assert.equal(DEFAULT_WEB_THEME_TOKENS.text.body.size, 16);
	assert.equal(DEFAULT_WEB_THEME_TOKENS.colors.text, "#0f172a");
});

test("defaultWebThemeTokens: tiefe Kopie", () => {
	const copy = defaultWebThemeTokens();
	assert.deepEqual(copy, DEFAULT_WEB_THEME_TOKENS);
	copy.text.heading.size = 30;
	copy.colors.primary = "#000000";
	assert.equal(DEFAULT_WEB_THEME_TOKENS.text.heading.size, 28);
	assert.equal(DEFAULT_WEB_THEME_TOKENS.colors.primary, "#14387f");
});

test("contrastRatio: bekannte Paare", () => {
	assert.equal(Number(contrastRatio("#000000", "#ffffff").toFixed(2)), 21);
	assert.equal(Number(contrastRatio("#ffffff", "#000000").toFixed(2)), 21, "symmetrisch");
	assert.equal(Number(contrastRatio("#767676", "#ffffff").toFixed(2)), 4.54);
	assert.equal(contrastRatio("#14387f", "#14387f"), 1);
});

test("checkThemeContrast: Default-Design ohne Warnung", () => {
	assert.deepEqual(checkThemeContrast(DEFAULT_WEB_THEME_TOKENS), []);
});

test("checkThemeContrast: Text 4.5:1, Rahmen und Fokus 3:1", () => {
	// #767676 auf Weiß ≈ 4.54:1 → gerade ausreichend
	assert.deepEqual(checkThemeContrast(withColors({ textMuted: "#767676" })), []);
	// #777777 auf Weiß ≈ 4.48:1 → Warnung für Text
	const muted = checkThemeContrast(withColors({ textMuted: "#777777" }));
	assert.equal(muted.length, 1);
	assert.equal(muted[0].foreground, "textMuted");
	assert.equal(muted[0].background, "surface");
	assert.equal(muted[0].minimum, 4.5);
	assert.ok(muted[0].ratio > 4.4 && muted[0].ratio < 4.5);
	// Rahmen: #949494 auf Weiß ≈ 3.03:1 genügt, #999999 ≈ 2.85:1 nicht
	assert.deepEqual(checkThemeContrast(withColors({ border: "#949494" })), []);
	const border = checkThemeContrast(withColors({ border: "#999999" }));
	assert.deepEqual(border.map((warning) => [warning.foreground, warning.minimum]), [["border", 3]]);
	// Button: weißer Text auf hellem Primär
	const button = checkThemeContrast(withColors({ primary: "#f0f0f0" }));
	assert.ok(button.some((warning) => warning.foreground === "onPrimary" && warning.background === "primary"));
	assert.ok(button.some((warning) => warning.foreground === "primary" && warning.background === "background"));
});

test("toCssVariables: px → rem, alle Rollen, Farben, Schrift", () => {
	const variables = toCssVariables(DEFAULT_WEB_THEME_TOKENS);
	assert.equal(variables["--ws-font-family"], FONT_STACKS.system);
	assert.equal(variables["--ws-heading-size"], "1.75rem");
	assert.equal(variables["--ws-heading-weight"], "700");
	assert.equal(variables["--ws-heading-line-height"], "1.25");
	assert.equal(variables["--ws-question-title-size"], "1.0625rem");
	assert.equal(variables["--ws-scale-label-size"], "0.875rem");
	assert.equal(variables["--ws-body-size"], "1rem");
	for (const role of ["heading", "subheading", "body", "question-title", "description", "option", "scale-label", "hint", "error", "button"]) {
		for (const suffix of ["size", "weight", "line-height"]) {
			assert.ok(variables[`--ws-${role}-${suffix}`], `--ws-${role}-${suffix}`);
		}
	}
	assert.equal(variables["--ws-heading-color"], "#0f172a");
	assert.equal(variables["--ws-on-primary"], "#ffffff");
	assert.equal(variables["--ws-text-muted"], "#334155");
	assert.equal(variables["--ws-page-background"], "#f8fafc");
	assert.equal(Object.keys(variables).length, 1 + WEB_TEXT_ROLES.length * 3 + 9 + 1);
	assert.ok(Object.keys(variables).every((name) => name.startsWith("--ws-")));
	const odd = sanitizeWebThemeTokens({ text: { hint: { size: 13 } }, transparentBackground: true });
	assert.ok(odd);
	const oddVariables = toCssVariables(odd);
	assert.equal(oddVariables["--ws-hint-size"], "0.8125rem");
	assert.equal(oddVariables["--ws-page-background"], "transparent");
});

test("parseWebTheme: gespeichertes Design prüfen und auffüllen", () => {
	const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
	const theme = parseWebTheme({ id, name: "CI", isDefault: true, tokens: { fontFamily: "serif" }, updatedAt: "t", updatedBy: "Anna", extra: 1 });
	assert.ok(theme);
	assert.deepEqual(Object.keys(theme).sort(), ["id", "isDefault", "name", "tokens", "updatedAt", "updatedBy"]);
	assert.equal(theme.tokens.fontFamily, "serif");
	assert.deepEqual(theme.tokens.colors, DEFAULT_WEB_THEME_TOKENS.colors);
	assert.equal(parseWebTheme({ id, name: "CI", tokens: {} })?.isDefault, false);
	assert.equal(parseWebTheme({ id, name: "CI", tokens: {} })?.updatedAt, "");
	assert.equal("updatedBy" in (parseWebTheme({ id, name: "CI", tokens: {}, updatedBy: "" }) ?? {}), false);
	assert.equal(parseWebTheme({ id: "x", name: "CI", tokens: {} }), null);
	assert.equal(parseWebTheme({ id, name: 1, tokens: {} }), null);
	assert.equal(parseWebTheme({ id, name: "CI", tokens: { fontFamily: "Comic Sans" } }), null);
	assert.equal(parseWebTheme(null), null);
});

test("parsePreviewMessage: Design und Hervorhebung, alles andere verworfen", () => {
	assert.deepEqual(parsePreviewMessage({ type: "polly:theme", tokens: {} }), { type: "polly:theme", tokens: DEFAULT_WEB_THEME_TOKENS });
	assert.equal(parsePreviewMessage({ type: "polly:theme", tokens: { colors: { text: "url(x)" } } }), null);
	assert.equal(parsePreviewMessage({ type: "polly:theme" }), null);
	assert.deepEqual(parsePreviewMessage({ type: "polly:highlight", role: "option" }), { type: "polly:highlight", role: "option" });
	assert.deepEqual(parsePreviewMessage({ type: "polly:highlight", role: null }), { type: "polly:highlight", role: null });
	assert.equal(parsePreviewMessage({ type: "polly:highlight", role: "footer" }), null);
	assert.equal(parsePreviewMessage({ type: "polly:height", height: 100 }), null);
	assert.equal(parsePreviewMessage("polly:theme"), null);
	assert.equal(parsePreviewMessage(null), null);
});

console.log(`\n${passed} Tests bestanden`);
