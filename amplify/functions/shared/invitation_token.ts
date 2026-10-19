import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Einladungslinks des Web-Kanals: JWT mit HS256, siehe `documentation/polly_web.md`.
 * Bewusst ohne JWT-Bibliothek, nur Node-`crypto`.
 *
 * Der Schlüssel liegt in Secrets Manager; `kid` im Header = die ersten 8 Zeichen des
 * SHA-256-Hashs des Schlüssels. Geprüft wird gegen alle übergebenen Schlüssel
 * (`AWSCURRENT` und `AWSPREVIOUS`), damit eine Rotation bestehende Links nicht sofort ungültig macht.
 * Schlüssel werden als `InvitationKey` übergeben (`createInvitationKey`), damit der `kid` nur einmal
 * pro geladenem Schlüssel berechnet wird und nicht bei jeder Prüfung.
 */

export type InvitationClaims = {
  tenant_id: string;
  survey_id: string;
  token_id: string;
  /** true: beliebig oft nutzbar, false: genau eine Teilnahme. */
  multi: boolean;
  /** Ausstellungszeitpunkt (Epoch-Sekunden). */
  iat: number;
  /** Optionales Ablaufdatum der Einladung (Epoch-Sekunden); fehlt es, läuft sie nie ab. */
  exp?: number;
};

/** `invalid`: Format, Signatur, `alg`, `kid` oder Claims falsch. `expired`: `exp` erreicht. */
/** Schlüssel mit vorab berechnetem `kid`; einmal pro geladenem Secret erzeugen und cachen. */
export type InvitationKey = {
  kid: string;
  secret: string;
};

export type InvitationVerifyError = "invalid" | "expired";

export type InvitationVerifyResult =
  | { ok: true; claims: InvitationClaims }
  | { ok: false; error: InvitationVerifyError };

const ALG = "HS256";
const KID_LENGTH = 8;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Toleranz für abweichende Uhren beim Vergleich von `iat` mit der aktuellen Zeit. */
const CLOCK_SKEW_SECONDS = 300;

/** `kid` eines Schlüssels: die ersten 8 Zeichen seines SHA-256-Hashs (hex). */
export function invitationKeyId(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex").slice(0, KID_LENGTH);
}

export function createInvitationKey(secret: string): InvitationKey {
  if (!secret) throw new Error("Signaturschlüssel fehlt");
  return { kid: invitationKeyId(secret), secret };
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function hmac(secret: string, signingInput: string): Buffer {
  return createHmac("sha256", secret).update(signingInput, "utf8").digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isEpochSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Prüft die Pflicht-Claims und gibt nur die bekannten Felder zurück. */
function parseClaims(payload: unknown): InvitationClaims | null {
  if (!isRecord(payload)) return null;
  const { tenant_id, survey_id, token_id, multi, iat, exp } = payload;
  if (!isNonEmptyString(tenant_id) || !isNonEmptyString(survey_id) || !isNonEmptyString(token_id)) return null;
  if (typeof multi !== "boolean" || !isEpochSeconds(iat)) return null;
  if (exp !== undefined && !isEpochSeconds(exp)) return null;
  return { tenant_id, survey_id, token_id, multi, iat, ...(exp !== undefined ? { exp } : {}) };
}

/**
 * Signiert eine Einladung. Signiert werden nur die bekannten Claims, zusätzliche Felder des
 * Aufrufers landen nicht im (für jeden Empfänger lesbaren) Token. Abgelehnt werden `iat` in der
 * Zukunft sowie ein `exp`, das nicht nach `iat` und nach der aktuellen Zeit liegt.
 */
export function signInvitation(claims: InvitationClaims, key: InvitationKey, nowSeconds = nowEpochSeconds()): string {
  if (!key?.secret || !key.kid) throw new Error("Signaturschlüssel fehlt");
  const parsed = parseClaims(claims);
  if (!parsed) throw new Error("Ungültige Einladungs-Claims");
  if (parsed.iat > nowSeconds + CLOCK_SKEW_SECONDS) throw new Error("iat liegt in der Zukunft");
  if (parsed.exp !== undefined && (parsed.exp <= parsed.iat || parsed.exp <= nowSeconds)) {
    throw new Error("exp liegt nicht in der Zukunft");
  }

  const header = encodeJson({ alg: ALG, typ: "JWT", kid: key.kid });
  const payload = encodeJson(parsed);
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${hmac(key.secret, signingInput).toString("base64url")}`;
}

/**
 * Prüft eine Einladung: Format, Header (`alg` = HS256, bekannter `kid`), Signatur, Pflicht-Claims,
 * `iat` (nicht in der Zukunft) und `exp`. `exp` ist die letzte gültige Sekunde (Tagesende 23:59:59,
 * siehe `documentation/polly_web.md`); abgelaufen ist die Einladung erst danach.
 */
export function verifyInvitation(
  jwt: string,
  keys: InvitationKey[],
  nowSeconds = nowEpochSeconds()
): InvitationVerifyResult {
  const invalid: InvitationVerifyResult = { ok: false, error: "invalid" };
  if (typeof jwt !== "string") return invalid;

  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts.every(part => BASE64URL_PATTERN.test(part))) return invalid;
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  const header = decodeJson(headerSegment);
  if (!isRecord(header) || header.alg !== ALG) return invalid;
  if (header.typ !== undefined && header.typ !== "JWT") return invalid;
  if (typeof header.kid !== "string") return invalid;

  const key = keys.find(candidate => candidate?.secret && candidate.kid === header.kid);
  if (!key) return invalid;

  // Kodiert vergleichen: Der base64url-Decoder ignoriert Füllbits, sonst gälten mehrere Schreibweisen derselben Signatur
  const expected = Buffer.from(hmac(key.secret, `${headerSegment}.${payloadSegment}`).toString("base64url"));
  const actual = Buffer.from(signatureSegment);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return invalid;

  const claims = parseClaims(decodeJson(payloadSegment));
  if (!claims || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) return invalid;
  if (claims.exp !== undefined && nowSeconds > claims.exp) return { ok: false, error: "expired" };

  return { ok: true, claims };
}
