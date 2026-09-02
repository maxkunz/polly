import type { Survey } from "@/domain/survey/surveyTypes";

/**
 * Wandelt ein Survey-Objekt in das für den Genesys Survey Flow optimierte Format um.
 * 
 * Aktuell: 1:1 Pass-Through (unidirektional/One-Way).
 * Zukünftig: Strukturierte Aufbereitung und Optimierung für die Flow-Ausführung.
 */
export function translateSurveyObject(survey: Survey): Record<string, any> | Survey {
	// 1:1 Pass-Through (Deep Clone um Seiteneffekte zu vermeiden)
	let translatedJson = JSON.parse(JSON.stringify(survey));
	translatedJson.type = 'Flow';
	return translatedJson;
}

/**
 * Übersetzt den Draft-Inhalt (als JSON-String oder Objekt) in den Flow-optimierten JSON-Payload
 * für das Deployment nach Stage und Prod.
 *
 * @param draft JSON-String oder Survey-Objekt aus dem Draft-Feld
 * @returns Serialisierter JSON-String für Data Table Stage / Prod
 */
export function translateSurveyForFlow(
	draft: Survey | string | Record<string, any>
): string {
	if (!draft) {
		return "{}";
	}

	try {
		const surveyObj: Survey =
			typeof draft === "string" ? JSON.parse(draft) : (draft as Survey);

		const translated = translateSurveyObject(surveyObj);
		return JSON.stringify(translated);
	} catch (error) {
		console.warn("Fehler beim Übersetzen des Survey Drafts für Flow-Deployment:", error);
		// Fallback: Falls Parsing fehlschlägt, raw String bzw. Fallback zurückgeben
		return typeof draft === "string" ? draft : JSON.stringify(draft);
	}
}
