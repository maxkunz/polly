/**
 * Aufbau der Data-Table-Zeile `survey_<id>` (siehe documentation/datatablerow_survey_entry.md).
 * Alle Zellen enthalten JSON als String.
 */

export type SurveyRowField = "Draft" | "Stage" | "Prod" | "Backup" | "lock";

/** Nur die zu ändernden Felder einer Zeile */
export type SurveyRowPatch = Partial<Record<SurveyRowField, string>>;

export const EMPTY_SURVEY_LOCK = JSON.stringify({ locked_by: "", locked_since: "" });

export function surveyRowKey(surveyId: string): string {
	return `survey_${surveyId}`;
}

/**
 * Vollständiger Zeilen-Payload aus aktueller Zeile und Änderung. Genesys verlangt beim Schreiben
 * alle Schema-Spalten (fehlende würden geleert) und lehnt zusätzliche Felder ab.
 */
export function buildSurveyRowPayload(
	surveyId: string,
	currentRow: Record<string, any> | null,
	patch: SurveyRowPatch
): Record<string, string> {
	return {
		key: surveyRowKey(surveyId),
		Draft: currentRow?.Draft ?? "{}",
		Stage: currentRow?.Stage ?? "{}",
		Prod: currentRow?.Prod ?? "{}",
		Backup: currentRow?.Backup ?? "{}",
		lock: currentRow?.lock ?? EMPTY_SURVEY_LOCK,
		...patch
	};
}

/**
 * Liest die Versionsnummer aus einem JSON-Feld der Zeile (Draft/Stage/Prod/Backup).
 * Liefert null, wenn das Feld leer oder nicht lesbar ist.
 */
export function readFieldVersion(raw: unknown): number | null {
	if (!raw || raw === "{}") return null;
	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		return typeof parsed?.version === "number" ? parsed.version : null;
	} catch {
		return null;
	}
}
