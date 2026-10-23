import type { AnswerRecord } from "../shared/answer_records";
import { isValidSurveyId } from "../shared/survey_id";
import type { PageInfo } from "./pagination";

/**
 * Versionsschicht v1 von `GET /ext/v1/reporting/data`: Request-Prüfung und feste Feldabbildung.
 * Rein (ohne AWS-SDK). Das interne Modell wird nie durchgereicht, siehe `toV1Record`.
 */

export const MAX_LIMIT = 1000;
export const DEFAULT_LIMIT = 1000;
/** Größter erlaubter Zeitraum (`to − from`). */
export const MAX_RANGE_MS = 24 * 60 * 60 * 1000;
/** Mehr Sitzungen im Zeitraum werden nicht im Speicher aufgebaut (413). */
export const MAX_SESSIONS = 10000;
/** Lambda-Antworten hinter API Gateway sind auf 6 MB begrenzt; darüber 413 mit Hinweis auf ein kleineres `limit`. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** `YYYY-MM-DDTHH:mm:ss`, UTC, ohne `Z` und ohne Millisekunden. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export interface V1DataParams {
  surveyId: string;
  /** Inklusive Untergrenze für `surveyStartedAt` (ISO mit Millisekunden). */
  fromIso: string;
  /** Inklusive Obergrenze für `BETWEEN`: `to − 1 ms`, weil `to` exklusiv ist. */
  toIso: string;
  version?: number;
  page: number;
  limit: number;
}

export type V1ParamsResult = { ok: true; params: V1DataParams } | { ok: false; message: string };

function parseDate(raw: unknown, name: string): { ms: number } | { message: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { message: `${name} query parameter is required` };
  const ms = DATE_PATTERN.test(text) ? Date.parse(`${text}.000Z`) : Number.NaN;
  // Date.parse rollt unmögliche Daten weiter (31.02. → 03.03., 24:00:00 → nächster Tag): Rückumwandlung muss gleich sein
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 19) !== text) {
    return { message: `${name} must have the format YYYY-MM-DDTHH:mm:ss (UTC, without Z)` };
  }
  return { ms };
}

function parseInteger(raw: unknown, name: string, positive: boolean): number | { message: string } {
  const text = String(raw).trim();
  const value = Number(text);
  if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(value) || (positive && value < 1)) {
    return { message: positive ? `${name} must be a positive integer` : `${name} must be an integer` };
  }
  return value;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && String(value).trim() !== "";
}

export function parseV1DataParams(query: Record<string, unknown> | null | undefined): V1ParamsResult {
  const q = query ?? {};

  const surveyId = typeof q.surveyId === "string" ? q.surveyId.trim() : "";
  if (!surveyId) return { ok: false, message: "surveyId query parameter is required" };
  if (!isValidSurveyId(surveyId)) return { ok: false, message: "surveyId must be a UUID" };

  const from = parseDate(q.from, "from");
  if ("message" in from) return { ok: false, message: from.message };
  const to = parseDate(q.to, "to");
  if ("message" in to) return { ok: false, message: to.message };
  if (to.ms <= from.ms) return { ok: false, message: "to must be after from" };
  if (to.ms - from.ms > MAX_RANGE_MS) return { ok: false, message: "The range between from and to must not exceed 24 hours" };

  let version: number | undefined;
  if (isPresent(q.version)) {
    const parsed = parseInteger(q.version, "version", false);
    if (typeof parsed !== "number") return { ok: false, message: parsed.message };
    version = parsed;
  }

  let page = 1;
  if (isPresent(q.page)) {
    const parsed = parseInteger(q.page, "page", true);
    if (typeof parsed !== "number") return { ok: false, message: parsed.message };
    page = parsed;
  }

  let limit = DEFAULT_LIMIT;
  if (isPresent(q.limit)) {
    const parsed = parseInteger(q.limit, "limit", true);
    if (typeof parsed !== "number") return { ok: false, message: parsed.message };
    limit = Math.min(parsed, MAX_LIMIT);
  }

  return {
    ok: true,
    params: {
      surveyId,
      fromIso: new Date(from.ms).toISOString(),
      toIso: new Date(to.ms - 1).toISOString(),
      version,
      page,
      limit,
    },
  };
}

/** Ein Datensatz in v1. Alle Felder einzeln, damit neue interne Felder nicht ungewollt erscheinen. */
export function toV1Record(record: AnswerRecord) {
  return {
    responseId: record.responseId,
    conversationId: record.conversationId,
    surveyId: record.surveyId,
    surveyName: record.surveyName,
    surveyVersion: record.surveyVersion,
    questionId: record.questionId,
    questionType: record.questionType,
    answeredAt: record.answeredAt,
    value: record.value,
    status: record.status,
    channel: record.channel,
    sessionStartedAt: record.sessionStartedAt,
  };
}

export function buildV1DataResponse(records: AnswerRecord[], pageInfo: PageInfo) {
  return {
    data: records.map(toV1Record),
    pagination: {
      page: pageInfo.page,
      limit: pageInfo.limit,
      total: pageInfo.total,
      totalPages: pageInfo.totalPages,
      hasPreviousPage: pageInfo.hasPreviousPage,
      hasNextPage: pageInfo.hasNextPage,
    },
  };
}
