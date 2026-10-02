import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { resolveTenantContext } from "../shared/tenant_auth";
import { CSV_HEADER, sessionToCsvRows, type ExportSession } from "./csv";
import { addToSummary, createSummary } from "./summary";

type AnyApiGwEvent = any;
type AnyLambdaContext = { getRemainingTimeInMillis: () => number };
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SURVEY_RESPONSES_TABLE_NAME = process.env.SURVEY_RESPONSES_TABLE_NAME ?? "";

// Lambda-Antworten hinter API Gateway sind auf 6 MB begrenzt, daher Teilabrufe mit Größenbudget.
const CHUNK_BYTES = Number(process.env.EXPORT_CHUNK_BYTES ?? 4 * 1024 * 1024);
// Die HTTP API bricht nach 30 s ab: nach Ablauf des Zeitbudgets wird das Teilstück abgeschlossen.
const MIN_REMAINING_MS = 9000;
const PAGE_SIZE = 200;

const EXPOSED_HEADERS = "x-next-cursor,x-sessions,x-rows,content-disposition";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "OPTIONS,GET",
  "Access-Control-Expose-Headers": EXPOSED_HEADERS,
};

function jsonResponse(statusCode: number, body: unknown): AnyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...baseHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

interface ExportParams {
  surveyId: string;
  fromIso: string;
  toIso: string;
  version?: number;
  exclusiveStartKey?: Record<string, any>;
}

type ParseResult = { params: ExportParams } | { error: AnyResult };

function toIso(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function parseParams(event: AnyApiGwEvent, tenantId: string): ParseResult {
  const query = event?.queryStringParameters ?? {};

  const surveyId = String(query.surveyId ?? "").trim();
  if (!surveyId) {
    return { error: jsonResponse(400, { message: "surveyId query parameter is required" }) };
  }

  const fromIso = toIso(query.from);
  const toIsoValue = toIso(query.to);
  if (!fromIso || !toIsoValue) {
    return { error: jsonResponse(400, { message: "from and to must be valid ISO dates" }) };
  }
  if (fromIso > toIsoValue) {
    return { error: jsonResponse(400, { message: "from must not be after to" }) };
  }

  let version: number | undefined;
  if (query.version !== undefined && String(query.version).trim() !== "") {
    version = Number(query.version);
    if (!Number.isInteger(version)) {
      return { error: jsonResponse(400, { message: "version must be an integer" }) };
    }
  }

  let exclusiveStartKey: Record<string, any> | undefined;
  if (query.cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(String(query.cursor), "base64").toString("utf8"));
    } catch {
      return { error: jsonResponse(400, { message: "Invalid cursor" }) };
    }
    // Der Cursor darf nicht für fremde Mandanten oder Umfragen missbraucht werden.
    if (
      !exclusiveStartKey ||
      exclusiveStartKey.tenantId !== tenantId ||
      typeof exclusiveStartKey.responseId !== "string" ||
      typeof exclusiveStartKey.surveyStartedAt !== "string" ||
      !exclusiveStartKey.surveyStartedAt.startsWith(`${surveyId}#`)
    ) {
      return { error: jsonResponse(400, { message: "Invalid cursor" }) };
    }
  }

  return { params: { surveyId, fromIso, toIso: toIsoValue, version, exclusiveStartKey } };
}

/**
 * Liefert die Sessions im Zeitraum aufsteigend nach Session-Start (GSI byTenantSurvey).
 * Blättert intern über LastEvaluatedKey.
 */
async function* iterateSessions(
  tenantId: string,
  params: ExportParams,
): AsyncGenerator<{ session: ExportSession; key: Record<string, any> }> {
  const names: Record<string, string> = {
    "#tenantId": "tenantId",
    "#sk": "surveyStartedAt",
    "#responseId": "responseId",
    "#surveyName": "surveyName",
    "#surveyVersion": "surveyVersion",
    "#status": "status",
    "#answers": "answers",
  };
  const values: Record<string, any> = {
    ":tenantId": tenantId,
    ":from": `${params.surveyId}#${params.fromIso}`,
    ":to": `${params.surveyId}#${params.toIso}`,
  };

  let filterExpression: string | undefined;
  if (params.version !== undefined) {
    filterExpression = "#surveyVersion = :version";
    values[":version"] = params.version;
  }

  const projection = [
    "#tenantId",
    "#sk",
    "#responseId",
    "#surveyName",
    "#surveyVersion",
    "#status",
    "#answers",
  ];

  let startKey = params.exclusiveStartKey;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: SURVEY_RESPONSES_TABLE_NAME,
        IndexName: "byTenantSurvey",
        KeyConditionExpression: "#tenantId = :tenantId AND #sk BETWEEN :from AND :to",
        FilterExpression: filterExpression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ProjectionExpression: projection.join(", "),
        Limit: PAGE_SIZE,
        ScanIndexForward: true,
        ExclusiveStartKey: startKey,
      }),
    );

    for (const item of result.Items ?? []) {
      yield {
        session: item as ExportSession,
        key: {
          tenantId: item.tenantId,
          responseId: item.responseId,
          surveyStartedAt: item.surveyStartedAt,
        },
      };
    }
    startKey = result.LastEvaluatedKey;
  } while (startKey);
}

