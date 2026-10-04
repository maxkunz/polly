import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  getAuthorizationToken,
  getGenesysRegion,
  loadTenantCredentials,
  resolveTenantContext,
} from "../shared/tenant_auth";
import {
  assertSurveyAbsent,
  getClientCredentialsToken,
  isValidSurveyId,
} from "../shared/genesys_survey_check";

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };

type JobStatus = "queued" | "running" | "done" | "aborted" | "failed";

interface DeletionMessage {
  tenantId: string;
  surveyId: string;
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const sqs = new SQSClient({});

const SURVEY_RESPONSES_TABLE_NAME = process.env.SURVEY_RESPONSES_TABLE_NAME ?? "";
const SURVEY_AGGREGATES_TABLE_NAME = process.env.SURVEY_AGGREGATES_TABLE_NAME ?? "";
const SURVEY_DELETION_JOBS_TABLE_NAME = process.env.SURVEY_DELETION_JOBS_TABLE_NAME ?? "";
const SURVEY_DELETION_QUEUE_URL = process.env.SURVEY_DELETION_QUEUE_URL ?? "";

// Wartezeit bis zum ersten Lauf, damit laufende Gespräche ihre Umfrage noch beenden können (SQS-Maximum: 900 s)
const START_DELAY_SECONDS = 900;
const PAGE_SIZE = 100;
const DELETE_PARALLELISM = 10;
const MIN_REMAINING_MS = 60 * 1000;
const MAX_PASSES = 3;
const MAX_RECEIVE_COUNT = 3;

function jsonResponse(statusCode: number, body: unknown): AnyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "OPTIONS,GET,DELETE",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function jobKey(tenantId: string, surveyId: string) {
  return { tenantId, surveyId };
}

async function setJobStatus(
  tenantId: string,
  surveyId: string,
  status: JobStatus,
  message?: string
): Promise<Record<string, any>> {
  // ReturnValues liefert den Gesamtstand des Jobs ohne zusätzliche Leseanfrage (für das Log)
  const result = await ddb.send(
    new UpdateCommand({
      TableName: SURVEY_DELETION_JOBS_TABLE_NAME,
      Key: jobKey(tenantId, surveyId),
      UpdateExpression: "SET #status = :status, #updatedAt = :now, #message = :message",
      ExpressionAttributeNames: { "#status": "status", "#updatedAt": "updatedAt", "#message": "message" },
      ExpressionAttributeValues: {
        ":status": status,
        ":now": new Date().toISOString(),
        ":message": message ?? "",
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return result.Attributes ?? {};
}

async function addJobCounters(
  tenantId: string,
  surveyId: string,
  counters: { deletedResponses?: number; deletedAggregates?: number; skipped?: number }
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: SURVEY_DELETION_JOBS_TABLE_NAME,
      Key: jobKey(tenantId, surveyId),
      UpdateExpression:
        "SET #updatedAt = :now ADD #deletedResponses :dr, #deletedAggregates :da, #skipped :sk",
      ExpressionAttributeNames: {
        "#updatedAt": "updatedAt",
        "#deletedResponses": "deletedResponses",
        "#deletedAggregates": "deletedAggregates",
        "#skipped": "skipped",
      },
      ExpressionAttributeValues: {
        ":now": new Date().toISOString(),
        ":dr": counters.deletedResponses ?? 0,
        ":da": counters.deletedAggregates ?? 0,
        ":sk": counters.skipped ?? 0,
      },
    })
  );
}

async function enqueue(message: DeletionMessage, delaySeconds: number): Promise<void> {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: SURVEY_DELETION_QUEUE_URL,
      MessageBody: JSON.stringify(message),
      DelaySeconds: delaySeconds,
    })
  );
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * DELETE /survey-responses?surveyId=...&datatableId=...
 * Legt einen Lösch-Job an. Gelöscht wird nur, wenn die Umfrage in der Data Table nicht mehr existiert.
 */
