import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { POLLY_ROLE_DEPLOY } from "../../../src/constants/permissionConstants";
import { WEB_THEME_MAX_PER_TENANT, type WebTheme } from "../../../src/domain/webTheme/webTheme";
import { requireCallerRole } from "../shared/caller_roles";
import { readRequestBody } from "../shared/http";
import {
  getAuthorizationToken,
  getGenesysRegion,
  loadTenantCredentials,
  resolveTenantContext,
} from "../shared/tenant_auth";
import { isValidThemeId, parseWebThemeRequest, toWebTheme } from "../shared/web_themes";
import { queryWebThemeItems } from "../shared/web_themes_table";

/**
 * Web-Designs der öffentlichen Umfrageseite pro Mandant (siehe `documentation/polly_web.md`, „Designs“):
 *  - GET    /web-themes        → alle Designs des Mandanten (jeder angemeldete App-Nutzer)
 *  - PUT    /web-themes/{id}   → anlegen oder ändern (`polly_deploy`)
 *  - DELETE /web-themes/{id}   → löschen (`polly_deploy`)
 * Schreiben nur mit Genesys-Bearer und serverseitig geprüfter Rolle; Cognito-M2M-Tokens bekommen 403.
 */

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const WEB_THEMES_TABLE_NAME = process.env.WEB_THEMES_TABLE_NAME ?? "";

/** Ein Design hat wenige hundert Byte; größere Bodies werden nicht geparst. */
const WEB_THEME_MAX_BODY_BYTES = 8 * 1024;

const PATH_PREFIX = "/web-themes";

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

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function listThemes(tenantId: string): Promise<AnyResult> {
  const items = await queryWebThemeItems(WEB_THEMES_TABLE_NAME, tenantId);
  const themes: WebTheme[] = [];
  for (const item of items) {
    const theme = toWebTheme(item);
    if (theme) themes.push(theme);
    else console.warn("[web_themes] skipping invalid item", { tenantId, themeId: item.themeId });
  }
  themes.sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  return jsonResponse(200, { themes });
}

/** Rolle `polly_deploy` des Aufrufers; `error: null` = erlaubt (mit Name des Bearbeiters), sonst die Fehlerantwort. */
async function checkWriteAccess(
  event: AnyApiGwEvent,
  tenantId: string,
  region: string
): Promise<{ error: AnyResult } | { error: null; updatedBy?: string }> {
  const credentials = await loadTenantCredentials(tenantId);
  if (!credentials) {
    return { error: jsonResponse(502, { code: "no_credentials", message: "No Genesys backend credentials for tenant" }) };
  }
  const roleCheck = await requireCallerRole({
    logPrefix: "[web_themes]",
    tenantId,
    region,
    token: getAuthorizationToken(event),
    credentials,
    role: POLLY_ROLE_DEPLOY,
  });
  if (!roleCheck.ok) {
    return { error: jsonResponse(roleCheck.httpStatus, { code: roleCheck.code, message: roleCheck.message }) };
  }
  return { error: null, updatedBy: roleCheck.userName ?? roleCheck.userId };
}

