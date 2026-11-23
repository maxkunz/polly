import { normalizeFeatures, type FeatureFlags } from "../../../src/domain/features/featureFlags";
import { baseUrlError, usableBaseUrl } from "../../../src/domain/survey/invitationLinks";
import { getRow, type SurveyTableAccess } from "./genesys_datatable";
import { TtlCache } from "./ttl_cache";

/**
 * Installationsdaten aus der Zeile `__meta` (Feld `Draft`) der Umfrage-Data-Table: Projekt-Tag, Feature Flags und
 * Standard-Basis-URL. Ein Lesezugriff liefert alles; das Ergebnis wird pro Data Table 60 s gemerkt, damit nicht
 * jeder Aufruf `__meta` liest. Lesefehler werden geworfen und nicht gemerkt.
 */

export interface InstallationMeta {
  /** `meta.setup.projectTag`; fehlt er, zählt wie im Frontend nur die unpräfixierte Rolle. */
  projectTag?: string;
  /** `meta.features`, nur boolesche Werte (`normalizeFeatures`). */
  features: FeatureFlags;
  /** `meta.web.defaultBaseUrl`, nur wenn gültig (`usableBaseUrl`); sonst gilt die Polly-Umfrageseite. */
  defaultBaseUrl?: string;
}

const INSTALLATION_META_TTL_MS = 60 * 1000;

const installationMetaCache = new TtlCache<InstallationMeta>({ ttlMs: INSTALLATION_META_TTL_MS });

/**
 * Inhalt der Zeile `__meta` (Feld `Draft`). `undefined`, wenn die Zeile fehlt oder unlesbar ist.
 * Wirft bei anderen HTTP-Fehlern (Fehler mit `status`).
 */
async function readMetaDraft(access: SurveyTableAccess): Promise<any | undefined> {
  const row = await getRow(access.region, access.token, access.dataTableId, "__meta");
  if (row.status === 404) return undefined;
  if (row.status !== 200) {
    throw Object.assign(new Error(`__meta row HTTP ${row.status}`), { status: row.status });
  }
  try {
    return typeof row.body?.Draft === "string" ? JSON.parse(row.body.Draft) : row.body?.Draft;
  } catch {
    return undefined;
  }
}

/** Fehlende oder unlesbare `__meta`-Zeile ergibt leere Werte (keine Flags, kein Tag). `tenantId` nur fürs Log. */
export function parseInstallationMeta(meta: any, tenantId?: string): InstallationMeta {
  const projectTag = meta?.setup?.projectTag;
  const rawBaseUrl = meta?.web?.defaultBaseUrl;
  const baseUrl = typeof rawBaseUrl === "string" ? rawBaseUrl.trim() : "";
  const defaultBaseUrl = usableBaseUrl(baseUrl);
  if (baseUrl && !defaultBaseUrl) {
    console.warn("[installation_meta] Ignoring invalid default base URL in __meta", {
      tenantId,
      error: baseUrlError(baseUrl),
      length: baseUrl.length,
    });
  }
  return {
    ...(typeof projectTag === "string" && projectTag.trim() ? { projectTag: projectTag.trim() } : {}),
    features: normalizeFeatures(meta?.features),
    ...(defaultBaseUrl ? { defaultBaseUrl } : {}),
  };
}

/** `fresh`: am Cache vorbei lesen (das Ergebnis wird trotzdem gemerkt). `tenantId` nur fürs Log. */
export function loadInstallationMeta(tenantId: string, access: SurveyTableAccess, fresh = false): Promise<InstallationMeta> {
  return installationMetaCache.getOrLoad(
    `${access.region}:${access.dataTableId}`,
    async () => ({ value: parseInstallationMeta(await readMetaDraft(access), tenantId) }),
    fresh
  );
}

/**
 * Projekt-Tag der Installation (`meta.setup.projectTag`). `undefined`, wenn die Zeile oder der Tag fehlt.
 * Wirft bei anderen HTTP-Fehlern.
 */
export async function loadProjectTag(tenantId: string, access: SurveyTableAccess): Promise<string | undefined> {
  return (await loadInstallationMeta(tenantId, access)).projectTag;
}

/**
 * Standard-Basis-URL des Mandanten (`meta.web.defaultBaseUrl`, in den Einstellungen gepflegt).
 * Wirft bei Lesefehlern (Fehler mit `status`), damit keine Links auf die falsche Seite entstehen.
 * `fresh`: am Cache vorbei lesen (beim Signieren von Einladungen, deren Links sich nicht mehr ändern lassen).
 */
export async function loadDefaultBaseUrl(tenantId: string, access: SurveyTableAccess, fresh = false): Promise<string | undefined> {
  return (await loadInstallationMeta(tenantId, access, fresh)).defaultBaseUrl;
}

/** Nur für Tests. */
export function clearInstallationMetaCache(): void {
  installationMetaCache.clear();
}
