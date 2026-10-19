/**
 * Reine CSV-Hilfsfunktionen für den Survey-Response-Export (keine AWS-Abhängigkeiten).
 * Format: siehe documentation/survey_responses_csv_export.md
 */

import { CSV_SEPARATOR, escapeCsvField, formatCsvText, neutralizeFormula } from "../../../src/utils/csv";

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

/** Kanal von Sitzungen ohne Feld `channel` (Architect Flow, auch alle Antworten vor dem Web-Kanal). */
export const DEFAULT_CHANNEL = "flow";

export interface ExportAnswer {
  type?: string;
  value?: unknown;
  answeredAt?: string;
}

export interface ExportSession {
  responseId: string;
  surveyName?: string;
  surveyVersion?: number;
  status?: string;
  /** `web` (Web-Umfrage) oder fehlend (Architect Flow). */
  channel?: string;
  answers?: Record<string, ExportAnswer>;
}

/** Formatiert den Antwortwert. boolean/number bleiben unverändert (kein Formel-Schutz für negative Zahlen). */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return escapeCsvField(String(value));
  return escapeCsvField(neutralizeFormula(String(value)));
}

/** Eine Session ergibt eine CSV-Zeile pro Antwort, aufsteigend nach answeredAt. Ohne Antworten: keine Zeilen. */
export function sessionToCsvRows(session: ExportSession): string[] {
  const answers = Object.entries(session.answers ?? {});
  answers.sort(([keyA, a], [keyB, b]) => {
    const byTime = (a.answeredAt ?? "").localeCompare(b.answeredAt ?? "");
    return byTime !== 0 ? byTime : keyA.localeCompare(keyB);
  });

  return answers.map(([questionName, answer]) =>
    [
      formatCsvText(session.responseId),
      formatCsvText(session.surveyName),
      session.surveyVersion === undefined || session.surveyVersion === null
        ? ""
        : String(session.surveyVersion),
      formatCsvText(questionName),
      formatCsvText(answer.type),
      formatCsvText(answer.answeredAt),
      formatValue(answer.value),
      formatCsvText(session.status),
      formatCsvText(session.channel || DEFAULT_CHANNEL),
    ].join(CSV_SEPARATOR),
  );
}
