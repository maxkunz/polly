import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { ExportSession } from "./answer_records";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SURVEY_RESPONSES_TABLE_NAME = process.env.SURVEY_RESPONSES_TABLE_NAME ?? "";

const PAGE_SIZE = 200;

export interface SessionQueryParams {
  surveyId: string;
  fromIso: string;
  toIso: string;
  version?: number;
  exclusiveStartKey?: Record<string, any>;
}

/**
 * Liefert die Sessions im Zeitraum aufsteigend nach Session-Start (GSI byTenantSurvey).
 * Blättert intern über LastEvaluatedKey.
 */
export async function* iterateSessions(
  tenantId: string,
  params: SessionQueryParams,
): AsyncGenerator<{ session: ExportSession; key: Record<string, any> }> {
  const names: Record<string, string> = {
    "#tenantId": "tenantId",
    "#sk": "surveyStartedAt",
    "#responseId": "responseId",
    "#surveyId": "surveyId",
    "#surveyName": "surveyName",
    "#surveyVersion": "surveyVersion",
    "#status": "status",
    "#channel": "channel",
    "#startedAt": "startedAt",
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
    "#surveyId",
    "#surveyName",
    "#surveyVersion",
    "#status",
    "#channel",
    "#startedAt",
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
