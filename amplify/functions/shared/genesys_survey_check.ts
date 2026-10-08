/**
 * Sicherheitsprüfung vor dem Löschen von Umfrage-Ergebnissen:
 * Ergebnisse dürfen nur gelöscht werden, wenn die Umfrage in der Genesys Data Table
 * nachweislich nicht (mehr) existiert. Im Zweifel (Fehler, fehlender Zugriff,
 * unlesbare Antwort) wird NICHT gelöscht.
 */

const SURVEY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

export type SurveyAbsenceResult =
  | { status: "absent" }
  | { status: "exists"; reason: string }
  | { status: "error"; reason: string };

const clientTokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Umfrage-IDs sind UUIDs; nur so ist `begins_with "<id>#"` eindeutig. */
export function isValidSurveyId(value: unknown): value is string {
  return typeof value === "string" && SURVEY_ID_PATTERN.test(value);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  if (!res.ok) throw new Error(`Genesys client credentials token failed (HTTP ${res.status})`);

  const data: any = await res.json();
  if (!data?.access_token) throw new Error("Genesys token response without access_token");

  clientTokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 300) * 1000,
  });
  return data.access_token;
}

async function getRow(
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
