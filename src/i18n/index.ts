import { createI18n } from "vue-i18n";
import { de, type MessageSchema } from "./locales/de";
import { en } from "./locales/en";
import { fr } from "./locales/fr";
import { tlh } from "./locales/tlh";
import { primevueDe } from "./primevue/de";
import { primevueEn } from "./primevue/en";
import { primevueFr } from "./primevue/fr";
import { primevueTlh } from "./primevue/tlh";

/** Reihenfolge = Reihenfolge in der Sprachauswahl. tlh (Klingonisch) dient als Testsprache. */
export const SUPPORTED_LOCALES = ["de", "en", "fr", "tlh"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Nur in der Dev-Ansicht wählbar. Werden nicht gespeichert: devView ist nach jedem Laden aus,
 * sonst bliebe ein Nutzer ohne sichtbare Auswahl in der Testsprache hängen.
 */
const DEV_ONLY_LOCALES: readonly SupportedLocale[] = ["tlh"];

export function isDevOnlyLocale(locale: string): boolean {
	return DEV_ONLY_LOCALES.includes(locale as SupportedLocale);
}

const STORAGE_KEY = "app.locale";
// Für Zahlen- und Datumsformate; "tlh" kennt Intl nicht und fällt auf die Browsersprache zurück
const localeTags: Record<SupportedLocale, string> = {
	de: "de-DE",
	en: "en-US",
	fr: "fr-FR",
	tlh: "tlh"
};
const primevueLocales: Record<SupportedLocale, typeof primevueDe> = {
	de: primevueDe,
	en: primevueEn,
	fr: primevueFr,
	tlh: primevueTlh
};

function isSupportedLocale(value: unknown): value is SupportedLocale {
	return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

function loadInitialLocale(): SupportedLocale {
	try {
		if (typeof window === "undefined" || !window.localStorage) return "de";
		const stored = window.localStorage.getItem(STORAGE_KEY);
		return isSupportedLocale(stored) && !isDevOnlyLocale(stored) ? stored : "de";
	} catch {
		return "de";
	}
}

export const initialLocale = loadInitialLocale();

export const i18n = createI18n({
	legacy: false,
	locale: initialLocale,
	fallbackLocale: "de",
	messages: { de, en, fr, tlh }
});

export function primevueLocaleFor(locale: SupportedLocale) {
	return primevueLocales[locale];
}

export function currentLocaleTag(): string {
	return localeTags[i18n.global.locale.value as SupportedLocale] ?? "de-DE";
}

export function setLocale(locale: SupportedLocale): void {
	(i18n.global.locale as any).value = locale;

	if (typeof document !== "undefined") {
		document.documentElement.lang = locale;
	}

	if (isDevOnlyLocale(locale)) return;
	try {
		if (typeof window !== "undefined" && window.localStorage) {
			window.localStorage.setItem(STORAGE_KEY, locale);
		}
	} catch {
		// localStorage nicht verfügbar - Sprache bleibt für diese Session aktiv
	}
}

/** Zurück zur zuletzt gespeicherten Sprache, z. B. beim Verlassen der Dev-Ansicht aus einer Testsprache. */
export function restoreStoredLocale(): void {
	setLocale(loadInitialLocale());
}

declare module "vue-i18n" {
	export interface DefineLocaleMessage extends MessageSchema {}
}
