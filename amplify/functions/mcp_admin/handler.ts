import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { POLLY_ROLE_DEPLOY } from "../../../src/constants/permissionConstants";
import { isFeatureEnabled } from "../../../src/domain/features/featureFlags";
import { requireCallerRole } from "../shared/caller_roles";
import { getSurveyTableAccess } from "../shared/genesys_survey_check";
import { fetchWithTimeout, readRequestBody } from "../shared/http";
import { loadInstallationMeta } from "../shared/installation_meta";
import { buildGenesysRedirectUri, buildMcpUrl, isMcpEnabled } from "../shared/mcp_config";
import {
  clearMcpEntries,
  countMcpSessions,
  disableTenantMcp,
  newMcpTenantKey,
} from "../shared/mcp_tenant";
import { encryptClientSecret } from "../shared/mcp_secret";
import { revokeMcpSessionTokens } from "../shared/mcp_session_revoke";
import {
  getAuthorizationToken,
  getGenesysRegion,
  loadTenantCredentials,
  resolveTenantContext,
  type TenantCredentials,
} from "../shared/tenant_auth";
import {
  buildMcpSettingsStatus,
  checkGenesysClient,
  MCP_SETTINGS_MAX_BODY_BYTES,
  parseMcpSettingsPut,
} from "./settings";

/**
 * Schalter pro Mandant (`documentation/polly_mcp.md`, Abschnitt 6):
 *  - GET    /mcp-settings → Status, MCP-URL, Redirect-URI für den Genesys-Client, Anzahl der Sitzungen
 *  - PUT    /mcp-settings → `{ clientId, clientSecret }` aktiviert MCP, `{ allowComments }` schaltet nur das Flag um
 *  - DELETE /mcp-settings → deaktiviert, macht alle Sessions ungültig und räumt die MCP-Einträge ab
 * Alle Methoden nur mit Genesys-Bearer eines Users mit Rolle `polly_deploy` (serverseitig geprüft); Cognito-Tokens
 * bekommen 403. Anders als `mcp` antwortet die Lambda bei ausgeschaltetem Kill-Switch nicht mit 404, damit `GET`
 * den Zustand melden kann.
 */

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TENANTS_TABLE_NAME = process.env.TENANTS_TABLE_NAME ?? "";
const MCP_PUBLIC_BASE_URL = (process.env.MCP_PUBLIC_BASE_URL ?? "").trim();
/**
 * Zeitbudget für den Widerruf der Genesys-Tokens beim Abschalten; der letzte Durchgang braucht bis zu 3 s dazu
 * (Lambda-Timeout 20 s, Token- und Rollenprüfung davor je bis 6 s).
 */
const SESSION_REVOKE_BUDGET_MS = 4000;

function jsonResponse(statusCode: number, body: unknown): AnyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "OPTIONS,GET,PUT,DELETE",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function errorResponse(statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}): AnyResult {
  return jsonResponse(statusCode, { code, message, ...extra });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function loadTenantItem(backendClientId: string): Promise<Record<string, any> | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TENANTS_TABLE_NAME, Key: { backendClientId }, ConsistentRead: true }));
  return res.Item as Record<string, any> | undefined;
}

/** Stellt den URL-Schlüssel sicher, damit die Redirect-URI schon vor dem Aktivieren feststeht. Parallele Aufrufe behalten den ersten. */
async function ensureTenantKey(backendClientId: string, item: Record<string, any>): Promise<Record<string, any>> {
  if (typeof item.mcpTenantKey === "string" && item.mcpTenantKey) return item;
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TENANTS_TABLE_NAME,
        Key: { backendClientId },
        UpdateExpression: "SET mcpTenantKey = :k, updatedAt = :u",
        ConditionExpression: "attribute_exists(backendClientId) AND attribute_not_exists(mcpTenantKey)",
        ExpressionAttributeValues: { ":k": newMcpTenantKey(), ":u": new Date().toISOString() },
        ReturnValues: "ALL_NEW",
      })
    );
    return res.Attributes as Record<string, any>;
  } catch (err: any) {
    if (err?.name !== "ConditionalCheckFailedException") throw err;
    const reloaded = await loadTenantItem(backendClientId);
    if (!reloaded?.mcpTenantKey) throw new Error("Tenant entry vanished while creating the MCP key");
    return reloaded;
  }
}

