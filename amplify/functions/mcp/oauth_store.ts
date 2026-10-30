import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

/**
 * Zustand der OAuth-Fassade in der `McpOAuthTable` (`documentation/polly_mcp.md`, Abschnitt 9). Die Logik in
 * `tokens.ts` und `session.ts` kennt nur das Interface `OAuthStore`; Tests verwenden einen Speicher im RAM.
 * Zeitpunkte in Millisekunden; `ttl` (Sekunden) setzt nur die DynamoDB-Umsetzung, gelesen wird immer `expiresAt`,
 * weil DynamoDB abgelaufene Einträge erst verzögert löscht.
 */

export interface ClientRecord {
  clientId: string;
  tenantId: string;
  mcpTenantKey: string;
  redirectUris: string[];
  clientName: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

export type AuthRequestStatus = "pending" | "authenticated" | "consumed";

export interface AuthRequestRecord {
  /** Zufallswert, zugleich `state` gegenüber Genesys */
  id: string;
  tenantId: string;
  mcpTenantKey: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  resource: string;
  /** SHA-256 des Browser-Cookies */
  browserHash: string;
  /** PKCE-Verifier gegenüber Genesys */
  genesysVerifier: string;
  status: AuthRequestStatus;
  expiresAt: number;
  /** ab `authenticated`: */
  sessionId?: string;
  userId?: string;
  userName?: string;
  genesysTokensEnc?: string;
  genesysExpiresAt?: number;
  csrfNonce?: string;
}

export interface AuthCodeRecord {
  codeHash: string;
  tenantId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  sessionId: string;
  expiresAt: number;
  usedAt?: number;
}

export interface SessionRecord {
  sessionId: string;
  tenantId: string;
  mcpTenantKey: string;
  /** `mcpEpoch` des Mandanten bei der Anmeldung; jede Erhöhung macht die Session ungültig */
  epoch: number;
  clientId: string;
  userId: string;
  userName: string;
  region: string;
  /** Genesys-Tokens, KMS-verschlüsselt (`shared/mcp_secret.ts`) */
  genesysTokensEnc: string;
  genesysExpiresAt: number;
  /** Zählt jeden Genesys-Refresh (optimistisches Sperren bei parallelen Aufrufen) */
  genesysVersion: number;
  createdAt: number;
  expiresAt: number;
}

export type TokenKind = "AT" | "RT";

export interface TokenRecord {
  tokenHash: string;
  kind: TokenKind;
  tenantId: string;
  sessionId: string;
  clientId: string;
  resource: string;
  expiresAt: number;
  /** nur Refresh-Tokens: Zeitpunkt der Einlösung (Rotation, Erkennung von Wiederverwendung) */
  usedAt?: number;
}

export interface OAuthStore {
  getClient(clientId: string): Promise<ClientRecord | undefined>;
  putClient(client: ClientRecord): Promise<void>;
  /** Verlängert die Lebensdauer nach Nutzung; ein gelöschter Client wird nicht neu angelegt. */
  touchClient(clientId: string, now: number, expiresAt: number): Promise<void>;
  /** Zählt nur nicht abgelaufene Clients (DynamoDB löscht per TTL erst verzögert). */
  countClients(tenantId: string, now: number): Promise<number>;

  putAuthRequest(request: AuthRequestRecord): Promise<void>;
  getAuthRequest(id: string): Promise<AuthRequestRecord | undefined>;
  /** Setzt `status` und `patch` nur, wenn der Zustand noch `from` ist (einmalig). */
  transitionAuthRequest(
    id: string,
    from: AuthRequestStatus,
    to: AuthRequestStatus,
    patch?: Partial<AuthRequestRecord>
  ): Promise<boolean>;
  deleteAuthRequest(id: string): Promise<void>;

  putCode(code: AuthCodeRecord): Promise<void>;
  getCode(codeHash: string): Promise<AuthCodeRecord | undefined>;
  /** Markiert den Code als eingelöst; `false`, wenn er schon eingelöst war oder fehlt. */
  consumeCode(codeHash: string, now: number): Promise<boolean>;

