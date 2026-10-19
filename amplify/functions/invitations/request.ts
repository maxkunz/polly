import { isValidSurveyId } from "../shared/survey_id";

/**
 * Prüfung des Request-Bodys von `POST /invitations` (rein, ohne AWS; siehe `test/webSurveyBackend.test.ts`).
 * Format: `documentation/polly_web.md`.
 */

export const INVITATION_COUNT_MIN = 1;
export const INVITATION_COUNT_MAX = 5000;

export interface InvitationRequest {
  surveyId: string;
  count: number;
  multi: boolean;
  /** Ablaufdatum der Einladung (Epoch-Sekunden, Tagesende beim Ersteller); fehlt = läuft nie ab. */
  exp?: number;
}

export type InvitationRequestResult =
  | { ok: true; request: InvitationRequest }
  | { ok: false; message: string };

export function parseInvitationRequest(body: unknown, nowSeconds: number): InvitationRequestResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object" };
  }
  const { surveyId, count, multi, exp } = body as Record<string, unknown>;

  if (!isValidSurveyId(surveyId)) {
    return { ok: false, message: "surveyId must be a valid UUID" };
  }
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < INVITATION_COUNT_MIN ||
    count > INVITATION_COUNT_MAX
  ) {
    return { ok: false, message: `count must be an integer between ${INVITATION_COUNT_MIN} and ${INVITATION_COUNT_MAX}` };
  }
  if (typeof multi !== "boolean") {
    return { ok: false, message: "multi must be a boolean" };
  }
  if (exp !== undefined && exp !== null) {
    if (typeof exp !== "number" || !Number.isSafeInteger(exp) || exp < 0) {
      return { ok: false, message: "exp must be epoch seconds" };
    }
    if (exp <= nowSeconds) {
      return { ok: false, message: "exp must be in the future" };
    }
    return { ok: true, request: { surveyId, count, multi, exp } };
  }
  return { ok: true, request: { surveyId, count, multi } };
}