async function loadFeatureEnabled(tenantId: string, credentials: TenantCredentials): Promise<boolean> {
  const meta = await loadInstallationMeta(tenantId, await getSurveyTableAccess(credentials));
  return isFeatureEnabled(meta.features, "mcp");
}

/**
 * Status-Antwort. `afterWrite`: Die Änderung ist schon gespeichert, ein Fehler beim Nachlesen von Flag oder Sitzungen
 * darf dann kein 500 liefern (das Frontend hielte die Änderung für gescheitert); es gelten die Ersatzwerte,
 * den genauen Stand liefert das nächste GET.
 */
async function buildStatus(
  tenantId: string,
  item: Record<string, any>,
  credentials: TenantCredentials,
  afterWrite?: { featureEnabled: boolean }
): Promise<AnyResult> {
  const tolerate = <T>(promise: Promise<T>, fallback: T, what: string): Promise<T> =>
    afterWrite
      ? promise.catch((err: any) => {
          console.warn(`[mcp_admin] ${what} unavailable after write`, { tenantId, name: err?.name, message: err?.message });
          return fallback;
        })
      : promise;
  const [featureEnabled, sessionCount] = await Promise.all([
    tolerate(loadFeatureEnabled(tenantId, credentials), afterWrite?.featureEnabled ?? false, "feature flag"),
    tolerate(countMcpSessions(tenantId), 0, "session count"),
  ]);
  return jsonResponse(
    200,
    buildMcpSettingsStatus({
      tenant: item,
      featureEnabled,
      serverEnabled: isMcpEnabled(),
      // Ohne Schlüssel (PUT allowComments vor dem ersten GET) keine URL, das nächste GET legt ihn an
      mcpUrl: item.mcpTenantKey ? buildMcpUrl(MCP_PUBLIC_BASE_URL, item.mcpTenantKey) : "",
      redirectUri: item.mcpTenantKey ? buildGenesysRedirectUri(MCP_PUBLIC_BASE_URL, item.mcpTenantKey) : "",
      sessionCount,
    })
  );
}

type GenesysLookup<T> = { ok: true; body: T } | { ok: false; response: AnyResult };

