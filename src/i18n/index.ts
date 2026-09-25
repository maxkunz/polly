import { createI18n } from "vue-i18n";
import { de, type MessageSchema } from "./locales/de";
import { en } from "./locales/en";
import { primevueDe } from "./primevue/de";
import { primevueEn } from "./primevue/en";

export type SupportedLocale = "de" | "en";

const STORAGE_KEY = "app.locale";
const localeTags: Record<SupportedLocale, string> = {
	de: "de-DE",
	en: "en-US"
};
const primevueLocales: Record<SupportedLocale, typeof primevueDe> = {
	de: primevueDe,
	en: primevueEn
};

function loadInitialLocale(): SupportedLocale {
	try {
		if (typeof window === "undefined" || !window.localStorage) return "de";
		const stored = window.localStorage.getItem(STORAGE_KEY);
		return stored === "en" ? "en" : "de";
	} catch {
		return "de";
	}
}

export const initialLocale = loadInitialLocale();

export const i18n = createI18n({
	legacy: false,
	locale: initialLocale,
	fallbackLocale: "de",
	messages: { de, en }
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

	try {
		if (typeof window !== "undefined" && window.localStorage) {
			window.localStorage.setItem(STORAGE_KEY, locale);
		}
	} catch {
		// localStorage nicht verfügbar - Sprache bleibt für diese Session aktiv
	}
}

declare module "vue-i18n" {
	export interface DefineLocaleMessage extends MessageSchema {}
}
