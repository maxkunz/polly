import { createApp } from "vue";
import { pickBrowserLanguage } from "@/domain/survey/webSurveyPage";
import WebSurveyApp from "./WebSurveyApp.vue";
import { startFrameHeightReporting } from "./frameHeight";
import { setLanguage } from "./i18n";
import { readPreviewLanguage, startPreviewMode } from "./previewMode";
import "./webSurvey.css";

/**
 * Einstieg der öffentlichen Umfrageseite (`survey.html`). Bewusst ohne Genesys-SDK, Pinia, Router,
 * PrimeVue und `appStore`: Die Seite lädt nur Vue, ihre eigenen Texte und das bereinigte Flow-JSON.
 */

// Bis die Umfrage geladen ist (Laden, Fehlerseiten) gilt die Browsersprache, danach `language` der Umfrage.
setLanguage(pickBrowserLanguage(navigator.languages?.length ? navigator.languages : [navigator.language ?? ""]));

// `?preview=1`: Design-Vorschau der App mit Beispielumfrage, ohne API (siehe previewMode.ts)
const previewLanguage = readPreviewLanguage(window.location.search);

const root = document.getElementById("app");
if (root) {
	createApp(WebSurveyApp, { previewLanguage }).mount(root);
	startFrameHeightReporting(root);
	if (previewLanguage) startPreviewMode();
}
