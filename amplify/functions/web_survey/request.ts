import { isFlowAnswers, type FlowAnswers } from "../../../src/domain/survey/flowNavigation";
import { readRequestBody as readBody, type BodyResult } from "../shared/http";

/**
 * Prüfung der Requests an die öffentliche Lambda `web_survey` (rein, ohne AWS; siehe
 * `test/webSurveyBackend.test.ts`). Format: `documentation/polly_web.md`.
 */

/** Größter akzeptierter Body von `POST /web-survey/submit` (Bytes, nach Base64-Dekodierung). */
export const WEB_SURVEY_MAX_BODY_BYTES = 64 * 1024;

/** Größte akzeptierte Länge eines Tokens (Zeichen); echte Einladungen sind rund 300 Zeichen lang. */
export const WEB_SURVEY_MAX_TOKEN_CHARS = 2048;

/** Body als Text; zu große Bodies werden abgelehnt, bevor sie geparst werden. */
export function readRequestBody(event: { body?: unknown; isBase64Encoded?: boolean }): BodyResult {
  return readBody(event, WEB_SURVEY_MAX_BODY_BYTES);
}

/** Token aus Query oder Body; leer, wenn er fehlt oder offensichtlich kein Token ist. */
export function normalizeToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return token.length > 0 && token.length <= WEB_SURVEY_MAX_TOKEN_CHARS ? token : "";
}

export interface SubmitRequest {
  token: string;
  surveyVersion: number;
  answers: FlowAnswers;
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
  const { token, surveyVersion, answers } = body as Record<string, unknown>;
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return { ok: false, message: "token is required" };
  if (typeof surveyVersion !== "number" || !Number.isInteger(surveyVersion)) {
    return { ok: false, message: "surveyVersion must be an integer" };
  }
  if (!isFlowAnswers(answers)) return { ok: false, message: "answers must be an object" };
  return { ok: true, request: { token: normalizedToken, surveyVersion, answers } };
}
