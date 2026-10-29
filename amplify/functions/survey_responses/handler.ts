import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { resolveTenantContext } from "../shared/tenant_auth";
import { isSurveyBeingDeleted, updateSurveyAggregate } from "../shared/survey_results";
import { checkSurveyExists } from "../shared/genesys_survey_check";
import { isValidSurveyId } from "../shared/survey_id";
import { toSurveyVersion } from "../shared/answer_records";

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };
type RouteHandler = (event: AnyApiGwEvent, tenantId: string) => Promise<AnyResult>;
type RouteKey = `${string} ${string}`;

interface SubmitSurveyAnswerBody {
  conversationId: string;
  surveyId: string;
  surveyName?: string;
  surveyVersion?: number | string;
  questionName?: string;
  questionType?: "rating" | "nps" | "choice" | "yes_no" | "comment" | string;
  value?: any;
  isCompleted?: boolean;
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const SURVEY_RESPONSES_TABLE_NAME = process.env.SURVEY_RESPONSES_TABLE_NAME ?? "";
const SURVEY_AGGREGATES_TABLE_NAME = process.env.SURVEY_AGGREGATES_TABLE_NAME ?? "";

function jsonResponse(statusCode: number, body: unknown): AnyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

/**
 * Aktualisiert das Session-Item in SurveyResponsesTable.
 */
async function upsertSurveyResponse(
  tenantId: string,
  body: SubmitSurveyAnswerBody,
  now: string
) {
  const {
    conversationId,
    surveyId,
    surveyName = "",
    questionName,
    questionType,
    value,
    isCompleted = false,
  } = body;

  // Immer als Zahl speichern (fehlend → 1, Ganzzahl-String aus der Data Action → Zahl), sonst findet der Versionsfilter sie nicht
  const surveyVersion = toSurveyVersion(body.surveyVersion);
  const hasAnswer = Boolean(questionName && value !== undefined);
  const statusToSet = isCompleted ? "completed" : undefined;

  const answerPayload = hasAnswer
    ? {
        type: questionType ?? "unknown",
        value,
        answeredAt: now,
      }
    : null;

  // Helper zum Ausführen des Updates
  const executeUpdate = async (withNestedAnswer: boolean, withInitAnswer: boolean) => {
    let updateExp = "SET #updatedAt = :now, #surveyId = :surveyId, #surveyName = :surveyName, #surveyVersion = :surveyVersion, #startedAt = if_not_exists(#startedAt, :now), #surveyStartedAt = if_not_exists(#surveyStartedAt, :surveyStartedAt)";
    
    const expNames: Record<string, string> = {
      "#updatedAt": "updatedAt",
      "#surveyId": "surveyId",
      "#surveyName": "surveyName",
      "#surveyVersion": "surveyVersion",
      "#startedAt": "startedAt",
      "#surveyStartedAt": "surveyStartedAt",
    };

    const expValues: Record<string, any> = {
      ":now": now,
      ":surveyId": surveyId,
      ":surveyName": surveyName,
      ":surveyVersion": surveyVersion,
      ":surveyStartedAt": `${surveyId}#${now}`,
    };

    if (statusToSet === "completed") {
      updateExp += ", #status = :completedStatus, #completedAt = :now";
      expNames["#status"] = "status";
      expNames["#completedAt"] = "completedAt";
      expValues[":completedStatus"] = "completed";
    } else {
      updateExp += ", #status = if_not_exists(#status, :partialStatus)";
      expNames["#status"] = "status";
      expValues[":partialStatus"] = "partial";
    }

    if (hasAnswer && questionName && answerPayload) {
      if (withNestedAnswer) {
        updateExp += ", #answers.#qName = :answerPayload";
        expNames["#answers"] = "answers";
        expNames["#qName"] = questionName;
        expValues[":answerPayload"] = answerPayload;
      } else if (withInitAnswer) {
        updateExp += ", #answers = :initAnswers";
        expNames["#answers"] = "answers";
        expValues[":initAnswers"] = { [questionName]: answerPayload };
      }
    } else if (!hasAnswer && withInitAnswer) {
      updateExp += ", #answers = if_not_exists(#answers, :emptyMap)";
      expNames["#answers"] = "answers";
      expValues[":emptyMap"] = {};
    }

    return await ddb.send(
      new UpdateCommand({
        TableName: SURVEY_RESPONSES_TABLE_NAME,
        Key: { tenantId, responseId: conversationId },
        UpdateExpression: updateExp,
        ExpressionAttributeNames: expNames,
        ExpressionAttributeValues: expValues,
        ReturnValues: "ALL_NEW",
      })
    );
  };

  if (!hasAnswer) {
    return await executeUpdate(false, true);
  }

  try {
    return await executeUpdate(true, false);
  } catch (err: any) {
    if (err.name === "ValidationException" || err.message?.includes("document path")) {
      return await executeUpdate(false, true);
    }
    throw err;
  }
}

/**
 * POST /survey-responses
 */
async function submitSurveyResponse(event: AnyApiGwEvent, tenantId: string): Promise<AnyResult> {
  if (!SURVEY_RESPONSES_TABLE_NAME || !SURVEY_AGGREGATES_TABLE_NAME) {
    return jsonResponse(500, { message: "Survey tables not configured" });
  }

  let body: SubmitSurveyAnswerBody;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return jsonResponse(400, { message: "Invalid JSON body" });
  }

