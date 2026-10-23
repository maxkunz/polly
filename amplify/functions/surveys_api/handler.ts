import { resolveApiClient } from "../shared/api_client_auth";
import { dispatchExtRoute, extError, extHeaders } from "../shared/ext_http";
import type { ExtResult, ExtRoute } from "../shared/ext_http";
import { listProdSurveys, loadProdSurvey } from "../shared/genesys_survey_check";
import { isValidSurveyId } from "../shared/survey_id";
import { loadTenantCredentials } from "../shared/tenant_auth";
import { pickTheme } from "../shared/web_themes";
import { loadTenantThemesCached } from "../shared/web_themes_table";
import * as v1 from "./v1";

type AnyApiGwEvent = any;
type AnyLambdaContext = { getRemainingTimeInMillis: () => number };
type AnyResult = ExtResult;

// Die HTTP API bricht nach 30 s ab: vorher mit 502 im dokumentierten Fehlerformat antworten.
// Reserve für eine Genesys-Seite (Timeout 6 s), die Prüfung auf Löschungen und das Serialisieren.
const MIN_REMAINING_MS = 8000;

const headers = extHeaders("GET");

function errorResponse(statusCode: number, error: string, message: string): AnyResult {
  return extError(headers, statusCode, error, message);
}

/**
 * Cache der fertigen Antworten (200 und 404) pro Mandant im Lambda-Speicher: schont das Rate-Limit von Genesys.
 * Ein Deploy wirkt in der API deshalb bis zu 1 min später. Fehler (429, 502) werden nicht gemerkt.
 */
const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const responseCache = new Map<string, { expiresAt: number; result: AnyResult }>();

function fromCache(key: string): AnyResult | undefined {
  const cached = responseCache.get(key);
  return cached && cached.expiresAt > Date.now() ? cached.result : undefined;
}

function toCache(key: string, result: AnyResult): AnyResult {
  if (responseCache.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of responseCache) if (v.expiresAt <= now) responseCache.delete(k);
    if (responseCache.size >= CACHE_MAX_ENTRIES) responseCache.clear();
  }
  responseCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Nur für Tests. */
export function clearResponseCache(): void {
  responseCache.clear();
}

function genesysFailure(throttled: boolean | undefined): AnyResult {
  return throttled
    ? errorResponse(429, "genesys_error", "Genesys is throttling requests, please retry later")
    : errorResponse(502, "genesys_error", "Cannot load surveys");
}

async function list(event: AnyApiGwEvent, context?: AnyLambdaContext): Promise<AnyResult> {
  const auth = await resolveApiClient(event, "polly-api/surveys.read");
  if (!auth.ok) return errorResponse(auth.statusCode, auth.error, auth.message);

  const cacheKey = `${auth.tenantId}:list`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const credentials = await loadTenantCredentials(auth.tenantId, auth.tenant);
  if (!credentials) return errorResponse(502, "genesys_error", "No Genesys backend credentials for tenant");

  const canContinue = () => !context || context.getRemainingTimeInMillis() >= MIN_REMAINING_MS;
  const result = await listProdSurveys(auth.tenantId, credentials, { canContinue });
  if (result.status !== "ok") {
    console.warn("[surveys_api] list failed", { clientId: auth.clientId, tenantId: auth.tenantId, reason: result.reason });
    return genesysFailure(result.throttled);
  }

  console.log("[surveys_api] list", { clientId: auth.clientId, tenantId: auth.tenantId, surveys: result.surveys.length });
  return toCache(cacheKey, { statusCode: 200, headers, body: JSON.stringify(v1.buildV1ListResponse(result.surveys)) });
}

async function detail(event: AnyApiGwEvent): Promise<AnyResult> {
  const auth = await resolveApiClient(event, "polly-api/surveys.read");
  if (!auth.ok) return errorResponse(auth.statusCode, auth.error, auth.message);

  const rawId = event?.pathParameters?.surveyId;
  if (!isValidSurveyId(rawId)) return errorResponse(400, "invalid_request", "surveyId must be a UUID");
  const surveyId = rawId.toLowerCase();

  const cacheKey = `${auth.tenantId}:${surveyId}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const credentials = await loadTenantCredentials(auth.tenantId, auth.tenant);
  if (!credentials) return errorResponse(502, "genesys_error", "No Genesys backend credentials for tenant");

  const [prod, themes] = await Promise.all([
    loadProdSurvey(auth.tenantId, surveyId, credentials, { withBaseUrl: true }),
    loadTenantThemesCached(auth.tenantId),
  ]);
  if (prod.status === "unavailable") {
    return toCache(cacheKey, errorResponse(404, "not_found", "Survey has no Prod version, does not exist or is being deleted"));
  }
  if (prod.status === "error") {
    console.warn("[surveys_api] detail failed", { clientId: auth.clientId, tenantId: auth.tenantId, surveyId, reason: prod.reason });
    return genesysFailure(prod.throttled);
  }

  console.log("[surveys_api] detail", { clientId: auth.clientId, tenantId: auth.tenantId, surveyId });
  const body = v1.toV1SurveyDetail(prod.survey, prod.baseUrl, pickTheme(themes, prod.survey.web_theme_id));
  return toCache(cacheKey, { statusCode: 200, headers, body: JSON.stringify(body) });
}

/** Routing-Tabelle: eine neue Version braucht nur einen weiteren Eintrag. */
export const routes: Record<string, ExtRoute<AnyLambdaContext>> = {
  "GET /ext/v1/surveys": list,
  "GET /ext/v1/surveys/{surveyId}": detail,
};

export const handler = (event: AnyApiGwEvent, context?: AnyLambdaContext): Promise<AnyResult> =>
  dispatchExtRoute(routes, event, context, headers, "[surveys_api]");
