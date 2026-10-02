/**
 * Reine CSV-Hilfsfunktionen für den Survey-Response-Export (keine AWS-Abhängigkeiten).
 * Format: siehe documentation/survey_responses_csv_export.md
 */

export const CSV_SEPARATOR = ";";
export const CSV_HEADER = [
  "responseId",
  "Survey Name",
  "Survey-Version",
  "QuestionId",
  "Type",
  "answeredAt",
  "value",
  "status",
].join(CSV_SEPARATOR);

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
  answers?: Record<string, ExportAnswer>;
}

/**
 * Schützt vor Formel-Injection in Excel: Strings, die mit =, +, -, @, Tab oder CR beginnen,
 * bekommen ein Hochkomma vorangestellt.
 */
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Quotet ein Feld nach RFC 4180, wenn es Trennzeichen, Anführungszeichen oder Zeilenumbrüche enthält. */
export function escapeCsvField(text: string): string {
  if (/[;"\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Formatiert den Antwortwert. boolean/number bleiben unverändert (kein Formel-Schutz für negative Zahlen). */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return escapeCsvField(String(value));
  return escapeCsvField(neutralizeFormula(String(value)));
}

function formatText(value: unknown): string {
  if (value === null || value === undefined) return "";
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
      formatText(session.responseId),
      formatText(session.surveyName),
      session.surveyVersion === undefined || session.surveyVersion === null
        ? ""
        : String(session.surveyVersion),
      formatText(questionName),
      formatText(answer.type),
      formatText(answer.answeredAt),
      formatValue(answer.value),
      formatText(session.status),
    ].join(CSV_SEPARATOR),
  );
}
