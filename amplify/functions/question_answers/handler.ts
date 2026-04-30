import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { resolveTenantContext } from "../shared/tenant_auth";

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };
type RouteHandler = (event: AnyApiGwEvent, tenantId: string) => Promise<AnyResult>;
type RouteKey = `${string} ${string}`;

type SubmitAnswerBody = {
  questionId: string;
  value: number;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const QUESTION_ANSWERS_TABLE_NAME = process.env.QUESTION_ANSWERS_TABLE_NAME ?? "";

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

function buildQuestionAnswerResponse(item: Record<string, any>, tenantId: string) {
  return {
    tenantId,
    questionId: item.questionId,
    counts: Object.fromEntries(
      Object.entries(item)
        .filter(([key]) => key.startsWith("count_"))
        .map(([key, currentValue]) => [key.slice("count_".length), Number(currentValue ?? 0)])
    ),
    totalResponses: Number(item.totalResponses ?? 0),
    updatedAt: item.updatedAt ?? null,
    lastValue: item.lastValue ?? null,
  };
}

async function incrementQuestionAnswer(event: AnyApiGwEvent, tenantId: string): Promise<AnyResult> {
  if (!QUESTION_ANSWERS_TABLE_NAME) {
    return jsonResponse(500, { message: "QUESTION_ANSWERS_TABLE_NAME not configured" });
  }

  const body = event.body ? (JSON.parse(event.body) as SubmitAnswerBody) : null;
  const questionId = body?.questionId?.trim() ?? "";
  const value = Number(body?.value);

  if (!questionId || !Number.isInteger(value)) {
    return jsonResponse(400, { message: "questionId and integer value are required" });
  }

  const updatedAt = new Date().toISOString();
  const countAttribute = `count_${value}`;

  const result = await ddb.send(
    new UpdateCommand({
      TableName: QUESTION_ANSWERS_TABLE_NAME,
      Key: { tenantId, questionId },
      UpdateExpression:
        "SET #countAttribute = if_not_exists(#countAttribute, :zero) + :inc, #updatedAt = :updatedAt, #lastValue = :lastValue, #totalResponses = if_not_exists(#totalResponses, :zero) + :inc",
      ExpressionAttributeNames: {
        "#countAttribute": countAttribute,
        "#updatedAt": "updatedAt",
        "#lastValue": "lastValue",
        "#totalResponses": "totalResponses",
      },
      ExpressionAttributeValues: {
        ":zero": 0,
        ":inc": 1,
        ":updatedAt": updatedAt,
        ":lastValue": value,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  const attributes = result.Attributes ?? {};
  return jsonResponse(200, buildQuestionAnswerResponse(
    { ...attributes, questionId, updatedAt: attributes.updatedAt ?? updatedAt },
    tenantId
  ));
}

async function listQuestionAnswers(event: AnyApiGwEvent, tenantId: string): Promise<AnyResult> {
  if (!QUESTION_ANSWERS_TABLE_NAME) {
    return jsonResponse(500, { message: "QUESTION_ANSWERS_TABLE_NAME not configured" });
  }

  const questionId = String(event?.queryStringParameters?.questionId ?? "");
  if (questionId) {
    const result = await ddb.send(
      new GetCommand({
        TableName: QUESTION_ANSWERS_TABLE_NAME,
        Key: { tenantId, questionId },
      })
    );

    const item = result.Item;
    return jsonResponse(200, {
      items: item ? [buildQuestionAnswerResponse(item, tenantId)] : [],
    });
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: QUESTION_ANSWERS_TABLE_NAME,
      KeyConditionExpression: "#tenantId = :tenantId",
      ExpressionAttributeNames: {
        "#tenantId": "tenantId",
      },
      ExpressionAttributeValues: {
        ":tenantId": tenantId,
      },
    })
  );

  const items = (result.Items ?? []).map((item) => buildQuestionAnswerResponse(item, tenantId));

  return jsonResponse(200, { items });
}

const routes: Record<RouteKey, RouteHandler> = {
  "POST /question-answers": incrementQuestionAnswer,
  "GET /question-answers": listQuestionAnswers,
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
    console.error("[question_answers] unhandled error", err);
    return jsonResponse(500, { message: "Internal error" });
  }
};
