import { isValidSurveyId } from "./survey_id";
import { GENESYS_REQUEST_TIMEOUT_MS, fetchWithTimeout } from "./http";

/**
 * Zeilenzugriff auf Genesys Data Tables ohne AWS-Abhängigkeiten.
 *
 * Lesen (`getRow`) mit beliebigem Token. Schreiben (`putRow`, `addRow`) ist für MCP gedacht und läuft mit dem
 * Genesys-Token der Person, das je nach Rechten viele Tabellen ändern dürfte. Deshalb gilt eine Allow-List:
 * nur die Umfrage-Data-Table des Mandanten (die Tabelle kommt allein aus `SurveyTableTarget`, also aus
 * `TenantsTable`) und nur die Zeilen `survey_<uuid>` und `survey_list` – nie `__meta` oder `__lock`.
 */

/** Region, Token und Data Table für einen Zugriff. */
export type SurveyTableAccess = {
  region: string;
  token: string;
  dataTableId: string;
};

export async function getRow(
  region: string,
  token: string,
  dataTableId: string,
  rowKey: string
): Promise<{ status: number; body?: any }> {
  const url =
    `https://api.${region}/api/v2/flows/datatables/${encodeURIComponent(dataTableId)}` +
    `/rows/${encodeURIComponent(rowKey)}?showbrief=false`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 200) return { status: 200, body: await res.json() };
  return { status: res.status };
}

/** Zeilen pro Seite beim Lesen aller Umfragen: Eine Zeile hat bis zu vier Zellen mit je max. 32.000 Zeichen. */
const SURVEY_ROWS_PAGE_SIZE = 25;
/** Obergrenze gegen endlose Schleifen (25 × 80 = 2000 Zeilen). */
const SURVEY_ROWS_MAX_PAGES = 80;

const SURVEY_ROW_KEY_PREFIX = "survey_";

export type SurveyRowsResult = { ok: true } | { ok: false; reason: string; status?: number };

export interface SurveyRowsOptions {
  /** Wird vor jeder Seite gefragt; `false` bricht mit Fehler ab (Zeitbudget der Lambda). */
  canContinue?: () => boolean;
}

/**
 * Liest alle Zeilen `survey_<uuid>` seitenweise (mit beliebigem Token) und ruft `visit` je Zeile auf; `__meta`,
 * `__lock`, `survey_list` und Schlüssel ohne gültige ID werden übersprungen. Genesys blättert über den Offset:
 * Ändert sich die Tabelle währenddessen, kann eine Zeile doppelt kommen oder fehlen. Wirft bei Netzwerkfehlern.
 */
