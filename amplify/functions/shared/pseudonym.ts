import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Pseudonymisierung für MCP (`get_responses`, siehe documentation/polly_mcp.md Abschnitt 8). Rein, ohne AWS-SDK;
 * das Secret (`McpPseudonymSecret`) übergibt der Aufrufer.
 *
 * - `pseudonymize`: Klar-ID (`responseId`, `conversationId`, `tokenId`) → `r_<base64url>`, HMAC-SHA256 auf 128 bit
 *   gekürzt. Stabil pro Mandant, ohne Secret nicht umkehrbar; derselbe Wert ergibt bei anderen Mandanten ein anderes Pseudonym.
 * - `sealCursor`/`openCursor`: Cursor mit AES-256-GCM, AAD bindet ihn an Mandant und Umfrage, dazu ein Ablauf.
 *   Ungültige, fremde, manipulierte oder abgelaufene Cursor ergeben `undefined`.
 *
 * Beide Schlüssel werden per HKDF aus dem Secret abgeleitet, jeweils mit eigenem `info`, damit sie unabhängig sind.
 */

/** Mindestlänge des Secrets in Bytes (UTF-8). */
export const PSEUDONYM_SECRET_MIN_BYTES = 32;
/** Längere Cursor werden ohne Dekodieren verworfen. */
export const CURSOR_MAX_CHARS = 4096;

const PSEUDONYM_PREFIX = "r_";
const PSEUDONYM_BYTES = 16;
const CURSOR_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = "polly-mcp";

export interface PseudonymKeys {
  readonly hmacKey: Buffer;
  readonly cursorKey: Buffer;
}

function deriveKey(secret: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, HKDF_SALT, info, 32));
}

/** Wirft, wenn das Secret kürzer als `PSEUDONYM_SECRET_MIN_BYTES` ist. */
export function derivePseudonymKeys(secret: string | Buffer): PseudonymKeys {
  const raw = typeof secret === "string" ? Buffer.from(secret, "utf8") : secret;
  if (raw.byteLength < PSEUDONYM_SECRET_MIN_BYTES) throw new Error("Pseudonym secret too short");
  return {
    hmacKey: deriveKey(raw, "polly-mcp-pseudonym-v1"),
    cursorKey: deriveKey(raw, "polly-mcp-cursor-v1"),
  };
}

/** Teile mit Längenpräfix verketten, damit z. B. `("a", "b:c")` und `("a:b", "c")` nicht zusammenfallen. */
function boundInput(...parts: string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("\0");
}

export function pseudonymize(keys: PseudonymKeys, tenantId: string, value: string): string {
  const digest = createHmac("sha256", keys.hmacKey).update(boundInput(tenantId, value), "utf8").digest();
  return PSEUDONYM_PREFIX + digest.subarray(0, PSEUDONYM_BYTES).toString("base64url");
}

export interface CursorBinding {
  tenantId: string;
  surveyId: string;
}

function cursorAad(binding: CursorBinding): Buffer {
  return Buffer.from(boundInput("polly-mcp-cursor", String(CURSOR_VERSION), binding.tenantId, binding.surveyId), "utf8");
}

/** Versiegelt `payload` (JSON-fähig) bis `expiresAtMs`. */
export function sealCursor(keys: PseudonymKeys, binding: CursorBinding, payload: unknown, expiresAtMs: number): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keys.cursorKey, iv);
  cipher.setAAD(cursorAad(binding));
  const plaintext = Buffer.from(JSON.stringify({ exp: expiresAtMs, p: payload }), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([CURSOR_VERSION]), iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

/** Inhalt des Cursors oder `undefined` (ungültig, manipuliert, fremd oder abgelaufen). */
export function openCursor(keys: PseudonymKeys, binding: CursorBinding, cursor: unknown, nowMs = Date.now()): unknown {
  if (typeof cursor !== "string" || !cursor || cursor.length > CURSOR_MAX_CHARS || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    return undefined;
  }
  const raw = Buffer.from(cursor, "base64url");
  if (raw.byteLength <= 1 + IV_BYTES + TAG_BYTES || raw[0] !== CURSOR_VERSION) return undefined;
  const iv = raw.subarray(1, 1 + IV_BYTES);
  const tag = raw.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(1 + IV_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", keys.cursorKey, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(cursorAad(binding));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(plaintext.toString("utf8"));
    if (typeof parsed?.exp !== "number" || !(parsed.exp > nowMs)) return undefined;
    return parsed.p;
  } catch {
    return undefined;
  }
}
