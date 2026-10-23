import type { FlowSurvey } from "../../../src/domain/survey/flowTypes";
import { baseUrlError } from "../../../src/domain/survey/invitationLinks";
import { fetchWithTimeout } from "./http";
import { isValidSurveyId } from "./survey_id";
import { findSurveysBeingDeleted, isSurveyBeingDeleted } from "./survey_results";
import { loadTenantCredentials, type TenantCredentials } from "./tenant_auth";
import { parseProdSurvey } from "./web_survey_format";

/**
 * Zugriff des Backends auf die Umfrage-Data-Table eines Mandanten (Client Credentials aus dem Onboarding).
 *
 * Sicherheitsprüfung vor dem Löschen von Umfrage-Ergebnissen:
 * Ergebnisse dürfen nur gelöscht werden, wenn die Umfrage in der Genesys Data Table
 * nachweislich nicht (mehr) existiert. Im Zweifel (Fehler, fehlender Zugriff,
 * unlesbare Antwort) wird NICHT gelöscht.
 *
 * Web-Kanal: `loadProdSurvey` liest den Prod-Stand einer Umfrage (`listProdSurveys` alle), `loadProjectTag` den Projekt-Tag
 * der Installation aus der Zeile `__meta`.
 *
 * Antworten aus dem Flow: `checkSurveyExists` prüft (mit Cache), dass die Zeile `survey_<id>` in der
 * Data Table des Mandanten existiert, damit keine Antworten zu fremden oder erfundenen Umfragen gespeichert werden.
 */

const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

export type SurveyAbsenceResult =
  | { status: "absent" }
  | { status: "exists"; reason: string }
  | { status: "error"; reason: string };

const clientTokenCache = new Map<string, { token: string; expiresAt: number }>();

export { isValidSurveyId };

export async function getClientCredentialsToken(
  region: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const cacheKey = `${region}:${clientId}`;
  const cached = clientTokenCache.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return cached.token;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetchWithTimeout(`https://login.${region}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Genesys client credentials token failed (HTTP ${res.status})`), { status: res.status });
  }

  const data: any = await res.json();
  if (!data?.access_token) throw new Error("Genesys token response without access_token");

  clientTokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 300) * 1000,
  });
  return data.access_token;
}

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

async function getTableStatus(region: string, token: string, dataTableId: string): Promise<number> {
  const url = `https://api.${region}/api/v2/flows/datatables/${encodeURIComponent(dataTableId)}`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.status;
}