export async function forEachSurveyRow(
  access: SurveyTableAccess,
  visit: (surveyId: string, row: Record<string, any>) => void,
  options: SurveyRowsOptions = {}
): Promise<SurveyRowsResult> {
  let pageNumber = 1;
  let pageCount = 1;
  do {
    if (options.canContinue && !options.canContinue()) return { ok: false, reason: "Time budget exhausted" };
    const url =
      `https://api.${access.region}/api/v2/flows/datatables/${encodeURIComponent(access.dataTableId)}` +
      `/rows?showbrief=false&pageSize=${SURVEY_ROWS_PAGE_SIZE}&pageNumber=${pageNumber}`;
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${access.token}` } });
    if (!res.ok) return { ok: false, reason: `Survey rows HTTP ${res.status}`, status: res.status };
    const body: any = await res.json();
    for (const row of Array.isArray(body?.entities) ? body.entities : []) {
      const key = typeof row?.key === "string" ? row.key : "";
      if (!key.startsWith(SURVEY_ROW_KEY_PREFIX) || key === "survey_list") continue;
      const surveyId = key.slice(SURVEY_ROW_KEY_PREFIX.length);
      if (isValidSurveyId(surveyId)) visit(surveyId, row);
    }
    // Ohne Seitenzahl wäre unklar, ob weitere Seiten folgen: Fehler statt still gekürzter Liste
    if (!Number.isInteger(body?.pageCount)) return { ok: false, reason: "Survey rows response without pageCount" };
    pageCount = body.pageCount;
    pageNumber += 1;
  } while (pageNumber <= pageCount && pageNumber <= SURVEY_ROWS_MAX_PAGES);
  if (pageNumber <= pageCount) return { ok: false, reason: "Too many rows in the survey data table" };
  return { ok: true };
}

/** Region und Umfrage-Data-Table des Mandanten (Ausschnitt aus `TenantCredentials`), Ziel jedes Schreibzugriffs. */
export type SurveyTableTarget = {
  region: string;
  surveyDataTableId: string;
};

/** Wiederholungen nach HTTP 429; jede wartet `Retry-After`, höchstens `WRITE_RETRY_MAX_WAIT_MS`. */
const WRITE_RETRIES = 2;
const WRITE_RETRY_DEFAULT_WAIT_MS = 1000;
/** Gedeckelt pro Wartezeit; die Summe über mehrere Aufrufe begrenzt `WriteOptions.deadline`. */
const WRITE_RETRY_MAX_WAIT_MS = 3000;

export interface WriteOptions {
  /**
   * Zeitpunkt (ms seit Epoch), bis zu dem eine Wiederholung samt Wartezeit und Aufruf fertig sein muss;
   * sonst wird nicht wiederholt, sondern der 429 gemeldet. Ohne Angabe nur `WRITE_RETRIES`.
   */
  deadline?: number;
}

export type DataTableWriteErrorCode = "table_not_allowed" | "row_not_allowed" | "http";

/** Schreibfehler; `status` ist der HTTP-Status von Genesys (nur bei `http`). */
export class DataTableWriteError extends Error {
  readonly code: DataTableWriteErrorCode;
  readonly status?: number;

  constructor(code: DataTableWriteErrorCode, message: string, status?: number) {
    super(message);
    this.name = "DataTableWriteError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

/** Zeilen, die das Backend schreiben darf. */
export function isWritableRowKey(rowKey: unknown): boolean {
  if (rowKey === "survey_list") return true;
  return typeof rowKey === "string" && rowKey.startsWith("survey_") && isValidSurveyId(rowKey.slice("survey_".length));
}

function assertWritable(target: SurveyTableTarget, rowKey: unknown): void {
  if (!target.surveyDataTableId) {
    throw new DataTableWriteError("table_not_allowed", "Tenant has no survey data table");
  }
  if (!isWritableRowKey(rowKey)) {
    throw new DataTableWriteError("row_not_allowed", "Row key is not writable");
  }
}

/** Wartezeit aus `Retry-After` (Sekunden; fehlend, leer oder Datumsangabe ergibt den Standardwert). */
function retryAfterMs(res: Response): number {
  const header = res.headers.get("retry-after")?.trim();
  const seconds = header ? Number(header) : NaN;
  const ms = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : WRITE_RETRY_DEFAULT_WAIT_MS;
  return Math.min(ms, WRITE_RETRY_MAX_WAIT_MS);
}

/** Bei 429 hat Genesys nichts geschrieben, deshalb ist die Wiederholung auch für POST sicher. */
async function sendWithRetry(url: string, init: RequestInit, options: WriteOptions): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchWithTimeout(url, init);
    if (res.ok) return;
    const waitMs = res.status === 429 ? retryAfterMs(res) : 0;
    const tooLate = options.deadline !== undefined && Date.now() + waitMs + GENESYS_REQUEST_TIMEOUT_MS > options.deadline;
    if (res.status !== 429 || attempt >= WRITE_RETRIES || tooLate) {
      throw new DataTableWriteError("http", `Data table write HTTP ${res.status}`, res.status);
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function writeInit(method: "PUT" | "POST", token: string, row: Record<string, string>): RequestInit {
  return {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(row),
  };
}

/** Überschreibt die ganze Zeile `rowKey` (Genesys verlangt alle Schema-Spalten, siehe `buildSurveyRowPayload`). */
export async function putRow(
  target: SurveyTableTarget,
  token: string,
  rowKey: string,
  row: Record<string, string>,
  options: WriteOptions = {}
): Promise<void> {
  assertWritable(target, rowKey);
  const url =
    `https://api.${target.region}/api/v2/flows/datatables/${encodeURIComponent(target.surveyDataTableId)}` +
    `/rows/${encodeURIComponent(rowKey)}`;
  await sendWithRetry(url, writeInit("PUT", token, { ...row, key: rowKey }), options);
}

/** Legt eine Zeile an; der Schlüssel steht in `row.key`. */
export async function addRow(
  target: SurveyTableTarget,
  token: string,
  row: Record<string, string>,
  options: WriteOptions = {}
): Promise<void> {
  assertWritable(target, row.key);
  const url = `https://api.${target.region}/api/v2/flows/datatables/${encodeURIComponent(target.surveyDataTableId)}/rows`;
  await sendWithRetry(url, writeInit("POST", token, row), options);
}
