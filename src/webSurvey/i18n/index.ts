import { ref } from "vue";
import { DEFAULT_SURVEY_LANGUAGE } from "@/domain/survey/flowTypes";
import type { SurveyLanguage } from "@/domain/survey/flowTypes";
import { de, type WebSurveyMessages } from "./de";
import { en } from "./en";
import { fr } from "./fr";

/**
 * Minimaler Übersetzer der Umfrageseite statt vue-i18n: Die Seite hat wenige feste Texte, und das
 * öffentliche Bundle soll klein bleiben und keine Texte zur Laufzeit kompilieren.
 * Platzhalter `{name}`; Texte mit `|` sind „Einzahl | Mehrzahl“, gewählt über den Parameter `count`.
 */

const messages: Record<SurveyLanguage, WebSurveyMessages> = { de, en, fr };

type MessagePath<T, Prefix extends string = ""> = {
	[K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : MessagePath<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type WebSurveyMessageKey = MessagePath<WebSurveyMessages>;

/** Aktuelle Sprache; reaktiv, damit Vorlagen mit `t()` beim Wechsel neu rendern. */
export const language = ref<SurveyLanguage>(DEFAULT_SURVEY_LANGUAGE);

/** Setzt Sprache der Texte und `<html lang>`. */
export function setLanguage(value: SurveyLanguage): void {
	language.value = value;
	document.documentElement.lang = value;
}

function lookup(source: WebSurveyMessages, key: string): string | undefined {
	let node: unknown = source;
	for (const part of key.split(".")) {
		node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined;
	}
	return typeof node === "string" ? node : undefined;
}

export function t(key: WebSurveyMessageKey, params: Record<string, string | number> = {}): string {
	let text = lookup(messages[language.value], key) ?? lookup(de, key) ?? key;
	if (text.includes("|")) {
		const forms = text.split("|").map(form => form.trim());
		text = params.count === 1 ? forms[0] : forms[forms.length - 1];
	}
	return text.replace(/\{(\w+)\}/g, (match, name: string) =>
		Object.hasOwn(params, name) ? String(params[name]) : match);
}