  putSession(session: SessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | undefined>;
  /** Neue Genesys-Tokens nur, wenn `genesysVersion` noch `expectedVersion` ist; erhöht die Version. */
  updateSessionGenesys(
    sessionId: string,
    expectedVersion: number,
    patch: { genesysTokensEnc: string; genesysExpiresAt: number }
  ): Promise<boolean>;
  deleteSession(sessionId: string): Promise<SessionRecord | undefined>;

  putToken(token: TokenRecord): Promise<void>;
  getToken(kind: TokenKind, tokenHash: string): Promise<TokenRecord | undefined>;
  /** Markiert ein Refresh-Token als eingelöst; `false`, wenn es schon eingelöst war oder fehlt. */
  consumeToken(kind: TokenKind, tokenHash: string, now: number): Promise<boolean>;
  deleteToken(kind: TokenKind, tokenHash: string): Promise<void>;

  /** Zählt einen Aufruf im Zeitfenster `bucket` und gibt den neuen Stand zurück. */
  incrementRate(tenantId: string, sessionId: string, bucket: string, expiresAt: number): Promise<number>;
}

const SK = "MAIN";
const TENANT_INDEX = "byTenant";
const BATCH_GET_MAX_KEYS = 100;
const BATCH_GET_MAX_ATTEMPTS = 5;

export const PK_PREFIX = {
  client: "CLIENT#",
  authRequest: "AUTHREQ#",
  code: "CODE#",
  session: "SESSION#",
  rate: "RATE#",
} as const;

function tokenPk(kind: TokenKind, tokenHash: string): string {
  return `${kind}#${tokenHash}`;
}

/** DynamoDB-TTL in Sekunden; ein Puffer, damit kein Eintrag vor seinem fachlichen Ablauf verschwindet. */
function ttlSeconds(expiresAtMs: number): number {
  return Math.ceil(expiresAtMs / 1000) + 60;
}

function isConditionFailure(err: any): boolean {
  return err?.name === "ConditionalCheckFailedException";
}

function strip<T>(item: Record<string, any> | undefined): T | undefined {
  if (!item) return undefined;
  const { pk: _pk, sk: _sk, ttl: _ttl, ...rest } = item;
  return rest as T;
}

export function createDynamoOAuthStore(tableName: string = process.env.MCP_OAUTH_TABLE_NAME ?? ""): OAuthStore {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

  const put = async (pk: string, item: object, expiresAt: number): Promise<void> => {
    await ddb.send(new PutCommand({ TableName: tableName, Item: { ...item, pk, sk: SK, ttl: ttlSeconds(expiresAt) } }));
  };
  const get = async <T>(pk: string): Promise<T | undefined> => {
    const res = await ddb.send(new GetCommand({ TableName: tableName, Key: { pk, sk: SK }, ConsistentRead: true }));
    return strip<T>(res.Item);
  };
  const remove = async (pk: string): Promise<Record<string, any> | undefined> => {
    const res = await ddb.send(new DeleteCommand({ TableName: tableName, Key: { pk, sk: SK }, ReturnValues: "ALL_OLD" }));
    return res.Attributes;
  };
  /** Setzt `usedAt` genau einmal. */
  const consume = async (pk: string, now: number): Promise<boolean> => {
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk, sk: SK },
          UpdateExpression: "SET usedAt = :now",
          ConditionExpression: "attribute_exists(pk) AND attribute_not_exists(usedAt)",
          ExpressionAttributeValues: { ":now": now },
        })
      );
      return true;
    } catch (err) {
      if (isConditionFailure(err)) return false;
      throw err;
    }
  };

  return {
    getClient: (clientId) => get<ClientRecord>(PK_PREFIX.client + clientId),
    putClient: (client) => put(PK_PREFIX.client + client.clientId, client, client.expiresAt),
    async touchClient(clientId, now, expiresAt) {
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: PK_PREFIX.client + clientId, sk: SK },
            UpdateExpression: "SET lastUsedAt = :now, expiresAt = :exp, #ttl = :ttl",
            ConditionExpression: "attribute_exists(pk)",
            ExpressionAttributeNames: { "#ttl": "ttl" },
            ExpressionAttributeValues: { ":now": now, ":exp": expiresAt, ":ttl": ttlSeconds(expiresAt) },
          })
        );
      } catch (err) {
        if (!isConditionFailure(err)) throw err;
      }
    },
    async countClients(tenantId, now) {
      // Der Index projiziert nur Schlüssel: `expiresAt` per BatchGet nachlesen (höchstens 200 Clients pro Mandant)
      const keys: Array<{ pk: string; sk: string }> = [];
      let lastEvaluatedKey: Record<string, any> | undefined;
      do {
        const page = await ddb.send(
          new QueryCommand({
            TableName: tableName,
            IndexName: TENANT_INDEX,
            KeyConditionExpression: "tenantId = :t AND begins_with(pk, :p)",
            ExpressionAttributeValues: { ":t": tenantId, ":p": PK_PREFIX.client },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );
        for (const item of page.Items ?? []) keys.push({ pk: String(item.pk), sk: String(item.sk) });
        lastEvaluatedKey = page.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      let count = 0;
      for (let offset = 0; offset < keys.length; offset += BATCH_GET_MAX_KEYS) {
        let pending: Array<Record<string, any>> = keys.slice(offset, offset + BATCH_GET_MAX_KEYS);
        for (let attempt = 0; pending.length > 0; attempt++) {
          if (attempt >= BATCH_GET_MAX_ATTEMPTS) throw new Error("BatchGet of MCP clients incomplete");
          const res = await ddb.send(
            new BatchGetCommand({
              RequestItems: { [tableName]: { Keys: pending, ProjectionExpression: "expiresAt", ConsistentRead: true } },
            })
          );
          count += (res.Responses?.[tableName] ?? []).filter((item) => Number(item.expiresAt) > now).length;
          pending = res.UnprocessedKeys?.[tableName]?.Keys ?? [];
        }
      }
      return count;
    },

    putAuthRequest: (request) => put(PK_PREFIX.authRequest + request.id, request, request.expiresAt),
    getAuthRequest: (id) => get<AuthRequestRecord>(PK_PREFIX.authRequest + id),
    async transitionAuthRequest(id, from, to, patch = {}) {
      const names: Record<string, string> = { "#status": "status" };
      const values: Record<string, unknown> = { ":from": from, ":to": to };
      const sets = ["#status = :to"];
      Object.entries(patch).forEach(([key, value], index) => {
        if (value === undefined || key === "status" || key === "id") return;
        names[`#f${index}`] = key;
        values[`:v${index}`] = value;
        sets.push(`#f${index} = :v${index}`);
      });
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: PK_PREFIX.authRequest + id, sk: SK },
            UpdateExpression: `SET ${sets.join(", ")}`,
            ConditionExpression: "attribute_exists(pk) AND #status = :from",
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
          })
        );
        return true;
      } catch (err) {
        if (isConditionFailure(err)) return false;
        throw err;
      }
    },
    async deleteAuthRequest(id) {
      await remove(PK_PREFIX.authRequest + id);
    },

    putCode: (code) => put(PK_PREFIX.code + code.codeHash, code, code.expiresAt),
    getCode: (codeHash) => get<AuthCodeRecord>(PK_PREFIX.code + codeHash),
    consumeCode: (codeHash, now) => consume(PK_PREFIX.code + codeHash, now),

    putSession: (session) => put(PK_PREFIX.session + session.sessionId, session, session.expiresAt),
    getSession: (sessionId) => get<SessionRecord>(PK_PREFIX.session + sessionId),
    async updateSessionGenesys(sessionId, expectedVersion, patch) {
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: PK_PREFIX.session + sessionId, sk: SK },
            UpdateExpression: "SET genesysTokensEnc = :enc, genesysExpiresAt = :exp, genesysVersion = :next",
            ConditionExpression: "attribute_exists(pk) AND genesysVersion = :expected",
            ExpressionAttributeValues: {
              ":enc": patch.genesysTokensEnc,
              ":exp": patch.genesysExpiresAt,
              ":expected": expectedVersion,
              ":next": expectedVersion + 1,
            },
          })
        );
        return true;
      } catch (err) {
        if (isConditionFailure(err)) return false;
        throw err;
      }
    },
    async deleteSession(sessionId) {
      return strip<SessionRecord>(await remove(PK_PREFIX.session + sessionId));
    },

    putToken: (token) => put(tokenPk(token.kind, token.tokenHash), token, token.expiresAt),
    getToken: (kind, tokenHash) => get<TokenRecord>(tokenPk(kind, tokenHash)),
    consumeToken: (kind, tokenHash, now) => consume(tokenPk(kind, tokenHash), now),
    async deleteToken(kind, tokenHash) {
      await remove(tokenPk(kind, tokenHash));
    },

    async incrementRate(tenantId, sessionId, bucket, expiresAt) {
      const res = await ddb.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk: PK_PREFIX.rate + sessionId, sk: bucket },
          UpdateExpression: "ADD #n :one SET tenantId = :t, #ttl = :ttl",
          ExpressionAttributeNames: { "#n": "count", "#ttl": "ttl" },
          ExpressionAttributeValues: { ":one": 1, ":t": tenantId, ":ttl": ttlSeconds(expiresAt) },
          ReturnValues: "UPDATED_NEW",
        })
      );
      return Number(res.Attributes?.count ?? 0);
    },
  };
}
