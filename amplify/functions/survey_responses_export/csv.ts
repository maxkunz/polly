/**
 * Reine CSV-Hilfsfunktionen für den Survey-Response-Export (keine AWS-Abhängigkeiten).
 * Format: siehe documentation/survey_responses_csv_export.md
 */

import { CSV_SEPARATOR, escapeCsvField, formatCsvText, neutralizeFormula } from "../../../src/utils/csv";
import {
  DEFAULT_CHANNEL,
  sessionToAnswerRecords,
  type ExportAnswer,
  type ExportSession,
} from "../shared/answer_records";

// Escape und Formelschutz liegen in src/utils/csv.ts (auch für die CSV der Einladungslinks)
export { CSV_SEPARATOR, escapeCsvField, neutralizeFormula };

export const CSV_HEADER = [
  "responseId",
  "Survey Name",
  "Survey-Version",
  "QuestionId",
  "Type",
  "answeredAt",
  "value",
  "status",
  "Channel",
].join(CSV_SEPARATOR);

// Typen und Standardkanal liegen in shared/answer_records.ts (auch für die Kunden-API)
export { DEFAULT_CHANNEL };
export type { ExportAnswer, ExportSession };

/** Formatiert den Antwortwert. boolean/number bleiben unverändert (kein Formel-Schutz für negative Zahlen). */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return escapeCsvField(String(value));
  return escapeCsvField(neutralizeFormula(String(value)));
}

/** Eine Session ergibt eine CSV-Zeile pro Antwort, aufsteigend nach answeredAt. Ohne Antworten: keine Zeilen. */
export function sessionToCsvRows(session: ExportSession): string[] {
  return sessionToAnswerRecords(session).map((record) =>
    [
      formatCsvText(record.responseId),
      formatCsvText(record.surveyName),
      String(record.surveyVersion),
      formatCsvText(record.questionId),
      formatCsvText(record.questionType),
      formatCsvText(record.answeredAt),
      formatValue(record.value),
      formatCsvText(record.status),
      formatCsvText(record.channel),
    ].join(CSV_SEPARATOR),
  );
}
