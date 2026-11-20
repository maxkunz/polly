import { randomBytes } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

/**
 * MCP-Zustand pro Mandant (`TenantsTable` und `McpOAuthTable`), gemeinsam genutzt von `mcp_admin` (Schalter) und den
 * Onboarding-Routen (Aufräumen bei Uninstall und Löschen). Schlüssel und Lebensdauern: `documentation/polly_mcp.md`.
 * Ohne KMS: Ver- und Entschlüsseln des Client-Secrets liegt in `mcp_secret.ts`, damit Onboarding es nicht mitbündelt.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TENANTS_TABLE_NAME = process.env.TENANTS_TABLE_NAME ?? "";
const MCP_OAUTH_TABLE_NAME = process.env.MCP_OAUTH_TABLE_NAME ?? "";

const MCP_OAUTH_TENANT_INDEX = "byTenant";
const SESSION_PREFIX = "SESSION#";
const BATCH_WRITE_MAX_ITEMS = 25;
const BATCH_WRITE_MAX_ROUNDS = 5;

/** Zufälliger URL-Schlüssel des Mandanten (128 bit, base64url, 22 Zeichen). Kein Geheimnis, nur gegen Raten. */
export function newMcpTenantKey(): string {
  return randomBytes(16).toString("base64url");
}

/** Anzahl der MCP-Sitzungen des Mandanten (Einträge `SESSION#…` im GSI `byTenant`). */
export async function countMcpSessions(tenantId: string): Promise<number> {
  if (!MCP_OAUTH_TABLE_NAME) return 0;
  let count = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: MCP_OAUTH_TABLE_NAME,
        IndexName: MCP_OAUTH_TENANT_INDEX,
        KeyConditionExpression: "tenantId = :t AND begins_with(pk, :p)",
        ExpressionAttributeValues: { ":t": tenantId, ":p": SESSION_PREFIX },
        Select: "COUNT",
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    count += page.Count ?? 0;
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return count;
}

/**
 * Löscht alle Einträge des Mandanten aus der `McpOAuthTable` (Clients, Anmeldeanfragen, Codes, Sessions, Tokens,
 * Zustimmungen, Zähler). Gibt die Anzahl gelöschter Einträge zurück. Wirft, wenn Einträge übrig bleiben, damit der
 * Aufrufer nicht von einem sauberen Stand ausgeht; ein erneuter Aufruf räumt den Rest ab.
 */
export async function clearMcpEntries(tenantId: string): Promise<number> {
  if (!MCP_OAUTH_TABLE_NAME) {
    console.warn("[mcp_tenant] MCP_OAUTH_TABLE_NAME not configured; skipping MCP cleanup", { tenantId });
    return 0;
  }
  let deleted = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: MCP_OAUTH_TABLE_NAME,
        IndexName: MCP_OAUTH_TENANT_INDEX,
        KeyConditionExpression: "tenantId = :t",
        ExpressionAttributeValues: { ":t": tenantId },
        ProjectionExpression: "pk, sk",
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    const keys = (page.Items ?? []).map((item) => ({ pk: item.pk as string, sk: item.sk as string }));
    for (let offset = 0; offset < keys.length; offset += BATCH_WRITE_MAX_ITEMS) {
      deleted += await deleteBatch(keys.slice(offset, offset + BATCH_WRITE_MAX_ITEMS));
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return deleted;
}

async function deleteBatch(keys: Array<{ pk: string; sk: string }>): Promise<number> {
  let pending: Array<{ DeleteRequest: { Key: { pk: string; sk: string } } }> = keys.map((Key) => ({ DeleteRequest: { Key } }));
  for (let round = 0; round < BATCH_WRITE_MAX_ROUNDS && pending.length > 0; round += 1) {
    const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [MCP_OAUTH_TABLE_NAME]: pending } }));
    pending = (res.UnprocessedItems?.[MCP_OAUTH_TABLE_NAME] ?? []) as typeof pending;
  }
  if (pending.length > 0) throw new Error(`Could not delete ${pending.length} MCP entries`);
  return keys.length;
}

/**
 * Sperrt MCP im Mandanteneintrag: `mcpEnabled = false`, `mcpEpoch + 1` (jede Session ist damit sofort ungültig),
 * Client-ID, Secret und Org-ID werden entfernt. `mcpTenantKey` und `mcpAllowComments` bleiben, damit die MCP-URL
 * beim erneuten Aktivieren dieselbe ist. Ein Eintrag, den es nicht (mehr) gibt, wird nicht neu angelegt.
 */
export async function disableTenantMcp(backendClientId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TENANTS_TABLE_NAME,
        Key: { backendClientId },
        UpdateExpression:
          "SET mcpEnabled = :off, mcpEpoch = if_not_exists(mcpEpoch, :zero) + :one, updatedAt = :u " +
          "REMOVE mcpGenesysClientId, mcpClientSecretEnc, genesysOrgId",
        ConditionExpression: "attribute_exists(backendClientId)",
        ExpressionAttributeValues: { ":off": false, ":zero": 0, ":one": 1, ":u": new Date().toISOString() },
      })
    );
  } catch (err: any) {
    if (err?.name !== "ConditionalCheckFailedException") throw err;
  }
}

/** Ein Mandanteneintrag hat MCP schon einmal benutzt (Schlüssel erzeugt oder aktiviert). */
export function hasMcpState(item: Record<string, any> | undefined): boolean {
  return Boolean(item && (item.mcpTenantKey || item.mcpEnabled === true || item.mcpGenesysClientId));
}
