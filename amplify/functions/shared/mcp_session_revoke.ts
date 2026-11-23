import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { revokeGenesysToken } from "./mcp_genesys";
import { decryptGenesysTokens } from "./mcp_secret";

/**
 * Widerruft beim Abschalten von MCP die Genesys-Tokens aller Sessions eines Mandanten (`DELETE /api/v2/tokens/me`),
 * bevor `clearMcpEntries` die Einträge löscht. Nur nach Möglichkeit: Fehler und Zeitüberschreitung brechen nicht ab,
 * die Epoch macht die MCP-Tokens ohnehin ungültig und das Löschen des Genesys-Clients dessen Tokens.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const MCP_OAUTH_TABLE_NAME = process.env.MCP_OAUTH_TABLE_NAME ?? "";
const SESSION_PREFIX = "SESSION#";
const PARALLEL_REVOCATIONS = 5;
/** Kürzer als der übliche Genesys-Timeout, damit das Budget plus ein letzter Durchgang in den Lambda-Timeout passt. */
const REVOKE_TIMEOUT_MS = 3000;

export interface SessionRevocationResult {
  revoked: number;
  failed: number;
  /** wegen des Zeitbudgets nicht mehr versucht */
  skipped: number;
}

async function listSessionKeys(tenantId: string): Promise<Array<{ pk: string; sk: string }>> {
  const keys: Array<{ pk: string; sk: string }> = [];
  let lastEvaluatedKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: MCP_OAUTH_TABLE_NAME,
        IndexName: "byTenant",
        KeyConditionExpression: "tenantId = :t AND begins_with(pk, :p)",
        ExpressionAttributeValues: { ":t": tenantId, ":p": SESSION_PREFIX },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    for (const item of page.Items ?? []) keys.push({ pk: String(item.pk), sk: String(item.sk) });
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return keys;
}

async function revokeOne(key: { pk: string; sk: string }): Promise<boolean> {
  const res = await ddb.send(new GetCommand({ TableName: MCP_OAUTH_TABLE_NAME, Key: key }));
  const session = res.Item;
  if (!session?.genesysTokensEnc || !session.sessionId || !session.region) return false;
  const tokens = await decryptGenesysTokens(String(session.tenantId), String(session.sessionId), String(session.genesysTokensEnc));
  return revokeGenesysToken(String(session.region), tokens.accessToken, REVOKE_TIMEOUT_MS);
}

export async function revokeMcpSessionTokens(tenantId: string, budgetMs: number): Promise<SessionRevocationResult> {
  const result: SessionRevocationResult = { revoked: 0, failed: 0, skipped: 0 };
  if (!MCP_OAUTH_TABLE_NAME) return result;
  const deadline = Date.now() + budgetMs;
  let keys: Array<{ pk: string; sk: string }>;
  try {
    keys = await listSessionKeys(tenantId);
  } catch (err: any) {
    console.warn("[mcp_session_revoke] cannot list sessions", { tenantId, name: err?.name });
    return result;
  }
  for (let offset = 0; offset < keys.length; offset += PARALLEL_REVOCATIONS) {
    if (Date.now() >= deadline) {
      result.skipped = keys.length - offset;
      break;
    }
    const outcomes = await Promise.all(
      keys.slice(offset, offset + PARALLEL_REVOCATIONS).map((key) => revokeOne(key).catch(() => false))
    );
    for (const ok of outcomes) ok ? (result.revoked += 1) : (result.failed += 1);
  }
  return result;
}
