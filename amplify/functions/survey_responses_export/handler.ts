import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { resolveTenantContext } from "../shared/tenant_auth";
import { CSV_HEADER, sessionToCsvRows, type ExportSession } from "./csv";
import { addToSummary, createSummary, type ExportSummary } from "./summary";

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

// Anzahl paralleler Zeitabschnitte für die Vorschau (siehe exportSummary). Bei 100.000+ Sessions
// dauerte die bisherige sequenzielle Abfrage ca. 16 s; mit parallelen Teilbereichen laufen die
// Query-Aufrufe gleichzeitig statt nacheinander.
const SUMMARY_SLICE_COUNT = Number(process.env.SUMMARY_SLICE_COUNT ?? 10);

// Für die Vorschau genügen Status und Version (siehe addToSummary). Die answers-Maps werden bewusst
// nicht gelesen: ihr Unmarshalling war bei 100.000+ Sessions der Hauptteil der Laufzeit.
const SUMMARY_NAMES: Record<string, string> = {
  "#tenantId": "tenantId",
  "#sk": "surveyStartedAt",
  "#status": "status",
  "#surveyVersion": "surveyVersion",
};
const SUMMARY_PROJECTION = "#status, #surveyVersion";

interface SummarySlice {
  from: string;
  to: string;
  startKey?: Record<string, any>;
  done: boolean;
}

/**
 * Teilt [fromIso, toIso] in bis zu `count` lückenlose, nicht überlappende Zeitabschnitte (auf
 * Millisekunden-Basis), damit die Vorschau mehrere Query-Aufrufe parallel statt nacheinander
 * ausführen kann. Bei sehr kurzen Zeiträumen (weniger Millisekunden als `count`) entstehen
 * entsprechend weniger, aber immer gültige (nicht-leere) Abschnitte.
 */
export function buildTimeSlices(fromIso: string, toIso: string, count: number): { from: string; to: string }[] {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  // Anzahl Millisekunden im (inklusiven) Zeitraum; exakte Integer-Aufteilung statt proportionaler
  // Rundung, damit bei sehr kurzen Zeiträumen keine zwei Grenzen zusammenfallen (leerer/ungültiger
  // Abschnitt mit from > to).
  const totalMs = toMs - fromMs + 1;
  const sliceCount = Math.max(1, Math.min(count, totalMs));
  const baseLength = Math.floor(totalMs / sliceCount);
  const remainder = totalMs % sliceCount;

  const slices: { from: string; to: string }[] = [];
  let start = fromMs;
  for (let i = 0; i < sliceCount; i++) {
    const length = baseLength + (i < remainder ? 1 : 0);
    const end = start + length - 1;
    slices.push({ from: new Date(start).toISOString(), to: new Date(end).toISOString() });
    start = end + 1;
  }
  return slices;
}

function encodeSummaryCursor(tenantId: string, surveyId: string, slices: SummarySlice[]): string {
  return encodeCursor({ tenantId, surveyId, slices });
}

/** Wie beim CSV-Cursor an Mandant und Umfrage gebunden; ein fremder/manipulierter Cursor wird abgelehnt. */
function parseSummaryCursor(raw: string, tenantId: string, surveyId: string): SummarySlice[] | null {
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || payload.tenantId !== tenantId || payload.surveyId !== surveyId || !Array.isArray(payload.slices)) {
    return null;
  }
  for (const slice of payload.slices) {
    if (typeof slice?.from !== "string" || typeof slice?.to !== "string" || typeof slice?.done !== "boolean") {
      return null;
    }
  }
  return payload.slices as SummarySlice[];
}

/**
 * Liest einen Zeitabschnitt der Vorschau zu Ende (oder bis das Zeitbudget ausgeht) und zählt die
 * Sessions direkt in `summary` ein. `summary` wird parallel von mehreren Slices mutiert; das ist
 * unkritisch, weil addToSummary synchron läuft und zwischen den Items keine await-Punkte liegen –
 * die JS-Event-Loop unterbricht also nie mitten in einem Zähl-Durchlauf.
 */
