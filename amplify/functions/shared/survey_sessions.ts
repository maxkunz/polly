import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { sessionVersion } from "./answer_records";
import type { ExportSession } from "./answer_records";

// Auch vom CSV-Export genutzt, damit Seitengröße und Client nur einmal existieren
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SURVEY_RESPONSES_TABLE_NAME = process.env.SURVEY_RESPONSES_TABLE_NAME ?? "";

export const SESSION_PAGE_SIZE = 200;

export interface SessionQueryParams {
  surveyId: string;
  fromIso: string;
  toIso: string;
  version?: number;
  exclusiveStartKey?: Record<string, any>;
}

/** Abbruch von `iterateSessions`, weil `canContinue` vor der nächsten Seite `false` lieferte. */
export class SessionReadAbortedError extends Error {
  constructor() {
    super("Session read aborted");
    this.name = "SessionReadAbortedError";
  }
}

/**
 * Liefert die Sessions im Zeitraum aufsteigend nach Session-Start (GSI byTenantSurvey).
 * Blättert intern über LastEvaluatedKey. `canContinue` wird vor jeder Seite geprüft, auch wenn der
 * Versionsfilter ganze Seiten leert (dann läuft die Schleife des Aufrufers nicht).
 * Der Versionsfilter läuft im Speicher über `sessionVersion` (gleiche Regel wie die Zählung in
 * `session_summary.ts`); ein FilterExpression fände fehlende oder als String gespeicherte Versionen nicht.
 */
export async function* iterateSessions(
  tenantId: string,
  params: SessionQueryParams,
  canContinue?: () => boolean,
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
    if (canContinue && !canContinue()) throw new SessionReadAbortedError();
    const result = await ddb.send(
      new QueryCommand({
        TableName: SURVEY_RESPONSES_TABLE_NAME,
        IndexName: "byTenantSurvey",
        KeyConditionExpression: "#tenantId = :tenantId AND #sk BETWEEN :from AND :to",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ProjectionExpression: projection.join(", "),
        Limit: SESSION_PAGE_SIZE,
        ScanIndexForward: true,
        ExclusiveStartKey: startKey,
      }),
    );

    for (const item of result.Items ?? []) {
      if (params.version !== undefined && sessionVersion(item) !== params.version) continue;
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
