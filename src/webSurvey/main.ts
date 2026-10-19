import { createApp } from "vue";
import { pickBrowserLanguage } from "@/domain/survey/webSurveyPage";
import WebSurveyApp from "./WebSurveyApp.vue";
import { startFrameHeightReporting } from "./frameHeight";
import { setLanguage } from "./i18n";
import "./webSurvey.css";

/**
 * Einstieg der öffentlichen Umfrageseite (`survey.html`). Bewusst ohne Genesys-SDK, Pinia, Router,
 * PrimeVue und `appStore`: Die Seite lädt nur Vue, ihre eigenen Texte und das bereinigte Flow-JSON.
 */

// Bis die Umfrage geladen ist (Laden, Fehlerseiten) gilt die Browsersprache, danach `language` der Umfrage.
setLanguage(pickBrowserLanguage(navigator.languages?.length ? navigator.languages : [navigator.language ?? ""]));

const root = document.getElementById("app");
if (root) {
	createApp(WebSurveyApp).mount(root);
	startFrameHeightReporting(root);
}