async function putTheme(event: AnyApiGwEvent, tenantId: string, region: string, themeId: string): Promise<AnyResult> {
  const body = readRequestBody(event, WEB_THEME_MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse(413, { code: "payload_too_large", message: "Request body too large" });
  const parsed = parseWebThemeRequest(parseJson(body.text));
  if (!parsed.ok) return jsonResponse(400, { code: "invalid_request", message: parsed.message });

  const access = await checkWriteAccess(event, tenantId, region);
  if (access.error) return access.error;

  const existing = await queryWebThemeItems(WEB_THEMES_TABLE_NAME, tenantId, "themeId, isDefault");
  const isNew = !existing.some((item) => item.themeId === themeId);
  if (isNew && existing.length >= WEB_THEME_MAX_PER_TENANT) {
    return jsonResponse(409, { code: "limit_reached", message: `At most ${WEB_THEME_MAX_PER_TENANT} themes per tenant` });
  }

  const { name, isDefault, tokens, expectedUpdatedAt } = parsed.request;
  const updatedAt = new Date().toISOString();
  const item = { tenantId, themeId, name, isDefault, tokens, updatedAt, updatedBy: access.updatedBy };

  // Optimistisches Sperren: Neu anlegen nur, wenn es die ID noch nicht gibt; Ändern nur auf dem Stand, den
  // der Editor geladen hat. So überschreibt ein veralteter Editor keine fremde Änderung und holt ein
  // zwischenzeitlich gelöschtes Design nicht zurück.
  const put = {
    TableName: WEB_THEMES_TABLE_NAME,
    Item: item,
    ...(expectedUpdatedAt === null
      ? { ConditionExpression: "attribute_not_exists(themeId)" }
      : { ConditionExpression: "updatedAt = :expected", ExpressionAttributeValues: { ":expected": expectedUpdatedAt } }),
  };

  // Neues Standard-Design: Die bisherigen verlieren die Markierung in derselben Transaktion
  const previousDefaults = isDefault
    ? existing.filter((entry) => entry.isDefault === true && entry.themeId !== themeId)
    : [];
  try {
    if (previousDefaults.length === 0) {
      await ddb.send(new PutCommand(put));
    } else {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: put },
            ...previousDefaults.map((entry) => ({
              Update: {
                TableName: WEB_THEMES_TABLE_NAME,
                Key: { tenantId, themeId: entry.themeId },
                UpdateExpression: "SET isDefault = :false",
                ConditionExpression: "attribute_exists(themeId)",
                ExpressionAttributeValues: { ":false": false },
              },
            })),
          ],
        })
      );
    }
  } catch (err: any) {
    // Design zwischenzeitlich geändert/gelöscht oder bisheriges Standard-Design gerade gelöscht: App lädt neu
    if (err?.name === "ConditionalCheckFailedException" || err?.name === "TransactionCanceledException") {
      console.warn("[web_themes] conflict", { tenantId, themeId, expectedUpdatedAt });
      return jsonResponse(409, { code: "conflict", message: "Theme changed concurrently, please reload" });
    }
    throw err;
  }

  console.log("[web_themes] saved", { tenantId, themeId, isNew, isDefault, clearedDefaults: previousDefaults.length });
  return jsonResponse(200, { theme: toWebTheme(item) });
}

async function deleteTheme(event: AnyApiGwEvent, tenantId: string, region: string, themeId: string): Promise<AnyResult> {
  const access = await checkWriteAccess(event, tenantId, region);
  if (access.error) return access.error;

  const result = await ddb.send(
    new DeleteCommand({
      TableName: WEB_THEMES_TABLE_NAME,
      Key: { tenantId, themeId },
      ReturnValues: "ALL_OLD",
    })
  );
  if (!result.Attributes) return jsonResponse(404, { code: "not_found", message: "Theme not found" });

  console.log("[web_themes] deleted", { tenantId, themeId });
  return jsonResponse(200, { ok: true });
}

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  const method = event?.requestContext?.http?.method ?? "";
  const path: string = event?.requestContext?.http?.path ?? event?.rawPath ?? "";

  if (method === "OPTIONS") return jsonResponse(204, "");
  if (!WEB_THEMES_TABLE_NAME) {
    console.error("[web_themes] table not configured");
    return jsonResponse(500, { message: "Internal error" });
  }

  const isList = path === PATH_PREFIX;
  // Design-IDs sind UUIDs, ein kodierter Pfad wird nicht dekodiert, sondern als ungültige ID abgelehnt
  const themeId = path.startsWith(`${PATH_PREFIX}/`) ? path.slice(PATH_PREFIX.length + 1) : "";
  if (!(isList && method === "GET") && !(themeId && (method === "PUT" || method === "DELETE"))) {
    return jsonResponse(404, { message: "Not found", method, path });
  }
  if (!isList && !isValidThemeId(themeId)) {
    return jsonResponse(400, { code: "invalid_request", message: "Theme id must be a valid UUID" });
  }

  const { context, error } = await resolveTenantContext(event, { requireApproved: true });
  if (error || !context?.tenantId) {
    return jsonResponse(401, { code: "unauthorized", message: error ?? "Unauthorized" });
  }

  try {
    if (isList) return await listThemes(context.tenantId);

    // Schreiben nur aus der App-Oberfläche: Für M2M-Tokens (Data Action des Flows) gibt es keine Benutzerrollen
    if (context.source !== "genesys") {
      return jsonResponse(403, { code: "forbidden_m2m", message: "Writing themes requires a Genesys user token" });
    }
    const region = getGenesysRegion(event) ?? context.genesysRegion;
    if (!region) return jsonResponse(400, { code: "invalid_request", message: "Unsupported Genesys region" });

    return method === "PUT"
      ? await putTheme(event, context.tenantId, region, themeId)
      : await deleteTheme(event, context.tenantId, region, themeId);
  } catch (err) {
    console.error("[web_themes] unhandled error", err);
    return jsonResponse(500, { message: "Internal error" });
  }
};
