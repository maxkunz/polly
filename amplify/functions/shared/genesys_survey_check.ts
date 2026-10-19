import type { FlowSurvey } from "../../../src/domain/survey/flowTypes";
import { fetchWithTimeout } from "./http";
import { isValidSurveyId } from "./survey_id";
import { isSurveyBeingDeleted } from "./survey_results";
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
 * Web-Kanal: `loadProdSurvey` liest den Prod-Stand einer Umfrage, `loadProjectTag` den Projekt-Tag
 * der Installation aus der Zeile `__meta`.
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
// Web-Kanal
// ---------------------------------------------------------------------------

/** Region, Client-Credentials-Token und Umfrage-Data-Table (`surveyDataTableId`) eines Mandanten. */
export type SurveyTableAccess = {
  region: string;
  token: string;
  dataTableId: string;
};

export type ProdSurveyResult =
  | { status: "ok"; survey: FlowSurvey }
  /** Kein Prod-Stand, Umfrage gelöscht oder Löschung läuft. */
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
 * Lädt den Prod-Stand der Umfrage aus der Data Table des Mandanten. Liegt ein Lösch-Job vor
 * (`SurveyDeletionJobsTable`), gilt die Umfrage als nicht verfügbar, auch wenn die Zeile noch existiert.
 * Ohne `credentials` werden sie über `loadTenantCredentials` geladen.
 */
export async function loadProdSurvey(
  tenantId: string,
  surveyId: string,
  credentials?: TenantCredentials
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

    const survey = parseProdSurvey(row.body?.Prod, surveyId);
    if (!survey) return { status: "unavailable", reason: "No valid Prod version" };
    return { status: "ok", survey };
  } catch (err: any) {
    return errorResult(err?.message ?? "request failed", err?.status);
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
