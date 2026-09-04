import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const SURVEY_RESPONSES_TABLE_NAME = process.env.SURVEY_RESPONSES_TABLE_NAME ?? "";
const TIMEOUT_MINUTES = Number(process.env.TIMEOUT_MINUTES ?? 30);
const BATCH_LIMIT = 100;

export const handler = async (event: any): Promise<{ timedOutCount: number; checkedCount: number }> => {
  if (!SURVEY_RESPONSES_TABLE_NAME) {
    console.error("[survey_cleanup] SURVEY_RESPONSES_TABLE_NAME not set");
    return { timedOutCount: 0, checkedCount: 0 };
  }

  const nowMs = Date.now();
  const cutoffIso = new Date(nowMs - TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  console.log(`[survey_cleanup] Running cleanup for sessions older than ${cutoffIso}`);

  let timedOutCount = 0;
  let checkedCount = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;

  try {
    do {
      const queryResult = await ddb.send(
        new QueryCommand({
          TableName: SURVEY_RESPONSES_TABLE_NAME,
          IndexName: "byStatus",
          KeyConditionExpression: "#status = :status and #updatedAt < :cutoff",
          ExpressionAttributeNames: {
            "#status": "status",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":status": "partial",
            ":cutoff": cutoffIso,
          },
          Limit: BATCH_LIMIT,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      const items = queryResult.Items ?? [];
      checkedCount += items.length;

      for (const item of items) {
        const tenantId = item.tenantId;
        const responseId = item.responseId;

        if (!tenantId || !responseId) continue;

        try {
          await ddb.send(
            new UpdateCommand({
              TableName: SURVEY_RESPONSES_TABLE_NAME,
              Key: { tenantId, responseId },
              ConditionExpression: "#status = :partial and #updatedAt < :cutoff",
              UpdateExpression: "SET #status = :timedOut, #timedOutAt = :now",
              ExpressionAttributeNames: {
                "#status": "status",
                "#updatedAt": "updatedAt",
                "#timedOutAt": "timedOutAt",
              },
              ExpressionAttributeValues: {
                ":partial": "partial",
                ":cutoff": cutoffIso,
                ":timedOut": "timed_out",
                ":now": nowIso,
              },
            })
          );
          timedOutCount++;
        } catch (updateErr: any) {
          if (updateErr.name === "ConditionalCheckFailedException") {
            // Bereits aktualisiert oder Session ging weiter
            continue;
          }
          console.warn(`[survey_cleanup] Failed to update session ${tenantId}/${responseId}:`, updateErr);
        }
      }

      lastEvaluatedKey = queryResult.LastEvaluatedKey;
    } while (lastEvaluatedKey && checkedCount < 500);

    console.log(`[survey_cleanup] Finished. Checked: ${checkedCount}, timed out: ${timedOutCount}`);
    return { timedOutCount, checkedCount };
  } catch (err) {
    console.error("[survey_cleanup] Fatal error during cleanup", err);
    throw err;
  }
};
