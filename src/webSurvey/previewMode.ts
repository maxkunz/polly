import { SURVEY_LANGUAGES, type SurveyLanguage } from "@/domain/survey/flowTypes";
import {
	WEB_THEME_PREVIEW_READY,
	WEB_THEME_PREVIEW_THEME,
	parsePreviewMessage
} from "@/domain/webTheme/webTheme";
import { applyTheme } from "./applyTheme";

/**
 * Vorschaumodus der Umfrageseite für den Design-Editor der App (`survey.html?preview=1&lang=de`):
 * Die Seite zeigt eine feste Beispielumfrage (`previewSurvey.ts`), ruft keine API auf und übernimmt
 * Design und Hervorhebung per `postMessage` (Protokoll in `domain/webTheme/webTheme.ts`). Angenommen
 * wird nur vom eigenen Origin und vom einbettenden Fenster; danach prüft `parsePreviewMessage` die Tokens.
 */

/** Sprache der Vorschau, wenn `?preview=1` gesetzt ist, sonst `null` (normale Umfrageseite). */
export function readPreviewLanguage(search: string): SurveyLanguage | null {
	const params = new URLSearchParams(search);
	if (params.get("preview") !== "1") return null;
	const language = params.get("lang");
	return (SURVEY_LANGUAGES as readonly string[]).includes(language ?? "") ? (language as SurveyLanguage) : "de";
}

export function startPreviewMode(): void {
	if (window.parent === window) return;
	const root = document.documentElement;

	window.addEventListener("message", (event: MessageEvent) => {
		if (event.origin !== window.location.origin || event.source !== window.parent) return;
		const message = parsePreviewMessage(event.data);
		if (!message) return;
		if (message.type === WEB_THEME_PREVIEW_THEME) {
			applyTheme(message.tokens, root);
		} else if (message.role) {
			root.dataset.wsHighlight = message.role;
		} else {
			delete root.dataset.wsHighlight;
		}
	});

	window.parent.postMessage({ type: WEB_THEME_PREVIEW_READY }, window.location.origin);
}
