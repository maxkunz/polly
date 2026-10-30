import assert from "node:assert/strict";
import {
	FEATURE_FLAGS,
	defaultSetupFeatures,
	enabledFeatures,
	isFeatureEnabled,
	normalizeFeatures
} from "../src/domain/features/featureFlags";
import { Meta } from "../src/domain/Meta";
import { de } from "../src/i18n/locales/de";
import { en } from "../src/i18n/locales/en";
import { fr } from "../src/i18n/locales/fr";
import { tlh } from "../src/i18n/locales/tlh";
import { la } from "../src/i18n/locales/la";

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

test("normalizeFeatures behält nur boolesche Werte", () => {
	assert.deepEqual(normalizeFeatures(undefined), {});
	assert.deepEqual(normalizeFeatures("web_survey"), {});
	assert.deepEqual(normalizeFeatures(["web_survey"]), {});
	assert.deepEqual(
		normalizeFeatures({ web_survey: true, future_flag: false, text: "true", one: 1, nil: null }),
		{ web_survey: true, future_flag: false }
	);
});

test("Fehlende oder nicht-boolesche Flags gelten als aus", () => {
	assert.equal(isFeatureEnabled(undefined, "web_survey"), false);
	assert.equal(isFeatureEnabled({}, "web_survey"), false);
	assert.equal(isFeatureEnabled(normalizeFeatures({ web_survey: "true" }), "web_survey"), false);
	assert.equal(isFeatureEnabled({ web_survey: false }, "web_survey"), false);
	assert.equal(isFeatureEnabled({ web_survey: true }, "web_survey"), true);
});

test("enabledFeatures liefert nur bekannte, aktive Flags", () => {
	assert.deepEqual(enabledFeatures({ web_survey: true, unknown_flag: true }), ["web_survey"]);
	assert.deepEqual(enabledFeatures({ web_survey: false }), []);
	assert.deepEqual(enabledFeatures(null), []);
});

test("Vorauswahl im Onboarding enthält jedes Flag der Registry", () => {
	const defaults = defaultSetupFeatures();
	assert.deepEqual(Object.keys(defaults), FEATURE_FLAGS.map(flag => flag.key));
	assert.equal(defaults.web_survey, true);
});

test("Flag mcp ist registriert und im Onboarding standardmäßig aus", () => {
	assert.ok(FEATURE_FLAGS.some(flag => flag.key === "mcp"));
	assert.equal(defaultSetupFeatures().mcp, false);
	assert.equal(isFeatureEnabled({}, "mcp"), false);
	assert.equal(isFeatureEnabled({ mcp: true }, "mcp"), true);
	assert.deepEqual(enabledFeatures({ web_survey: true, mcp: true }), ["web_survey", "mcp"]);
});

test("Jedes Flag hat Texte in allen Locales", () => {
	for (const locale of [de, en, fr, tlh, la] as any[]) {
		for (const flag of FEATURE_FLAGS) {
			assert.ok(locale.features[flag.key]?.label, `label ${flag.key}`);
			assert.ok(locale.features[flag.key]?.description, `description ${flag.key}`);
		}
	}
});

test("Meta liest features und gibt sie mit den übrigen Feldern wieder aus", () => {
	const meta = Meta.fromJSON({ appTitle: "demo", setup: { projectTag: "demo" }, features: { web_survey: true, x: "y" }, other: 1 });
	assert.deepEqual(meta.features, { web_survey: true });
	assert.deepEqual(meta.toJSON(), { other: 1, appTitle: "demo", setup: { projectTag: "demo" }, features: { web_survey: true } });
});

test("Meta ohne features (bestehende Installation) hat keine aktiven Flags", () => {
	const meta = Meta.fromJSON({ appTitle: "demo", setup: null });
	assert.deepEqual(meta.features, {});
	assert.deepEqual(enabledFeatures(meta.features), []);
});

test("Meta normalisiert web.defaultBaseUrl und erhält die übrigen Felder", () => {
	const meta = Meta.fromJSON({ appTitle: "demo", setup: { projectTag: "demo" }, features: { web_survey: true }, web: { defaultBaseUrl: " https://x.de/{token} " }, other: 1 });
	assert.equal(meta.web.defaultBaseUrl, "https://x.de/{token}");
	const json = meta.toJSON() as Record<string, any>;
	assert.equal(json.other, 1);
	assert.deepEqual(json.setup, { projectTag: "demo" });
	assert.deepEqual(json.web, { defaultBaseUrl: "https://x.de/{token}" });
	assert.equal(Meta.fromJSON({}).web.defaultBaseUrl, "");
	assert.equal("web" in Meta.fromJSON({}).toJSON(), false);
	assert.equal(Meta.fromJSON({ web: { defaultBaseUrl: 5 } }).web.defaultBaseUrl, "");
});

console.log(`\n${passed} Tests bestanden`);