  const conversationId = body?.conversationId?.trim();
  const surveyId = body?.surveyId?.trim();

  if (!conversationId || !surveyId) {
    return jsonResponse(400, { message: "conversationId and surveyId are required" });
  }

  if (!body.questionName && !body.isCompleted) {
    return jsonResponse(400, { message: "questionName or isCompleted: true is required" });
  }

  if (!isValidSurveyId(surveyId)) {
    return jsonResponse(400, { message: "surveyId must be a UUID" });
  }

  // Antworten zu gelöschten Umfragen ignorieren (200, damit der Flow nicht in den Fehlerpfad läuft).
  // Vor der Existenzprüfung, denn nach dem Löschen fehlt die Zeile in der Data Table.
  if (await isSurveyBeingDeleted(tenantId, surveyId)) {
    return jsonResponse(200, { message: "Survey deleted, answer ignored", ignored: true, session: {} });
  }

  // Nur Umfragen aus der Data Table des Mandanten; ist das Ergebnis unklar, wird trotzdem gespeichert
  const existence = await checkSurveyExists(tenantId, surveyId);
  if (existence.status === "absent") {
    return jsonResponse(404, { message: "Survey not found", code: "survey_not_found" });
  }
  if (existence.status === "error" && !existence.cached) {
    if (existence.kind === "config") {
      // Fester Text für einen CloudWatch-Alarm: die Prüfung ist für diesen Mandanten wirkungslos
      console.error("[survey_responses] SURVEY_CHECK_CONFIG_ERROR", { tenantId, surveyId, reason: existence.reason });
    } else {
      console.warn("[survey_responses] survey existence check failed, accepting answer", {
        tenantId,
        surveyId,
        reason: existence.reason,
        throttled: existence.throttled ?? false,
      });
    }
  }

  const now = new Date().toISOString();

  // 1. Session in SurveyResponsesTable upserten
  const sessionResult = await upsertSurveyResponse(tenantId, body, now);

  // 2. Aggregat in SurveyAggregatesTable inkrementieren
  // Ein Fehler hier macht die gespeicherte Antwort nicht ungültig, der Flow soll nicht in den Fehlerpfad laufen
  if (body.questionName && body.value !== undefined) {
    try {
      await updateSurveyAggregate(tenantId, body, now);
    } catch (err) {
      console.warn("[survey_responses] aggregate update failed", { tenantId, surveyId, error: err });
    }
  }

  return jsonResponse(200, {
    message: "Saved successfully",
    session: sessionResult.Attributes ?? {},
  });
}

/**
 * GET /survey-responses/aggregates?surveyId=...
 */
async function getSurveyAggregates(event: AnyApiGwEvent, tenantId: string): Promise<AnyResult> {
  if (!SURVEY_AGGREGATES_TABLE_NAME) {
    return jsonResponse(500, { message: "SURVEY_AGGREGATES_TABLE_NAME not configured" });
  }

  const surveyId = String(event?.queryStringParameters?.surveyId ?? "").trim();
  if (!surveyId) {
    return jsonResponse(400, { message: "surveyId query parameter is required" });
  }

  const tenantSurveyId = `${tenantId}#${surveyId}`;

  const result = await ddb.send(
    new QueryCommand({
      TableName: SURVEY_AGGREGATES_TABLE_NAME,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "tenantSurveyId" },
      ExpressionAttributeValues: { ":pk": tenantSurveyId },
    })
  );

  return jsonResponse(200, {
    surveyId,
    tenantId,
    items: result.Items ?? [],
  });
}