async function requestDeletion(event: AnyApiGwEvent, tenantId: string, source: string): Promise<AnyResult> {
  const surveyId = String(event?.queryStringParameters?.surveyId ?? "").trim();
  const datatableId = String(event?.queryStringParameters?.datatableId ?? "").trim();

  if (!isValidSurveyId(surveyId)) {
    return jsonResponse(400, { message: "surveyId must be a valid UUID" });
  }
  if (!datatableId) {
    return jsonResponse(400, { message: "datatableId query parameter is required" });
  }

  const credentials = await loadTenantCredentials(tenantId);
  const dataTableIds = Array.from(new Set([datatableId, ...(credentials?.allowedDataTableIds ?? [])]));

  // Erste Prüfung mit dem Token des Aufrufers (bei M2M-Aufrufen mit den Backend-Credentials)
  let region: string;
  let token: string;
  try {
    if (source === "genesys") {
      region = getGenesysRegion(event);
      token = getAuthorizationToken(event);
    } else if (credentials) {
      region = credentials.region;
      token = await getClientCredentialsToken(region, credentials.clientId, credentials.clientSecret);
    } else {
      return jsonResponse(502, { message: "Cannot verify survey deletion: no Genesys credentials" });
    }
  } catch (err: any) {
    console.error("[survey_responses_delete] token error", err);
    return jsonResponse(502, { message: "Cannot verify survey deletion" });
  }

  const check = await assertSurveyAbsent(region, token, dataTableIds, surveyId);
  if (check.status === "exists") {
    console.warn("[survey_responses_delete] refused, survey exists", { tenantId, surveyId, reason: check.reason });
    return jsonResponse(409, { message: "Survey still exists, results are not deleted", reason: check.reason });
  }
  if (check.status === "error") {
    console.warn("[survey_responses_delete] verification failed", { tenantId, surveyId, reason: check.reason });
    return jsonResponse(502, { message: "Cannot verify that the survey was deleted", reason: check.reason });
  }

  const now = new Date().toISOString();
  try {
    await ddb.send(
      new PutCommand({
        TableName: SURVEY_DELETION_JOBS_TABLE_NAME,
        Item: {
          ...jobKey(tenantId, surveyId),
          status: "queued",
          dataTableIds,
          requestedAt: now,
          updatedAt: now,
          deletedResponses: 0,
          deletedAggregates: 0,
          skipped: 0,
          message: "",
        },
        // Läuft bereits ein Job, wird er nicht doppelt gestartet
        ConditionExpression: "attribute_not_exists(surveyId) OR #status IN (:done, :aborted, :failed)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":done": "done", ":aborted": "aborted", ":failed": "failed" },
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      console.log("[survey_responses_delete] deletion already running", { tenantId, surveyId });
      return jsonResponse(202, { status: "already_running", surveyId });
    }
    throw err;
  }

  try {
    await enqueue({ tenantId, surveyId }, START_DELAY_SECONDS);
  } catch (err: any) {
    console.error("[survey_responses_delete] enqueue failed", err);
    await setJobStatus(tenantId, surveyId, "failed", "Could not enqueue deletion");
    return jsonResponse(502, { message: "Could not start deletion" });
  }

  console.log("[survey_responses_delete] deletion queued", {
    tenantId,
    surveyId,
    dataTableIds,
    startDelaySeconds: START_DELAY_SECONDS,
  });
  return jsonResponse(202, { status: "queued", surveyId });
}

/**
 * GET /survey-responses/delete-status?surveyId=...
 */
async function getDeletionStatus(event: AnyApiGwEvent, tenantId: string): Promise<AnyResult> {
  const surveyId = String(event?.queryStringParameters?.surveyId ?? "").trim();
  if (!isValidSurveyId(surveyId)) {
    return jsonResponse(400, { message: "surveyId must be a valid UUID" });
  }

  const result = await ddb.send(
    new GetCommand({
      TableName: SURVEY_DELETION_JOBS_TABLE_NAME,
      Key: jobKey(tenantId, surveyId),
    })
  );
  if (!result.Item) return jsonResponse(404, { message: "No deletion job found" });
  return jsonResponse(200, { item: result.Item });
}

async function handleHttp(event: AnyApiGwEvent): Promise<AnyResult> {
  const method = event?.requestContext?.http?.method ?? "";
  const path = event?.requestContext?.http?.path ?? event?.rawPath ?? "";

  if (method === "OPTIONS") return jsonResponse(204, "");

  if (!SURVEY_RESPONSES_TABLE_NAME || !SURVEY_AGGREGATES_TABLE_NAME || !SURVEY_DELETION_JOBS_TABLE_NAME || !SURVEY_DELETION_QUEUE_URL) {
    return jsonResponse(500, { message: "Survey deletion not configured" });
  }

  const { context, error } = await resolveTenantContext(event, { requireApproved: true });
  if (error || !context?.tenantId) {
    return jsonResponse(401, { message: error ?? "Unauthorized" });
  }

  try {
    if (method === "DELETE" && path === "/survey-responses") {
      return await requestDeletion(event, context.tenantId, context.source);
    }
    if (method === "GET" && path === "/survey-responses/delete-status") {
      return await getDeletionStatus(event, context.tenantId);
    }
    return jsonResponse(404, { message: "Not found", method, path });
  } catch (err) {
    console.error("[survey_responses_delete] unhandled error", err);
    return jsonResponse(500, { message: "Internal error" });
  }
}

// ---------------------------------------------------------------------------
// SQS-Worker
// ---------------------------------------------------------------------------

async function deleteInChunks(items: Array<() => Promise<boolean>>): Promise<{ deleted: number; skipped: number }> {
  let deleted = 0;
  let skipped = 0;
  for (let i = 0; i < items.length; i += DELETE_PARALLELISM) {
    const results = await Promise.all(items.slice(i, i + DELETE_PARALLELISM).map((fn) => fn()));
    for (const wasDeleted of results) {
      if (wasDeleted) deleted++;
      else skipped++;
    }
  }
  return { deleted, skipped };
}

/** Bedingtes Löschen: nur wenn das Item tatsächlich zu diesem Mandanten und dieser Umfrage gehört. */
async function deleteConditionally(
  tableName: string,
  key: Record<string, string>,
  tenantId: string,
  surveyId: string
): Promise<boolean> {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: tableName,
        Key: key,
        ConditionExpression: "#tenantId = :tenantId AND #surveyId = :surveyId",
        ExpressionAttributeNames: { "#tenantId": "tenantId", "#surveyId": "surveyId" },
        ExpressionAttributeValues: { ":tenantId": tenantId, ":surveyId": surveyId },
      })
    );
    return true;
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