function listContainsSurvey(listRow: Record<string, any>, surveyId: string): boolean | null {
  const raw = listRow.Draft;
  if (raw === undefined || raw === null) return null;
  let list: unknown;
  try {
    list = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  return list.some((item: any) => String(item?.id ?? item?.key ?? "") === surveyId);
}

/**
 * Prüft für JEDE übergebene Data Table, dass die Umfrage dort nicht existiert:
 *  - Zeile `survey_<id>` muss 404 liefern,
 *  - Zeile `survey_list` darf die ID nicht enthalten; fehlt die Zeile (noch nie eine Umfrage gespeichert),
 *    muss die Tabelle selbst lesbar sein (sonst wäre ein 404 auch bei fehlender Tabelle möglich).
 * Jedes andere Ergebnis führt zu `exists` bzw. `error`.
 */
export async function assertSurveyAbsent(
  region: string,
  token: string,
  dataTableIds: string[],
  surveyId: string
): Promise<SurveyAbsenceResult> {
  if (!isValidSurveyId(surveyId)) return { status: "error", reason: "Invalid surveyId" };

  const tableIds = Array.from(new Set(dataTableIds.map((id) => String(id ?? "").trim()).filter(Boolean)));
  if (tableIds.length === 0) return { status: "error", reason: "No data table to verify against" };

  for (const tableId of tableIds) {
    try {
      const surveyRow = await getRow(region, token, tableId, `survey_${surveyId}`);
      if (surveyRow.status === 200) {
        return { status: "exists", reason: `Survey row exists in data table ${tableId}` };
      }
      if (surveyRow.status !== 404) {
        return { status: "error", reason: `Data table ${tableId}: survey row check HTTP ${surveyRow.status}` };
      }

      const listRow = await getRow(region, token, tableId, "survey_list");
      if (listRow.status === 404) {
        // survey_list entsteht erst beim ersten Speichern einer Umfrage. Ohne Index kann die Umfrage dort
        // nur fehlen, sofern die Tabelle selbst nachweislich existiert (sonst wären beide 404 bedeutungslos).
        const tableStatus = await getTableStatus(region, token, tableId);
        if (tableStatus !== 200) {
          return { status: "error", reason: `Data table ${tableId}: table check HTTP ${tableStatus}` };
        }
        continue;
      }
      if (listRow.status !== 200) {
        return { status: "error", reason: `Data table ${tableId}: survey_list check HTTP ${listRow.status}` };
      }
      const contained = listContainsSurvey(listRow.body ?? {}, surveyId);
      if (contained === null) {
        return { status: "error", reason: `Data table ${tableId}: survey_list not readable` };
      }
      if (contained) {
        return { status: "exists", reason: `Survey is listed in survey_list of data table ${tableId}` };
      }
    } catch (err: any) {
      return { status: "error", reason: `Data table ${tableId}: ${err?.message ?? "request failed"}` };
    }
  }

  return { status: "absent" };
}

// ---------------------------------------------------------------------------
// Existenzprüfung für Antworten aus dem Flow
// ---------------------------------------------------------------------------

export type SurveyExistenceResult =
  | { status: "exists" }
  | { status: "absent" }
  /** `config` = Credentials/Data Table fehlen, Token-Abruf abgelehnt oder 401/403; sonst `transient`. */
  | { status: "error"; kind: "transient" | "config"; reason: string; throttled?: boolean };

const SURVEY_EXISTS_TTL_MS = 30 * 60 * 1000;
const SURVEY_ABSENT_TTL_MS = 5 * 60 * 1000;
// Auch unklare Ergebnisse kurz merken, damit eine Störung bei Genesys nicht mit jeder Antwort weiter angefragt wird
const SURVEY_CHECK_ERROR_TTL_MS = 60 * 1000;
const SURVEY_EXISTENCE_CACHE_MAX = 1000;

const surveyExistenceCache = new Map<string, { result: SurveyExistenceResult; expiresAt: number }>();

const CONFIG_ERROR_HTTP_STATUS = new Set([400, 401, 403]);

function existenceError(reason: string, httpStatus?: number): SurveyExistenceResult {
  return {
    status: "error",
    kind: httpStatus !== undefined && CONFIG_ERROR_HTTP_STATUS.has(httpStatus) ? "config" : "transient",
    reason,
    ...(httpStatus === 429 ? { throttled: true } : {}),
  };
}

async function querySurveyExists(tenantId: string, surveyId: string, credentials?: TenantCredentials): Promise<SurveyExistenceResult> {
  let tenantCredentials: TenantCredentials | undefined;
  try {
    tenantCredentials = credentials ?? (await loadTenantCredentials(tenantId));
  } catch (err: any) {
    return existenceError(`Loading tenant credentials failed: ${err?.message ?? "unknown error"}`);
  }
  if (!tenantCredentials) return { status: "error", kind: "config", reason: "No Genesys credentials for tenant" };
  if (!tenantCredentials.surveyDataTableId) {
    return { status: "error", kind: "config", reason: "No survey data table registered for tenant" };
  }

  try {
    const access = await getSurveyTableAccess(tenantCredentials);
    const row = await getRow(access.region, access.token, access.dataTableId, `survey_${surveyId}`);
    if (row.status === 200) return { status: "exists" };
    if (row.status === 404) return { status: "absent" };
    return existenceError(`Survey row HTTP ${row.status}`, row.status);
  } catch (err: any) {
    return existenceError(err?.message ?? "request failed", err?.status);
  }
}

/**
 * Prüft, ob die Zeile `survey_<id>` in der Umfrage-Data-Table des Mandanten existiert (Stage oder Prod egal).
 * Ergebnisse werden pro Lambda-Instanz gecacht: vorhanden 30 min, nicht vorhanden 5 min, Fehler 60 s.
 * `cached` zeigt, ob das Ergebnis aus dem Cache stammt (z. B. um Fehler nur einmal zu loggen).
 */
export async function checkSurveyExists(
  tenantId: string,
  surveyId: string,
  credentials?: TenantCredentials
): Promise<SurveyExistenceResult & { cached: boolean }> {
  const cacheKey = `${tenantId}:${surveyId}`;
  const now = Date.now();
  const cached = surveyExistenceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return { ...cached.result, cached: true };

  const result = await querySurveyExists(tenantId, surveyId, credentials);
  const ttl =
    result.status === "exists" ? SURVEY_EXISTS_TTL_MS : result.status === "absent" ? SURVEY_ABSENT_TTL_MS : SURVEY_CHECK_ERROR_TTL_MS;

  // Abgelaufene Einträge verwerfen, Größe begrenzen
  const storedAt = Date.now();
  if (surveyExistenceCache.size >= SURVEY_EXISTENCE_CACHE_MAX) {
    for (const [k, v] of surveyExistenceCache) if (v.expiresAt <= storedAt) surveyExistenceCache.delete(k);
    if (surveyExistenceCache.size >= SURVEY_EXISTENCE_CACHE_MAX) surveyExistenceCache.clear();
  }
  surveyExistenceCache.set(cacheKey, { result, expiresAt: storedAt + ttl });
  return { ...result, cached: false };
}

/** Nur für Tests. */
export function clearSurveyExistenceCache(): void {
  surveyExistenceCache.clear();
}

// ---------------------------------------------------------------------------
// Web-Kanal
// ---------------------------------------------------------------------------

/** Region, Client-Credentials-Token und Umfrage-Data-Table (`surveyDataTableId`) eines Mandanten. */
export type SurveyTableAccess = {
  region: string;
  token: string;
  dataTableId: string;
};

export type ProdSurveyResult =
  /** `baseUrl`: gültige `base_url` aus dem Draft (steht nicht im Flow-JSON), nur mit `withBaseUrl` und wenn gesetzt. */
  | { status: "ok"; survey: FlowSurvey; baseUrl?: string }
  /** Kein Prod- bzw. Stage-Stand, Umfrage gelöscht oder Löschung läuft. */
  | { status: "unavailable"; reason: string }
  /** Genesys nicht erreichbar oder Zugriff fehlt; `throttled` bei HTTP 429 von Genesys. */
  | { status: "error"; reason: string; throttled?: boolean };

function errorResult(reason: string, httpStatus?: number): ProdSurveyResult {
  return { status: "error", reason, ...(httpStatus === 429 ? { throttled: true } : {}) };
}

/** Wirft, wenn das Token nicht geholt werden kann (Fehler mit `status` bei HTTP-Fehlern). */
export async function getSurveyTableAccess(credentials: TenantCredentials): Promise<SurveyTableAccess> {
  const dataTableId = credentials.surveyDataTableId;
  if (!dataTableId) throw new Error("No survey data table registered for tenant");
  const token = await getClientCredentialsToken(credentials.region, credentials.clientId, credentials.clientSecret);
  return { region: credentials.region, token, dataTableId };
}

/**
 * `base_url` aus dem Draft der Zeile. Unlesbare Drafts, fehlende oder ungültige Werte (`baseUrlError`, wie im
 * Editor) ergeben `undefined`, dann gilt der Fallback. Der Draft wird ohne Deploy gespeichert, deshalb hier prüfen.
 */
function readDraftBaseUrl(raw: unknown, surveyId: string): string | undefined {
  let draft: unknown = raw;
  if (typeof raw === "string") {
    try {
      draft = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  const baseUrl = (draft as { base_url?: unknown } | null)?.base_url;
  if (typeof baseUrl !== "string" || !baseUrl.trim()) return undefined;
  const error = baseUrlError(baseUrl);
  if (error) {
    console.warn("[genesys_survey_check] Ignoring invalid base_url in Draft", { surveyId, error, length: baseUrl.length });
    return undefined;
  }
  return baseUrl.trim();
}

/** Spalte der Zeile `survey_<id>`, aus der ein Flow-Stand gelesen wird. */
export type FlowSurveyColumn = "Prod" | "Stage";

/** `withBaseUrl`: zusätzlich `base_url` aus dem Draft lesen (parst den ganzen Draft, nur für Links der Kunden-API). */
export type FlowSurveyOptions = { withBaseUrl?: boolean };

/**
 * Lädt den Prod-Stand der Umfrage aus der Data Table des Mandanten. Liegt ein Lösch-Job vor
 * (`SurveyDeletionJobsTable`), gilt die Umfrage als nicht verfügbar, auch wenn die Zeile noch existiert.
 * Ohne `credentials` werden sie über `loadTenantCredentials` geladen.
 */
export function loadProdSurvey(
  tenantId: string,
  surveyId: string,
  credentials?: TenantCredentials,
  options?: FlowSurveyOptions
): Promise<ProdSurveyResult> {
  return loadFlowSurvey(tenantId, surveyId, credentials, "Prod", options);
}

/** Wie `loadProdSurvey`, liest aber die angegebene Spalte (`Stage` für die Webvorschau). */
export async function loadFlowSurvey(
  tenantId: string,
  surveyId: string,
  credentials: TenantCredentials | undefined,
  column: FlowSurveyColumn,
  options: FlowSurveyOptions = {}
): Promise<ProdSurveyResult> {
  if (!isValidSurveyId(surveyId)) return { status: "unavailable", reason: "Invalid surveyId" };
  if (await isSurveyBeingDeleted(tenantId, surveyId)) return { status: "unavailable", reason: "Survey is being deleted" };

  const tenantCredentials = credentials ?? (await loadTenantCredentials(tenantId));
  if (!tenantCredentials) return errorResult("No Genesys credentials for tenant");

  try {
    const access = await getSurveyTableAccess(tenantCredentials);
    const row = await getRow(access.region, access.token, access.dataTableId, `survey_${surveyId}`);
    if (row.status === 404) return { status: "unavailable", reason: "Survey row not found" };
    if (row.status !== 200) return errorResult(`Survey row HTTP ${row.status}`, row.status);

    const survey = parseProdSurvey(row.body?.[column], surveyId);
    if (!survey) return { status: "unavailable", reason: `No valid ${column} version` };
    const baseUrl = options.withBaseUrl ? readDraftBaseUrl(row.body?.Draft, surveyId) : undefined;
    return { status: "ok", survey, ...(baseUrl ? { baseUrl } : {}) };
  } catch (err: any) {
    return errorResult(err?.message ?? "request failed", err?.status);
  }
}

/** Zeilen pro Seite beim Lesen aller Umfragen: Eine Zeile hat bis zu vier Zellen mit je max. 32.000 Zeichen. */
const SURVEY_ROWS_PAGE_SIZE = 25;
/** Obergrenze gegen endlose Schleifen (25 × 80 = 2000 Zeilen). */
const SURVEY_ROWS_MAX_PAGES = 80;

const SURVEY_ROW_KEY_PREFIX = "survey_";

export type ProdSurveyListResult =
  | { status: "ok"; surveys: FlowSurvey[] }
  | { status: "error"; reason: string; throttled?: boolean };

export interface ProdSurveyListOptions {
  /** Wird vor jeder Seite gefragt; `false` bricht mit Fehler ab (Zeitbudget der Lambda). */
  canContinue?: () => boolean;
}

/**
 * Alle Umfragen des Mandanten mit gültigem Prod-Stand, ohne Umfragen, deren Löschung läuft (`SurveyDeletionJobsTable`).
 * Liest die Zeilen der Data Table seitenweise; `__meta`, `__lock` und `survey_list` und Zeilen ohne gültige
 * Prod-Zelle werden übersprungen. `survey_list` genügt nicht, weil dort nur ID und Titel stehen.
 * Genesys blättert über den Offset: Ändert sich die Tabelle währenddessen, kann eine Zeile doppelt kommen
 * (wird nach ID entfernt) oder fehlen.
 */
export async function listProdSurveys(
  tenantId: string,
  credentials?: TenantCredentials,
  options: ProdSurveyListOptions = {}
): Promise<ProdSurveyListResult> {
  const tenantCredentials = credentials ?? (await loadTenantCredentials(tenantId));
  if (!tenantCredentials) return { status: "error", reason: "No Genesys credentials for tenant" };

  const surveys = new Map<string, FlowSurvey>();
  try {
    const access = await getSurveyTableAccess(tenantCredentials);
    let pageNumber = 1;
    let pageCount = 1;
    do {
      if (options.canContinue && !options.canContinue()) return { status: "error", reason: "Time budget exhausted" };
      const url =
        `https://api.${access.region}/api/v2/flows/datatables/${encodeURIComponent(access.dataTableId)}` +
        `/rows?showbrief=false&pageSize=${SURVEY_ROWS_PAGE_SIZE}&pageNumber=${pageNumber}`;
      const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${access.token}` } });
      if (!res.ok) {
        return { status: "error", reason: `Survey rows HTTP ${res.status}`, ...(res.status === 429 ? { throttled: true } : {}) };
      }
      const body: any = await res.json();
      for (const row of Array.isArray(body?.entities) ? body.entities : []) {
        const key = typeof row?.key === "string" ? row.key : "";
        if (!key.startsWith(SURVEY_ROW_KEY_PREFIX) || key === "survey_list") continue;
        const surveyId = key.slice(SURVEY_ROW_KEY_PREFIX.length);
        if (!isValidSurveyId(surveyId)) continue;
        const survey = parseProdSurvey(row.Prod, surveyId);
        if (survey) surveys.set(survey.id, survey);
      }
      // Ohne Seitenzahl wäre unklar, ob weitere Seiten folgen: Fehler statt still gekürzter Liste
      if (!Number.isInteger(body?.pageCount)) return { status: "error", reason: "Survey rows response without pageCount" };
      pageCount = body.pageCount;
      pageNumber += 1;
    } while (pageNumber <= pageCount && pageNumber <= SURVEY_ROWS_MAX_PAGES);
    if (pageNumber <= pageCount) return { status: "error", reason: "Too many rows in the survey data table" };

    const deleting = await findSurveysBeingDeleted(tenantId, [...surveys.keys()]);
    return { status: "ok", surveys: [...surveys.values()].filter((survey) => !deleting.has(survey.id)) };
  } catch (err: any) {
    return { status: "error", reason: err?.message ?? "request failed", ...(err?.status === 429 ? { throttled: true } : {}) };
  }
}

/**
 * Projekt-Tag der Installation (`meta.setup.projectTag` in der Zeile `__meta`, Feld `Draft`).
 * `undefined`, wenn die Zeile oder der Tag fehlt (wie im Frontend: dann zählt nur die unpräfixierte Rolle).
 * Wirft bei anderen HTTP-Fehlern.
 */
export async function loadProjectTag(access: SurveyTableAccess): Promise<string | undefined> {
  const row = await getRow(access.region, access.token, access.dataTableId, "__meta");
  if (row.status === 404) return undefined;
  if (row.status !== 200) {
    throw Object.assign(new Error(`__meta row HTTP ${row.status}`), { status: row.status });
  }
  let meta: any;
  try {
    meta = typeof row.body?.Draft === "string" ? JSON.parse(row.body.Draft) : row.body?.Draft;
  } catch {
    return undefined;
  }
  const projectTag = meta?.setup?.projectTag;
  return typeof projectTag === "string" && projectTag.trim() ? projectTag.trim() : undefined;
}