/**
 * GET /survey-responses/raw?surveyId=...&limit=...&cursor=...&status=...
 */
async function getSurveyRawResponses(event: AnyApiGwEvent, tenantId: string): Promise<AnyResult> {
  if (!SURVEY_RESPONSES_TABLE_NAME) {
    return jsonResponse(500, { message: "SURVEY_RESPONSES_TABLE_NAME not configured" });
  }

  const surveyId = String(event?.queryStringParameters?.surveyId ?? "").trim();
  if (!surveyId) {
    return jsonResponse(400, { message: "surveyId query parameter is required" });
  }

  const limitParam = Number(event?.queryStringParameters?.limit ?? 50);
  const limit = Math.min(Math.max(limitParam || 50, 1), 200);
  const cursorParam = event?.queryStringParameters?.cursor;
  const statusParam = event?.queryStringParameters?.status?.trim();

  let exclusiveStartKey: Record<string, any> | undefined;
  if (cursorParam) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(cursorParam, "base64").toString("utf8"));
    } catch {
      return jsonResponse(400, { message: "Invalid cursor" });
    }
  }

  const surveyPrefix = `${surveyId}#`;
  const queryInput: any = {
    TableName: SURVEY_RESPONSES_TABLE_NAME,
    IndexName: "byTenantSurvey",
    KeyConditionExpression: "#tenantId = :tenantId and begins_with(#sk, :prefix)",
    ExpressionAttributeNames: {
      "#tenantId": "tenantId",
      "#sk": "surveyStartedAt",
    },
    ExpressionAttributeValues: {
      ":tenantId": tenantId,
      ":prefix": surveyPrefix,
    },
    Limit: limit,
    ScanIndexForward: false, // neueste Antworten zuerst
    ExclusiveStartKey: exclusiveStartKey,
  };

  if (statusParam) {
    queryInput.FilterExpression = "#status = :statusVal";
    queryInput.ExpressionAttributeNames["#status"] = "status";
    queryInput.ExpressionAttributeValues[":statusVal"] = statusParam;
  }

  const result = await ddb.send(new QueryCommand(queryInput));

  let nextCursor: string | null = null;
  if (result.LastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64");
  }

  return jsonResponse(200, {
    items: result.Items ?? [],
    nextCursor,
  });
}

/**
 * GET /survey-responses/session?conversationId=...
 */
async function getSurveySession(event: AnyApiGwEvent, tenantId: string): Promise<AnyResult> {
  if (!SURVEY_RESPONSES_TABLE_NAME) {
    return jsonResponse(500, { message: "SURVEY_RESPONSES_TABLE_NAME not configured" });
  }

  const conversationId = String(event?.queryStringParameters?.conversationId ?? "").trim();
  if (!conversationId) {
    return jsonResponse(400, { message: "conversationId query parameter is required" });
  }

  const result = await ddb.send(
    new GetCommand({
      TableName: SURVEY_RESPONSES_TABLE_NAME,
      Key: { tenantId, responseId: conversationId },
    })
  );

  if (!result.Item) {
    return jsonResponse(404, { message: "Session not found" });
  }

  return jsonResponse(200, { item: result.Item });
}

const routes: Record<RouteKey, RouteHandler> = {
  "POST /survey-responses": submitSurveyResponse,
  "GET /survey-responses/aggregates": getSurveyAggregates,
  "GET /survey-responses/raw": getSurveyRawResponses,
  "GET /survey-responses/session": getSurveySession,
};

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  const method = event?.requestContext?.http?.method ?? "";
  const path = event?.requestContext?.http?.path ?? event?.rawPath ?? "";

  if (method === "OPTIONS") {
    return jsonResponse(204, "");
  }

  const { context, error } = await resolveTenantContext(event, { requireApproved: true });
  if (error || !context?.tenantId) {
    return jsonResponse(401, { message: error ?? "Unauthorized" });
  }

  const route = routes[`${method} ${path}` as RouteKey];
  if (!route) {
    return jsonResponse(404, { message: "Not found", method, path });
  }

  try {
    return await route(event, context.tenantId);
  } catch (err) {
    console.error("[survey_responses] unhandled error", err);
    return jsonResponse(500, { message: "Internal error" });
  }
};
