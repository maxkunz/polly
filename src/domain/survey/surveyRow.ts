import type { Survey } from "./surveyTypes";

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

/** Draft-Zelle als Survey; null, wenn leer oder nicht lesbar. */
export function parseSurveyDraft(raw: unknown): Survey | null {
	if (!raw || raw === "{}") return null;
	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		return parsed && typeof parsed === "object" ? (parsed as Survey) : null;
	} catch {
		return null;
	}
}

/** Umfrage-Index: Zeile `survey_list`, Liste im Feld `Draft`. */
export const SURVEY_LIST_ROW_KEY = "survey_list";

export interface SurveyListItem {
	id: string;
	title: string;
}

/**
 * Index mit Eintrag `item` (vorhandener Eintrag gleicher ID wird ersetzt, sonst angehängt).
 * null, wenn der Eintrag schon genau so in der Liste steht.
 */
export function withSurveyListItem(items: SurveyListItem[], item: SurveyListItem): SurveyListItem[] | null {
	const index = items.findIndex(entry => entry?.id === item.id);
	if (index === -1) return [...items, item];
	if (items[index].title === item.title) return null;
	const updated = [...items];
	updated[index] = { ...items[index], ...item };
	return updated;
}

/** Vollständiger Payload der Zeile `survey_list`; die übrigen Spalten bleiben, wie sie sind. */
export function buildSurveyListPayload(
	items: SurveyListItem[],
	listRow: Record<string, any> | null
): Record<string, string> {
	return {
		key: SURVEY_LIST_ROW_KEY,
		Draft: JSON.stringify(items),
		Prod: listRow?.Prod ?? "{}",
		Stage: listRow?.Stage ?? "{}",
		Backup: listRow?.Backup ?? "{}",
		lock: listRow?.lock ?? EMPTY_SURVEY_LOCK
	};
}
