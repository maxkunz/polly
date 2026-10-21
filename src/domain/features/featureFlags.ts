/**
 * Feature Flags einer Installation. Gespeichert in der `__meta`-Zeile (Feld `Draft`) als
 * `features: { <key>: true|false }`. Gesetzt werden sie beim Onboarding, danach nur noch
 * direkt in der Data Table. Fehlende oder nicht-boolesche Werte gelten als deaktiviert.
 *
 * Bewusst ohne `@/`-Imports, damit auch Lambdas das Modul bündeln können.
 * Neues Flag: Eintrag in FEATURE_FLAGS und Texte unter `features.<key>` in allen Locales.
 */

export interface FeatureFlagDefinition {
	key: string;
	/** Vorauswahl im Onboarding */
	defaultOnSetup: boolean;
}

export const FEATURE_FLAGS = [
	// Web-Umfragen: Einladungslinks, Web-Designs, Web-Felder im Editor
	{ key: "web_survey", defaultOnSetup: true }
] as const satisfies readonly FeatureFlagDefinition[];

export type FeatureKey = (typeof FEATURE_FLAGS)[number]["key"];

/** Gespeicherte Flags; unbekannte Keys bleiben erhalten (neuere App-Versionen) */
export type FeatureFlags = Record<string, boolean>;

/** Liest `features` aus dem rohen `__meta`-JSON; behält nur boolesche Werte */
export function normalizeFeatures(raw: unknown): FeatureFlags {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const result: FeatureFlags = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof value === "boolean") result[key] = value;
	}
	return result;
}

export function isFeatureEnabled(features: FeatureFlags | null | undefined, key: FeatureKey): boolean {
	return features?.[key] === true;
}

/** Bekannte, aktive Flags in Registry-Reihenfolge (für die Anzeige) */
export function enabledFeatures(features: FeatureFlags | null | undefined): FeatureKey[] {
	return FEATURE_FLAGS.filter(flag => isFeatureEnabled(features, flag.key)).map(flag => flag.key);
}

/** Vorauswahl der Flags im Onboarding */
export function defaultSetupFeatures(): FeatureFlags {
	return Object.fromEntries(FEATURE_FLAGS.map(flag => [flag.key, flag.defaultOnSetup]));
}
