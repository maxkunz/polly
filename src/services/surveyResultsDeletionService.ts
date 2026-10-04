import { apiFetch } from "@/services/pollyApi";

/**
 * Stößt das asynchrone Löschen aller Ergebnisse einer Umfrage im Backend an.
 * Das Backend prüft selbst, dass die Umfrage in der Data Table nicht mehr existiert,
 * und lehnt sonst mit 409 ab. Der Aufruf ist idempotent.
 */
export async function requestSurveyResultsDeletion(surveyId: string, datatableId: string): Promise<void> {
	const params = new URLSearchParams({ surveyId, datatableId });
	await apiFetch(`/survey-responses?${params.toString()}`, { method: "DELETE" });
}