function encodeCursor(key: Record<string, any>): string {
  return Buffer.from(JSON.stringify(key)).toString("base64");
}

/**
 * Cursor zum Fortsetzen nach einem Abbruch wegen Budget. Wurde in diesem Teilabruf noch nichts
 * verarbeitet, bleibt der eingehende Cursor bestehen (statt die Daten stillschweigend abzuschneiden).
 */
function resumeCursor(lastKey: Record<string, any> | undefined, params: ExportParams): string | null {
  const key = lastKey ?? params.exclusiveStartKey;
  return key ? encodeCursor(key) : null;
}

/**
 * GET /survey-responses/export?surveyId&from&to[&version][&cursor]
 * Liefert ein Teilstück der CSV; bei vorhandenem Header x-next-cursor muss der Aufrufer fortsetzen.
 * Die Kopfzeile steht nur im ersten Teilstück (ohne cursor).
 */
async function exportCsv(
  event: AnyApiGwEvent,
  tenantId: string,
  lambdaContext: AnyLambdaContext,
): Promise<AnyResult> {
  const parsed = parseParams(event, tenantId);
  if ("error" in parsed) return parsed.error;
  const { params } = parsed;

  const lines: string[] = [];
  if (!params.exclusiveStartKey) lines.push(CSV_HEADER);

  let bytes = 0;
  let sessions = 0;
  let rows = 0;
  let lastKey: Record<string, any> | undefined;
  let nextCursor: string | null = null;

  for await (const { session, key } of iterateSessions(tenantId, params)) {
    if (bytes >= CHUNK_BYTES || lambdaContext.getRemainingTimeInMillis() < MIN_REMAINING_MS) {
      nextCursor = resumeCursor(lastKey, params);
      break;
    }
    const sessionRows = sessionToCsvRows(session);
    for (const row of sessionRows) {
      lines.push(row);
      bytes += Buffer.byteLength(row) + 2;
    }
    sessions += 1;
    rows += sessionRows.length;
    lastKey = key;
  }

  const body = lines.length > 0 ? lines.join("\r\n") + "\r\n" : "";
  const headers: Record<string, string> = {
    ...baseHeaders,
    "Content-Type": "text/csv; charset=utf-8",
    "x-sessions": String(sessions),
    "x-rows": String(rows),
  };
  if (nextCursor) headers["x-next-cursor"] = nextCursor;

  return { statusCode: 200, headers, body };
}

/**
 * GET /survey-responses/export/summary?surveyId&from&to[&cursor]
 * Teil-Aggregate (Sessions, Antworten, Status, Versionen); version wird bewusst ignoriert,
 * damit der Versionsfilter im Frontend immer alle Versionen anbieten kann.
 */
async function exportSummary(
  event: AnyApiGwEvent,
  tenantId: string,
  lambdaContext: AnyLambdaContext,
): Promise<AnyResult> {
  const parsed = parseParams(event, tenantId);
  if ("error" in parsed) return parsed.error;
  const params: ExportParams = { ...parsed.params, version: undefined };

  const summary = createSummary();
  let lastKey: Record<string, any> | undefined;
  let nextCursor: string | null = null;

  for await (const { session, key } of iterateSessions(tenantId, params)) {
    if (lambdaContext.getRemainingTimeInMillis() < MIN_REMAINING_MS) {
      nextCursor = resumeCursor(lastKey, params);
      break;
    }
    addToSummary(summary, session);
    lastKey = key;
  }

  return jsonResponse(200, { ...summary, nextCursor });
}

export const handler = async (
  event: AnyApiGwEvent,
  lambdaContext: AnyLambdaContext,
): Promise<AnyResult> => {
  const method = event?.requestContext?.http?.method ?? "";
  const path = event?.requestContext?.http?.path ?? event?.rawPath ?? "";

  if (method === "OPTIONS") {
    return jsonResponse(204, "");
  }

  const { context, error } = await resolveTenantContext(event, { requireApproved: true });
  if (error || !context?.tenantId) {
    return jsonResponse(401, { message: error ?? "Unauthorized" });
  }

  if (!SURVEY_RESPONSES_TABLE_NAME) {
    return jsonResponse(500, { message: "SURVEY_RESPONSES_TABLE_NAME not configured" });
  }

  try {
    if (method === "GET" && path === "/survey-responses/export") {
      return await exportCsv(event, context.tenantId, lambdaContext);
    }
    if (method === "GET" && path === "/survey-responses/export/summary") {
      return await exportSummary(event, context.tenantId, lambdaContext);
    }
    return jsonResponse(404, { message: "Not found", method, path });
  } catch (err) {
    console.error("[survey_responses_export] unhandled error", err);
    return jsonResponse(500, { message: "Internal error" });
  }
};
