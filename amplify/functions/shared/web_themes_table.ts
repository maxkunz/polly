import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Lesezugriff auf `WebSurveyThemesTable` (Lambdas `web_themes` und `web_survey`). Getrennt von
 * `web_themes.ts`, damit die reinen Funktionen dort ohne AWS-SDK testbar bleiben.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Alle Einträge eines Mandanten mit einer Query auf PK `tenantId` (höchstens 50 Designs, wenige KB;
 * trotzdem paginiert). `projection` z. B. `"themeId, isDefault"`.
 */
export async function queryWebThemeItems(
  tableName: string,
  tenantId: string,
  projection?: string
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "tenantId = :tenantId",
        ExpressionAttributeValues: { ":tenantId": tenantId },
        ...(projection ? { ProjectionExpression: projection } : {}),
        ExclusiveStartKey: startKey,
      })
    );
    items.push(...((result.Items ?? []) as Record<string, unknown>[]));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return items;
}
