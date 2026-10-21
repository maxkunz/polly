import assert from "node:assert/strict";
import {
	FEATURE_FLAGS,
	defaultSetupFeatures,
	enabledFeatures,
	isFeatureEnabled,
	normalizeFeatures
} from "../src/domain/features/featureFlags";
import { Meta } from "../src/domain/Meta";

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

console.log(`\n${passed} Tests bestanden`);
