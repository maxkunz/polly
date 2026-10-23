/**
 * Internes Modell der Antworten: eine Sitzung ergibt einen Datensatz pro Antwort.
 * Gemeinsame Grundlage für den CSV-Export und die Kunden-API (kennt keine Feldnamen einer API-Version).
 */

/** Kanal von Sitzungen ohne Feld `channel` (Architect Flow, auch alle Antworten vor dem Web-Kanal). */
export const DEFAULT_CHANNEL = "flow";

export interface ExportAnswer {
  type?: string;
  value?: unknown;
  answeredAt?: string;
}

export interface ExportSession {
  responseId: string;
  surveyId?: string;
  surveyName?: string;
  surveyVersion?: number;
  status?: string;
  /** `web` (Web-Umfrage) oder fehlend (Architect Flow). */
  channel?: string;
  /** Start der Sitzung (ISO, Millisekunden). */
  startedAt?: string;
  answers?: Record<string, ExportAnswer>;
}

export interface AnswerRecord {
  responseId: string;
  /** Nur bei Kanal `flow` gesetzt (dort ist die responseId die Conversation-ID), sonst `null`. */
  conversationId: string | null;
  surveyId?: string;
  surveyName?: string;
  surveyVersion?: number;
  questionId: string;
  questionType?: string;
  answeredAt?: string;
  value: unknown;
  status?: string;
  channel: string;
  sessionStartedAt?: string;
}

/** Eine Sitzung ergibt einen Datensatz pro Antwort, aufsteigend nach answeredAt. Ohne Antworten: keine Datensätze. */
export function sessionToAnswerRecords(session: ExportSession): AnswerRecord[] {
  const answers = Object.entries(session.answers ?? {});
  answers.sort(([keyA, a], [keyB, b]) => {
    const byTime = (a.answeredAt ?? "").localeCompare(b.answeredAt ?? "");
    return byTime !== 0 ? byTime : keyA.localeCompare(keyB);
  });

  const channel = session.channel || DEFAULT_CHANNEL;
  return answers.map(([questionId, answer]) => ({
    responseId: session.responseId,
    conversationId: channel === DEFAULT_CHANNEL ? session.responseId : null,
    surveyId: session.surveyId,
    surveyName: session.surveyName,
    surveyVersion: session.surveyVersion,
    questionId,
    questionType: answer.type,
    answeredAt: answer.answeredAt,
    value: answer.value,
    status: session.status,
    channel,
    sessionStartedAt: session.startedAt,
  }));
}

/**
 * Feste Reihenfolge über Sitzungen hinweg (Seitenaufteilung der Kunden-API): der GSI garantiert bei gleichem
 * Schlüssel keine Reihenfolge, deshalb im Speicher nach Sitzungsstart, responseId, answeredAt, questionId.
 */
export function compareAnswerRecords(a: AnswerRecord, b: AnswerRecord): number {
  return (
    compareCodeUnits(a.sessionStartedAt ?? "", b.sessionStartedAt ?? "") ||
    compareCodeUnits(a.responseId, b.responseId) ||
    compareCodeUnits(a.answeredAt ?? "", b.answeredAt ?? "") ||
    compareCodeUnits(a.questionId, b.questionId)
  );
}

// Ohne Collation (localeCompare): schneller bei vielen Datensätzen und unabhängig von der ICU-Version
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
