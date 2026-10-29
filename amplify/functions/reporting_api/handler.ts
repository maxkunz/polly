import { compareAnswerRecords, sessionToAnswerRecords } from "../shared/answer_records";
import type { AnswerRecord } from "../shared/answer_records";
import { resolveApiClient } from "../shared/api_client_auth";
import { dispatchExtRoute, extError, extHeaders } from "../shared/ext_http";
import type { ExtResult, ExtRoute } from "../shared/ext_http";
import { createSummary, openSlices, summarizeSlices } from "../shared/session_summary";
import { isSurveyBeingDeleted, loadSurveyAggregates } from "../shared/survey_results";
import { iterateSessions, SessionReadAbortedError } from "../shared/survey_sessions";
import { paginate } from "./pagination";
import * as v1 from "./v1";

type AnyApiGwEvent = any;
type AnyLambdaContext = { getRemainingTimeInMillis: () => number };
type AnyResult = ExtResult;

// Die HTTP API bricht nach 30 s ab: vorher mit 413 im dokumentierten Fehlerformat antworten.
// Reserve für Sortieren, Serialisieren und die letzte DynamoDB-Seite.
const MIN_REMAINING_MS = 6000;

const headers = extHeaders("GET");

function errorResponse(statusCode: number, error: string, message: string): AnyResult {
  return extError(headers, statusCode, error, message);
}

async function data(event: AnyApiGwEvent, context?: AnyLambdaContext): Promise<AnyResult> {
  const auth = await resolveApiClient(event, "polly-api/reporting.read");
  if (!auth.ok) return errorResponse(auth.statusCode, auth.error, auth.message);

  const parsed = v1.parseV1DataParams(event?.queryStringParameters);
  if (!parsed.ok) return errorResponse(400, "invalid_request", parsed.message);
  const { params } = parsed;

  const records: AnswerRecord[] = [];
  let sessions = 0;
  const canContinue = () => !context || context.getRemainingTimeInMillis() >= MIN_REMAINING_MS;
  try {
    for await (const { session } of iterateSessions(auth.tenantId, params, canContinue)) {
      sessions += 1;
      if (sessions > v1.MAX_SESSIONS) {
        return errorResponse(
          413,
          "range_too_large",
          `The range contains more than ${v1.MAX_SESSIONS} sessions, please choose a shorter range`,
        );
      }
      records.push(...sessionToAnswerRecords(session));
    }
  } catch (error) {
    if (!(error instanceof SessionReadAbortedError)) throw error;
    console.warn("[reporting_api] Zeitbudget erschöpft", { tenantId: auth.tenantId, surveyId: params.surveyId, sessions });
    return errorResponse(413, "range_too_large", "The range could not be read in time, please choose a shorter range");
  }
  records.sort(compareAnswerRecords);

  const { items, pageInfo } = paginate(records, params.page, params.limit);

  // Keine Antwortinhalte im Protokoll
  console.log("[reporting_api] data", {
    clientId: auth.clientId,
    tenantId: auth.tenantId,
    surveyId: params.surveyId,
    from: params.fromIso,
    to: params.toIso,
    version: params.version,
    page: params.page,
    limit: params.limit,
    sessions,
    total: pageInfo.total,
  });

  const body = JSON.stringify(v1.buildV1DataResponse(items, pageInfo));
  if (Buffer.byteLength(body, "utf8") > v1.MAX_RESPONSE_BYTES) {
    return errorResponse(413, "page_too_large", "The page is too large, please choose a smaller limit");
  }
  return { statusCode: 200, headers, body };
}

async function summary(event: AnyApiGwEvent, context?: AnyLambdaContext): Promise<AnyResult> {
  const auth = await resolveApiClient(event, "polly-api/reporting.read");
  if (!auth.ok) return errorResponse(auth.statusCode, auth.error, auth.message);

  const parsed = v1.parseV1SummaryParams(event?.queryStringParameters);
  if (!parsed.ok) return errorResponse(400, "invalid_request", parsed.message);
  const { params } = parsed;

  const canContinue = () => !context || context.getRemainingTimeInMillis() >= MIN_REMAINING_MS;
  const counts = createSummary();
  const results = await summarizeSlices(
    auth.tenantId,
    params.surveyId,
    openSlices(params.fromIso, params.toIso),
    counts,
    canContinue,
    { version: params.version, withChannels: true },
  );
  // Ohne Cursor gibt es kein Fortsetzen: ein unfertiger Abschnitt hieße eine zu niedrige Zählung
  if (results.some((slice) => !slice.done)) {
    console.warn("[reporting_api] Zeitbudget erschöpft", { tenantId: auth.tenantId, surveyId: params.surveyId });
    return errorResponse(413, "range_too_large", "The range could not be read in time, please choose a shorter range");
  }

  // Keine Antwortinhalte im Protokoll
  console.log("[reporting_api] summary", {
    clientId: auth.clientId,
    tenantId: auth.tenantId,
    surveyId: params.surveyId,
    from: params.fromIso,
    to: params.toIso,
    version: params.version,
    sessions: counts.sessions,
  });

  return { statusCode: 200, headers, body: JSON.stringify(v1.toV1Summary(params, counts)) };
}

async function aggregates(event: AnyApiGwEvent): Promise<AnyResult> {
  const auth = await resolveApiClient(event, "polly-api/reporting.read");
  if (!auth.ok) return errorResponse(auth.statusCode, auth.error, auth.message);

  const parsed = v1.parseV1AggregatesParams(event?.queryStringParameters);
  if (!parsed.ok) return errorResponse(400, "invalid_request", parsed.message);
  const { surveyId } = parsed;

  // Beide Lesezugriffe parallel; nach dem Löschen der Umfrage sollen keine Restwerte mehr erscheinen
  const [deleting, items] = await Promise.all([
    isSurveyBeingDeleted(auth.tenantId, surveyId),
    loadSurveyAggregates(auth.tenantId, surveyId),
  ]);
  if (deleting) return errorResponse(404, "not_found", "Survey not found");

  // Keine Antwortinhalte im Protokoll
  console.log("[reporting_api] aggregates", {
    clientId: auth.clientId,
    tenantId: auth.tenantId,
    surveyId,
    questions: items.length,
  });

  return { statusCode: 200, headers, body: JSON.stringify(v1.toV1Aggregates(surveyId, items)) };
}

/** Routing-Tabelle: eine neue Version braucht nur einen weiteren Eintrag. */
export const routes: Record<string, ExtRoute<AnyLambdaContext>> = {
  "GET /ext/v1/reporting/data": data,
  "GET /ext/v1/reporting/summary": summary,
  "GET /ext/v1/reporting/aggregates": aggregates,
};

export const handler = (event: AnyApiGwEvent, context?: AnyLambdaContext): Promise<AnyResult> =>
  dispatchExtRoute(routes, event, context, headers, "[reporting_api]");
