/**
 * HTTP-Hilfen der Lambdas ohne AWS-Abhängigkeiten: Genesys-Aufrufe mit Timeout und Request-Bodys
 * mit Größengrenze (testbar, siehe `test/webSurveyBackend.test.ts`).
 */

/**
 * Timeout pro Genesys-Aufruf. Die Lambdas verketten bis zu vier Aufrufe hintereinander und müssen
 * unter dem 30-s-Limit von API Gateway bleiben; die Lambda-Timeouts in `resource.ts` sind darauf abgestimmt.
 */
export const GENESYS_REQUEST_TIMEOUT_MS = 6000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = GENESYS_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type BodyResult = { ok: true; text: string } | { ok: false; error: "payload_too_large" };

/** Body als Text; zu große Bodies werden abgelehnt, bevor sie dekodiert und geparst werden. */
export function readRequestBody(event: { body?: unknown; isBase64Encoded?: boolean }, maxBytes: number): BodyResult {
  const raw = typeof event?.body === "string" ? event.body : "";
  // Vorabprüfung ohne Dekodieren: Base64 ist länger als der Inhalt, UTF-8 nie kürzer als die Zeichenzahl
  if (!event?.isBase64Encoded && raw.length > maxBytes) return { ok: false, error: "payload_too_large" };
  if (event?.isBase64Encoded && raw.length > Math.ceil((maxBytes * 4) / 3) + 4) {
    return { ok: false, error: "payload_too_large" };
  }
  const buffer = event?.isBase64Encoded ? Buffer.from(raw, "base64") : Buffer.from(raw, "utf8");
  if (buffer.byteLength > maxBytes) return { ok: false, error: "payload_too_large" };
  return { ok: true, text: buffer.toString("utf8") };
}
