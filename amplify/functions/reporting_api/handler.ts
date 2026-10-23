import { compareAnswerRecords, sessionToAnswerRecords } from "../shared/answer_records";
import type { AnswerRecord } from "../shared/answer_records";
import { resolveApiClient } from "../shared/api_client_auth";
import { iterateSessions, SessionReadAbortedError } from "../shared/survey_sessions";
import { paginate } from "./pagination";
import * as v1 from "./v1";

type AnyApiGwEvent = any;
type AnyLambdaContext = { getRemainingTimeInMillis: () => number };
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };

// Die HTTP API bricht nach 30 s ab: vorher mit 413 im dokumentierten Fehlerformat antworten.
// Reserve für Sortieren, Serialisieren und die letzte DynamoDB-Seite.
const MIN_REMAINING_MS = 6000;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "OPTIONS,GET",
};

function json(statusCode: number, body: unknown): AnyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function errorResponse(statusCode: number, error: string, message: string): AnyResult {
  return json(statusCode, { error, message });
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

/** Routing-Tabelle: eine neue Version braucht nur einen weiteren Eintrag. */
export const routes: Record<string, (event: AnyApiGwEvent, context?: AnyLambdaContext) => Promise<AnyResult>> = {
  "GET /ext/v1/reporting/data": data,
};

export const handler = async (event: AnyApiGwEvent, context?: AnyLambdaContext): Promise<AnyResult> => {
  const route = routes[event?.routeKey ?? ""];
  if (!route) return errorResponse(404, "not_found", "Route not found");
  try {
    return await route(event, context);
  } catch (error) {
    console.error("[reporting_api] Unhandled error", error);
    return errorResponse(500, "internal_error", "Internal error");
  }
};