/** GET auf die Genesys-API mit dem Token der Person (nur lesend). */
async function genesysGet(region: string, token: string, path: string, notFoundCode: string): Promise<GenesysLookup<any>> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`https://api.${region}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err: any) {
    console.error("[mcp_admin] Genesys request failed", { path, error: String(err?.message ?? err) });
    return { ok: false, response: errorResponse(502, "genesys_error", "Genesys is not reachable") };
  }
  if (res.status === 404) return { ok: false, response: errorResponse(400, notFoundCode, "Not found in Genesys") };
  if (res.status === 401) return { ok: false, response: errorResponse(401, "unauthorized", "Genesys token invalid") };
  if (res.status === 403) {
    return { ok: false, response: errorResponse(403, "genesys_forbidden", "The Genesys user may not read this resource", { resource: notFoundCode }) };
  }
  if (!res.ok) {
    return { ok: false, response: errorResponse(res.status === 429 ? 429 : 502, "genesys_error", "Genesys request failed") };
  }
  return { ok: true, body: await res.json() };
}

async function enableMcp(
  event: AnyApiGwEvent,
  params: { tenantId: string; backendClientId: string; region: string; item: Record<string, any>; credentials: TenantCredentials; userId?: string },
  request: { clientId: string; clientSecret: string }
): Promise<AnyResult> {
  const { tenantId, backendClientId, region, credentials } = params;
  if (!isMcpEnabled()) return errorResponse(409, "server_disabled", "MCP is switched off on this server");
  if (!(await loadFeatureEnabled(tenantId, credentials))) {
    return errorResponse(409, "feature_disabled", "The feature mcp is not enabled for this installation");
  }

  const item = await ensureTenantKey(backendClientId, params.item);
  const redirectUri = buildGenesysRedirectUri(MCP_PUBLIC_BASE_URL, item.mcpTenantKey);
  const token = getAuthorizationToken(event);

  const client = await genesysGet(region, token, `/api/v2/oauth/clients/${encodeURIComponent(request.clientId)}`, "client_not_found");
  if (!client.ok) return client.response;
  const check = checkGenesysClient(client.body, redirectUri);
  if (!check.ok) return errorResponse(400, "client_invalid", "The Genesys OAuth client does not fit", { reason: check.reason, redirectUri });

  // Die Org-ID bindet Anmeldungen an diese Genesys-Org (Prüfung im Callback, M7)
  const org = await genesysGet(region, token, "/api/v2/organizations/me", "org_not_found");
  if (!org.ok) return org.response;
  const orgId = typeof org.body?.id === "string" ? org.body.id : "";
  if (!orgId) return errorResponse(502, "genesys_error", "Genesys returned no organization");

  const encryptedSecret = await encryptClientSecret(tenantId, request.clientSecret);

  // Ein anderer Genesys-Client macht alle bisherigen Sessions ungültig (sie hängen an dem alten Client)
  const clientChanged = typeof item.mcpGenesysClientId === "string" && item.mcpGenesysClientId !== request.clientId;
  await ddb.send(
    new UpdateCommand({
      TableName: TENANTS_TABLE_NAME,
      Key: { backendClientId },
      UpdateExpression:
        "SET mcpEnabled = :on, mcpGenesysClientId = :c, mcpClientSecretEnc = :s, genesysOrgId = :o, " +
        "mcpEpoch = if_not_exists(mcpEpoch, :zero) + :bump, updatedAt = :u",
      ConditionExpression: "attribute_exists(backendClientId) AND #status = :approved",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":on": true,
        ":c": request.clientId,
        ":s": encryptedSecret,
        ":o": orgId,
        ":zero": 0,
        ":bump": clientChanged ? 1 : 0,
        ":approved": "APPROVED",
        ":u": new Date().toISOString(),
      },
    })
  );
  if (clientChanged) {
    const revocation = await revokeMcpSessionTokens(tenantId, SESSION_REVOKE_BUDGET_MS);
    await clearMcpEntries(tenantId);
    console.log("[mcp_admin] sessions of previous client revoked", { tenantId, ...revocation });
  }

  console.log("[mcp_admin] enabled", { tenantId, userId: params.userId, clientChanged });
  const saved = await loadTenantItem(backendClientId).catch(() => undefined);
  return buildStatus(tenantId, saved ?? { ...item, mcpEnabled: true, mcpGenesysClientId: request.clientId }, credentials, {
    featureEnabled: true,
  });
}

async function setAllowComments(
  params: { tenantId: string; backendClientId: string; item: Record<string, any>; credentials: TenantCredentials; userId?: string },
  allowComments: boolean
): Promise<AnyResult> {
  const { tenantId, backendClientId, item, credentials } = params;
  await ddb.send(
    new UpdateCommand({
      TableName: TENANTS_TABLE_NAME,
      Key: { backendClientId },
      UpdateExpression: "SET mcpAllowComments = :b, updatedAt = :u",
      ConditionExpression: "attribute_exists(backendClientId) AND #status = :approved",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":b": allowComments, ":approved": "APPROVED", ":u": new Date().toISOString() },
    })
  );
  console.log("[mcp_admin] allowComments changed", { tenantId, userId: params.userId, allowComments });
  return buildStatus(tenantId, { ...item, mcpAllowComments: allowComments }, credentials, { featureEnabled: true });
}

async function disableMcp(params: {
  tenantId: string;
  backendClientId: string;
  item: Record<string, any>;
  credentials: TenantCredentials;
  userId?: string;
}): Promise<AnyResult> {
  const { tenantId, backendClientId, credentials } = params;
  // Zuerst sperren (Epoch), dann aufräumen: Bricht das Aufräumen ab, ist MCP trotzdem schon aus und der Aufruf wiederholbar
  await disableTenantMcp(backendClientId);
  // Genesys-Tokens nach Möglichkeit widerrufen, solange die Sessions noch gespeichert sind
  const revocation = await revokeMcpSessionTokens(tenantId, SESSION_REVOKE_BUDGET_MS);
  const cleared = await clearMcpEntries(tenantId);
  console.log("[mcp_admin] disabled", { tenantId, userId: params.userId, cleared, ...revocation });
  const saved = await loadTenantItem(backendClientId).catch(() => undefined);
  return buildStatus(tenantId, saved ?? { ...params.item, mcpEnabled: false, mcpGenesysClientId: undefined }, credentials, {
    featureEnabled: true,
  });
}

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  const method = event?.requestContext?.http?.method ?? "";
  const path = event?.requestContext?.http?.path ?? event?.rawPath ?? "";

  if (method === "OPTIONS") return jsonResponse(204, "");
  if (path !== "/mcp-settings" || !["GET", "PUT", "DELETE"].includes(method)) {
    return errorResponse(404, "not_found", "Not found");
  }

  const { context, error } = await resolveTenantContext(event, { requireApproved: true });
  if (error || !context?.tenantId || !context.backendClientId) {
    return errorResponse(401, "unauthorized", error ?? "Unauthorized");
  }
  // M2M-Tokens (Cognito) haben keine Benutzerrollen; MCP schaltet nur die App-Oberfläche
  if (context.source !== "genesys") return errorResponse(403, "forbidden_m2m", "MCP settings require a Genesys user token");
  const region = getGenesysRegion(event) ?? context.genesysRegion;
  if (!region) return errorResponse(400, "invalid_request", "Unsupported Genesys region");
  const { tenantId, backendClientId } = context;

  try {
    const item = await loadTenantItem(backendClientId);
    if (!item || item.status !== "APPROVED") return errorResponse(401, "unauthorized", "Tenant not approved");
    const credentials = await loadTenantCredentials(tenantId, item);
    if (!credentials) return errorResponse(502, "no_credentials", "No Genesys backend credentials for tenant");

    const roleCheck = await requireCallerRole({
      logPrefix: "[mcp_admin]",
      tenantId,
      region,
      token: getAuthorizationToken(event),
      credentials,
      role: POLLY_ROLE_DEPLOY,
    });
    if (!roleCheck.ok) return errorResponse(roleCheck.httpStatus, roleCheck.code, roleCheck.message);
    const params = { tenantId, backendClientId, item, credentials, userId: roleCheck.userId };

    if (method === "GET") return await buildStatus(tenantId, await ensureTenantKey(backendClientId, item), credentials);
    if (method === "DELETE") return await disableMcp(params);

    const body = readRequestBody(event, MCP_SETTINGS_MAX_BODY_BYTES);
    if (!body.ok) return errorResponse(413, "payload_too_large", "Request body too large");
    const parsed = parseMcpSettingsPut(parseJson(body.text));
    if (!parsed.ok) return errorResponse(400, "invalid_request", parsed.message);
    if (parsed.request.kind === "comments") return await setAllowComments(params, parsed.request.allowComments);
    return await enableMcp(event, { ...params, region }, parsed.request);
  } catch (err: any) {
    // Secret und Tokens stehen nie im Log
    console.error("[mcp_admin] unhandled error", { tenantId, name: err?.name, message: err?.message });
    return errorResponse(500, "internal_error", "Internal error");
  }
};