async function processSlice(
  tenantId: string,
  surveyId: string,
  slice: SummarySlice,
  summary: ExportSummary,
  lambdaContext: AnyLambdaContext,
): Promise<SummarySlice> {
  if (slice.done) return slice;

  let startKey = slice.startKey;
  while (lambdaContext.getRemainingTimeInMillis() >= MIN_REMAINING_MS) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: SURVEY_RESPONSES_TABLE_NAME,
        IndexName: "byTenantSurvey",
        KeyConditionExpression: "#tenantId = :tenantId AND #sk BETWEEN :from AND :to",
        ExpressionAttributeNames: SUMMARY_NAMES,
        ExpressionAttributeValues: {
          ":tenantId": tenantId,
          ":from": `${surveyId}#${slice.from}`,
          ":to": `${surveyId}#${slice.to}`,
        },
        ProjectionExpression: SUMMARY_PROJECTION,
        Limit: PAGE_SIZE,
        ScanIndexForward: true,
        ExclusiveStartKey: startKey,
      }),
    );

    for (const item of result.Items ?? []) {
      addToSummary(summary, item as ExportSession);
    }

    startKey = result.LastEvaluatedKey;
    if (!startKey) {
      return { from: slice.from, to: slice.to, done: true };
    }
  }

  return { from: slice.from, to: slice.to, startKey, done: false };
}

/**
 * GET /survey-responses/export/summary?surveyId&from&to[&cursor]
 * Teil-Aggregate (Sessions, Status, Versionen); version wird bewusst ignoriert,
 * damit der Versionsfilter im Frontend immer alle Versionen anbieten kann.
 *
 * Fragt den Zeitraum in SUMMARY_SLICE_COUNT parallelen Abschnitten ab (statt einer einzigen
 * sequenziellen Abfrage über den gesamten Zeitraum) – das verkürzt die Laufzeit bei großen
 * Datenmengen etwa um den Faktor der Slice-Anzahl. Reicht das Zeitbudget nicht für alle
 * Abschnitte, trägt jeder unfertige Abschnitt seinen eigenen Fortsetzungs-Key im Cursor; bereits
 * fertige Abschnitte werden beim nächsten Aufruf übersprungen statt erneut gelesen.
 */
async function exportSummary(
  event: AnyApiGwEvent,
  tenantId: string,
  lambdaContext: AnyLambdaContext,
): Promise<AnyResult> {
  const query = event?.queryStringParameters ?? {};
  const surveyId = String(query.surveyId ?? "").trim();
  if (!surveyId) {
    return jsonResponse(400, { message: "surveyId query parameter is required" });
  }

  const fromIso = toIso(query.from);
  const toIsoValue = toIso(query.to);
  if (!fromIso || !toIsoValue) {
    return jsonResponse(400, { message: "from and to must be valid ISO dates" });
  }
  if (fromIso > toIsoValue) {
    return jsonResponse(400, { message: "from must not be after to" });
  }

  let slices: SummarySlice[];
  if (query.cursor) {
    const parsed = parseSummaryCursor(String(query.cursor), tenantId, surveyId);
    if (!parsed) return jsonResponse(400, { message: "Invalid cursor" });
    slices = parsed;
  } else {
    slices = buildTimeSlices(fromIso, toIsoValue, SUMMARY_SLICE_COUNT).map((range) => ({ ...range, done: false }));
  }

  const summary = createSummary();
  const updatedSlices = await Promise.all(
    slices.map((slice) => processSlice(tenantId, surveyId, slice, summary, lambdaContext)),
  );

  const stillOpen = updatedSlices.some((slice) => !slice.done);
  const nextCursor = stillOpen ? encodeSummaryCursor(tenantId, surveyId, updatedSlices) : null;

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