type PassResult = { complete: boolean; deleted: number; skipped: number };

/** Ein Durchlauf über alle Aggregate der Umfrage. Gibt false zurück, wenn die Zeit knapp wird. */
async function deleteAggregatesPass(
  tenantId: string,
  surveyId: string,
  getRemainingMs: () => number
): Promise<PassResult> {
  let lastKey: Record<string, any> | undefined;
  let total = 0;
  let totalSkipped = 0;
  do {
    if (getRemainingMs() < MIN_REMAINING_MS) return { complete: false, deleted: total, skipped: totalSkipped };

    const page = await ddb.send(
      new QueryCommand({
        TableName: SURVEY_AGGREGATES_TABLE_NAME,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": "tenantSurveyId" },
        ExpressionAttributeValues: { ":pk": `${tenantId}#${surveyId}` },
        ProjectionExpression: "tenantSurveyId, questionName",
        Limit: PAGE_SIZE,
        ExclusiveStartKey: lastKey,
      })
    );
    const { deleted, skipped } = await deleteInChunks(
      (page.Items ?? []).map((item) => () =>
        deleteConditionally(
          SURVEY_AGGREGATES_TABLE_NAME,
          { tenantSurveyId: item.tenantSurveyId, questionName: item.questionName },
          tenantId,
          surveyId
        )
      )
    );
    total += deleted;
    totalSkipped += skipped;
    await addJobCounters(tenantId, surveyId, { deletedAggregates: deleted, skipped });
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return { complete: true, deleted: total, skipped: totalSkipped };
}

/** Ein Durchlauf über alle Sessions der Umfrage (GSI byTenantSurvey). */
async function deleteResponsesPass(
  tenantId: string,
  surveyId: string,
  getRemainingMs: () => number
): Promise<PassResult> {
  let lastKey: Record<string, any> | undefined;
  let total = 0;
  let totalSkipped = 0;
  do {
    if (getRemainingMs() < MIN_REMAINING_MS) return { complete: false, deleted: total, skipped: totalSkipped };

    const page = await ddb.send(
      new QueryCommand({
        TableName: SURVEY_RESPONSES_TABLE_NAME,
        IndexName: "byTenantSurvey",
        KeyConditionExpression: "#tenantId = :tenantId AND begins_with(#sk, :prefix)",
        ExpressionAttributeNames: { "#tenantId": "tenantId", "#sk": "surveyStartedAt" },
        ExpressionAttributeValues: { ":tenantId": tenantId, ":prefix": `${surveyId}#` },
        Limit: PAGE_SIZE,
        ExclusiveStartKey: lastKey,
      })
    );
    const { deleted, skipped } = await deleteInChunks(
      (page.Items ?? []).map((item) => () =>
        deleteConditionally(
          SURVEY_RESPONSES_TABLE_NAME,
          { tenantId: item.tenantId, responseId: item.responseId },
          tenantId,
          surveyId
        )
      )
    );
    total += deleted;
    totalSkipped += skipped;
    await addJobCounters(tenantId, surveyId, { deletedResponses: deleted, skipped });
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return { complete: true, deleted: total, skipped: totalSkipped };
}

async function processMessage(message: DeletionMessage, getRemainingMs: () => number): Promise<void> {
  const { tenantId, surveyId } = message;
  if (!tenantId || !isValidSurveyId(surveyId)) {
    console.error("[survey_responses_delete] invalid message", message);
    return;
  }

  const jobResult = await ddb.send(
    new GetCommand({ TableName: SURVEY_DELETION_JOBS_TABLE_NAME, Key: jobKey(tenantId, surveyId) })
  );
  const job = jobResult.Item;
  if (!job || (job.status !== "queued" && job.status !== "running")) {
    console.log("[survey_responses_delete] nothing to do", { tenantId, surveyId, status: job?.status });
    return;
  }

  await setJobStatus(tenantId, surveyId, "running");
  console.log("[survey_responses_delete] worker started", {
    tenantId,
    surveyId,
    previousStatus: job.status,
    requestedAt: job.requestedAt,
  });

  // Zweite, unabhängige Prüfung unmittelbar vor dem Löschen (Backend-Credentials des Mandanten)
  const credentials = await loadTenantCredentials(tenantId);
  if (!credentials) {
    console.warn("[survey_responses_delete] aborted, no Genesys credentials", { tenantId, surveyId });
    await setJobStatus(tenantId, surveyId, "aborted", "No Genesys credentials, nothing deleted");
    return;
  }
  const token = await getClientCredentialsToken(credentials.region, credentials.clientId, credentials.clientSecret);
  const check = await assertSurveyAbsent(
    credentials.region,
    token,
    Array.isArray(job.dataTableIds) ? job.dataTableIds : [],
    surveyId
  );
  if (check.status === "exists") {
    console.warn("[survey_responses_delete] aborted, survey exists", { tenantId, surveyId, reason: check.reason });
    await setJobStatus(tenantId, surveyId, "aborted", check.reason);
    return;
  }
  if (check.status === "error") {
    // Wird von SQS wiederholt; nichts gelöscht
    throw new Error(`Verification failed: ${check.reason}`);
  }

  console.log("[survey_responses_delete] verification passed, deleting", { tenantId, surveyId });

  // Zähler dieses Laufs (der Gesamtstand über alle Läufe steht im Job)
  const run = { deletedResponses: 0, deletedAggregates: 0, skipped: 0 };

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const aggregates = await deleteAggregatesPass(tenantId, surveyId, getRemainingMs);
    const responses: PassResult = aggregates.complete
      ? await deleteResponsesPass(tenantId, surveyId, getRemainingMs)
      : { complete: false, deleted: 0, skipped: 0 };

    run.deletedAggregates += aggregates.deleted;
    run.deletedResponses += responses.deleted;
    run.skipped += aggregates.skipped + responses.skipped;

    if (!aggregates.complete || !responses.complete) {
      // Zeit knapp: Fortsetzung in einer neuen Nachricht, Fortschritt steht im Job
      await enqueue({ tenantId, surveyId }, 0);
      console.log("[survey_responses_delete] time budget reached, continuing in new run", { tenantId, surveyId, run });
      return;
    }
    // Ein Durchlauf ohne Löschungen bestätigt, dass nichts mehr (eventually consistent) nachkommt
    if (aggregates.deleted === 0 && responses.deleted === 0) {
      const finalJob = await setJobStatus(tenantId, surveyId, "done");
      console.log("[survey_responses_delete] deletion done", {
        tenantId,
        surveyId,
        run,
        total: {
          deletedResponses: finalJob.deletedResponses ?? 0,
          deletedAggregates: finalJob.deletedAggregates ?? 0,
          skipped: finalJob.skipped ?? 0,
        },
        requestedAt: finalJob.requestedAt,
      });
      return;
    }
  }

  // Immer noch Treffer nach mehreren Durchläufen: erneut einreihen
  await enqueue({ tenantId, surveyId }, 30);
  console.log("[survey_responses_delete] items still appearing, re-queued", { tenantId, surveyId, run });
}

async function handleSqs(event: any, context: any): Promise<void> {
  const getRemainingMs = () => context.getRemainingTimeInMillis();
  for (const record of event.Records) {
    let message: DeletionMessage;
    try {
      message = JSON.parse(record.body);
    } catch {
      console.error("[survey_responses_delete] unparsable message", record.messageId);
      continue;
    }
    try {
      await processMessage(message, getRemainingMs);
    } catch (err: any) {
      const receiveCount = Number(record.attributes?.ApproximateReceiveCount ?? 1);
      console.error("[survey_responses_delete] run failed", {
        tenantId: message?.tenantId,
        surveyId: message?.surveyId,
        receiveCount,
        willRetry: receiveCount < MAX_RECEIVE_COUNT,
        error: String(err?.message ?? err),
      });
      if (receiveCount >= MAX_RECEIVE_COUNT && message?.tenantId && isValidSurveyId(message?.surveyId)) {
        await setJobStatus(message.tenantId, message.surveyId, "failed", String(err?.message ?? err)).catch(() => {});
      }
      throw err;
    }
  }
}

export const handler = async (event: any, context: any): Promise<any> => {
  if (Array.isArray(event?.Records)) {
    return await handleSqs(event, context);
  }
  return await handleHttp(event);
};
