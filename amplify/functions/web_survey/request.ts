import { isFlowAnswers, type FlowAnswers } from "../../../src/domain/survey/flowNavigation";
import { WEB_SURVEY_MAX_TOKEN_CHARS } from "../../../src/domain/survey/webSurveyPage";
import { readRequestBody as readBody, type BodyResult } from "../shared/http";

/**
 * Prüfung der Requests an die öffentliche Lambda `web_survey` (rein, ohne AWS; siehe
 * `test/webSurveyBackend.test.ts`). Format: `documentation/polly_web.md`.
 */

/** Größter akzeptierter Body von `POST /web-survey/submit` (Bytes, nach Base64-Dekodierung). */
export const WEB_SURVEY_MAX_BODY_BYTES = 64 * 1024;

/** Body als Text; zu große Bodies werden abgelehnt, bevor sie geparst werden. */
export function readRequestBody(event: { body?: unknown; isBase64Encoded?: boolean }): BodyResult {
  return readBody(event, WEB_SURVEY_MAX_BODY_BYTES);
}

/** Token aus Query oder Body; leer, wenn er fehlt oder offensichtlich kein Token ist (Längengrenze gemeinsam mit der Umfrageseite). */
export function normalizeToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return token.length > 0 && token.length <= WEB_SURVEY_MAX_TOKEN_CHARS ? token : "";
}

/** UUID (Version egal), Groß-/Kleinschreibung egal; wird klein geschrieben gespeichert. */
const SUBMISSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SubmitRequest {
  token: string;
  surveyVersion: number;
  answers: FlowAnswers;
  /** Von der Seite erzeugt, bleibt bei Wiederholungen gleich und wird `responseId` (Idempotenz). Fehlt sie, vergibt die Lambda eine. */
  submissionId?: string;
}

export type SubmitRequestResult = { ok: true; request: SubmitRequest } | { ok: false; message: string };

export function parseSubmitRequest(text: string): SubmitRequestResult {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, message: "Invalid JSON body" };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object" };
  }
  const { token, surveyVersion, answers, submissionId } = body as Record<string, unknown>;
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return { ok: false, message: "token is required" };
  if (typeof surveyVersion !== "number" || !Number.isInteger(surveyVersion)) {
    return { ok: false, message: "surveyVersion must be an integer" };
  }
  if (!isFlowAnswers(answers)) return { ok: false, message: "answers must be an object" };
  if (submissionId === undefined) return { ok: true, request: { token: normalizedToken, surveyVersion, answers } };
  if (typeof submissionId !== "string" || !SUBMISSION_ID_PATTERN.test(submissionId)) {
    return { ok: false, message: "submissionId must be a UUID" };
  }
  return { ok: true, request: { token: normalizedToken, surveyVersion, answers, submissionId: submissionId.toLowerCase() } };
}
