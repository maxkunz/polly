import { INVITATION_COUNT_MAX, INVITATION_COUNT_MIN } from "../../../src/domain/survey/invitationLinks";
import { isValidSurveyId } from "../shared/survey_id";

/**
 * Prüfung der Request-Bodys von `POST /invitations` und `POST /invitations/preview` (rein, ohne AWS; siehe `test/webSurveyBackend.test.ts`).
 * Format: `documentation/polly_web.md`.
 */

// Grenzen gemeinsam mit der Einladungs-Unterseite der App
export { INVITATION_COUNT_MAX, INVITATION_COUNT_MIN };

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

/** Body von `POST /invitations/preview`: nur die Umfrage; Laufzeit und Mehrfachnutzung setzt der Server. */
export type PreviewRequestResult =
  | { ok: true; surveyId: string }
  | { ok: false; message: string };

export function parsePreviewRequest(body: unknown): PreviewRequestResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object" };
  }
  const { surveyId } = body as Record<string, unknown>;
  if (!isValidSurveyId(surveyId)) {
    return { ok: false, message: "surveyId must be a valid UUID" };
  }
  return { ok: true, surveyId };
}
