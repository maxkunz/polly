import { checkInvitationFields } from "./request";
import type { InvitationFieldNames, InvitationRequestResult } from "./request";

/**
 * Versionsschicht v1 von `POST /ext/v1/invitations`: Request-Prüfung und feste Feldabbildung.
 * Rein (ohne AWS-SDK). Das interne Modell wird nie durchgereicht, siehe `toV1InviteUrl`.
 */

/** `YYYY-MM-DD` */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Feldnamen der v1 in den Fehlermeldungen. */
const V1_FIELD_NAMES: InvitationFieldNames = {
  surveyId: "survey_uuid",
  count: "amount",
  multi: "is_multi",
  exp: "expiration_date",
};

/** Bildet die v1-Felder auf das interne Modell ab; die fachlichen Regeln prüft `checkInvitationFields`. */
export function parseV1InvitationRequest(body: unknown, nowSeconds: number): InvitationRequestResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object" };
  }
  const { survey_uuid, amount, is_multi, expiration_date } = body as Record<string, unknown>;

  let exp: number | undefined;
  if (expiration_date !== undefined && expiration_date !== null) {
    exp = endOfDayUtcSeconds(expiration_date);
    if (exp === undefined) return { ok: false, message: "expiration_date must have the format YYYY-MM-DD" };
  }
  return checkInvitationFields({ surveyId: survey_uuid, count: amount, multi: is_multi, exp }, nowSeconds, V1_FIELD_NAMES);
}

/** Ende des Tages (23:59:59 UTC) als Epoch-Sekunden; `undefined` bei falschem Format oder unmöglichem Datum. */
function endOfDayUtcSeconds(raw: unknown): number | undefined {
  if (typeof raw !== "string" || !DATE_PATTERN.test(raw)) return undefined;
  const ms = Date.parse(`${raw}T23:59:59.000Z`);
  // Date.parse rollt unmögliche Daten weiter (31.02. → 03.03.): Rückumwandlung muss gleich sein
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== raw) return undefined;
  return ms / 1000;
}

export type V1InviteUrl = {
  inviteToken: string;
  fullLink: string;
  expiration_date: string | null;
  is_multi: boolean;
};

/** Ein Eintrag der Antwort mit festen Feldern; `exp` ist das Tagesende in UTC aus der Anfrage. */
export function toV1InviteUrl(input: { jwt: string; fullLink: string; exp?: number; multi: boolean }): V1InviteUrl {
  return {
    inviteToken: input.jwt,
    fullLink: input.fullLink,
    expiration_date: input.exp === undefined ? null : new Date(input.exp * 1000).toISOString().slice(0, 10),
    is_multi: input.multi,
  };
}

export function buildV1Response(inviteUrls: V1InviteUrl[]): { inviteUrls: V1InviteUrl[] } {
  return { inviteUrls };
}
