import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { POLLY_ROLE_DEPLOY } from "../../../src/constants/permissionConstants";
import { WEB_THEME_MAX_PER_TENANT, type WebTheme } from "../../../src/domain/webTheme/webTheme";
import { resolveApiClient } from "../shared/api_client_auth";
import { requireCallerRole } from "../shared/caller_roles";
import { dispatchExtRoute, extError as extErrorWith, extHeaders, extJson, isExtRouteKey } from "../shared/ext_http";
import type { ExtRoute } from "../shared/ext_http";
import { readRequestBody } from "../shared/http";
import {
  getAuthorizationToken,
  getGenesysRegion,
  loadTenantCredentials,
  resolveTenantContext,
} from "../shared/tenant_auth";
import { compareWebThemes, isValidThemeId, parseWebThemeRequest, toWebTheme } from "../shared/web_themes";
import { queryWebThemeItems, saveWebThemes } from "../shared/web_themes_table";
import { buildV1ImportResponse, buildV1Response, IMPORT_MAX_BODY_BYTES, parseV1ImportRequest } from "./ext_v1";

/**
 * Web-Designs der öffentlichen Umfrageseite pro Mandant (siehe `documentation/polly_web.md`, „Designs“):
 *  - GET    /web-themes        → alle Designs des Mandanten (jeder angemeldete App-Nutzer)
 *  - PUT    /web-themes/{id}   → anlegen oder ändern (`polly_deploy`)
 *  - DELETE /web-themes/{id}   → löschen (`polly_deploy`)
 * Schreiben nur mit Genesys-Bearer und serverseitig geprüfter Rolle; Cognito-M2M-Tokens bekommen 403.
 * Kunden-API (Anmeldung über `resolveApiClient`, siehe `documentation/polly_customer_api.md`):
 *  - GET  /ext/v1/web-themes         → Export (Scope `themes.read`)
 *  - POST /ext/v1/web-themes/import  → Import als Upsert nach `themeId` (Scope `themes.write`)
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

/** Alle gültigen Designs des Mandanten (ohne Cache); ungültige Einträge werden übersprungen. */
async function loadThemes(tenantId: string): Promise<WebTheme[]> {
  const items = await queryWebThemeItems(WEB_THEMES_TABLE_NAME, tenantId);
  const themes: WebTheme[] = [];
  for (const item of items) {
    const theme = toWebTheme(item);
    if (theme) themes.push(theme);
    else console.warn("[web_themes] skipping invalid item", { tenantId, themeId: item.themeId });
  }
  return themes;
}

async function listThemes(tenantId: string): Promise<AnyResult> {
  const themes = await loadThemes(tenantId);
  themes.sort(compareWebThemes);
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

  const { name, isDefault, tokens, expectedUpdatedAt } = parsed.request;
  const saved = await saveWebThemes(
    WEB_THEMES_TABLE_NAME,
    tenantId,
    [{ themeId, name, isDefault, tokens }],
    access.updatedBy,
    { expectedUpdatedAt }
  );
  if (!saved.ok) {
    if (saved.reason === "limit_reached") {
      return jsonResponse(409, { code: "limit_reached", message: `At most ${WEB_THEME_MAX_PER_TENANT} themes per tenant` });
    }
    console.warn("[web_themes] conflict", { tenantId, themeId, expectedUpdatedAt });
    return jsonResponse(409, { code: "conflict", message: "Theme changed concurrently, please reload" });
  }

  console.log("[web_themes] saved", {
    tenantId,
    themeId,
    isNew: saved.created > 0,
    isDefault,
    clearedDefaults: saved.clearedDefaults,
  });
  return jsonResponse(200, { theme: saved.themes[0] });
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

const extResponseHeaders = extHeaders("GET,POST");

function extError(statusCode: number, error: string, message: string): AnyResult {
  return extErrorWith(extResponseHeaders, statusCode, error, message);
}

async function exportExtThemes(event: AnyApiGwEvent): Promise<AnyResult> {
  const auth = await resolveApiClient(event, "polly-api/themes.read");
  if (!auth.ok) return extError(auth.statusCode, auth.error, auth.message);

  const themes = await loadThemes(auth.tenantId);
  console.log("[web_themes] exported (ext v1)", { clientId: auth.clientId, tenantId: auth.tenantId, count: themes.length });
  return extJson(extResponseHeaders, 200, buildV1Response(themes));
}

async function importExtThemes(event: AnyApiGwEvent): Promise<AnyResult> {
  const auth = await resolveApiClient(event, "polly-api/themes.write");
  if (!auth.ok) return extError(auth.statusCode, auth.error, auth.message);

  const body = readRequestBody(event, IMPORT_MAX_BODY_BYTES);
  if (!body.ok) return extError(413, "payload_too_large", "Request body too large");
  const parsed = parseV1ImportRequest(parseJson(body.text));
  if (!parsed.ok) return extError(400, "invalid_request", parsed.message);

  const { tenantId, clientId } = auth;
  // Der Import gewinnt: kein optimistisches Sperren, Bearbeiter ist der API-Client
  const saved = await saveWebThemes(WEB_THEMES_TABLE_NAME, tenantId, parsed.themes, `api:${clientId}`);
  if (!saved.ok) {
    if (saved.reason === "limit_reached") {
      return extError(409, "limit_reached", `At most ${WEB_THEME_MAX_PER_TENANT} themes per tenant`);
    }
    console.warn("[web_themes] conflict (ext v1)", { clientId, tenantId });
    return extError(409, "conflict", "Themes changed concurrently, please retry");
  }

  console.log("[web_themes] imported (ext v1)", {
    clientId,
    tenantId,
    created: saved.created,
    updated: saved.updated,
    clearedDefaults: saved.clearedDefaults,
  });
  return extJson(extResponseHeaders, 200, buildV1ImportResponse(saved.themes, saved));
}

/** Routing der Kunden-API: eine neue Version braucht nur einen weiteren Eintrag. */
export const extRoutes: Record<string, ExtRoute> = {
  "GET /ext/v1/web-themes": exportExtThemes,
  "POST /ext/v1/web-themes/import": importExtThemes,
};

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  const method = event?.requestContext?.http?.method ?? "";
  const path: string = event?.requestContext?.http?.path ?? event?.rawPath ?? "";

  // Kunden-API: nur nach routeKey, wie das Routing selbst, und vor der Mandantenauflösung der App
  if (isExtRouteKey(event)) {
    return dispatchExtRoute(extRoutes, event, undefined, extResponseHeaders, "[web_themes] (ext)");
  }

  if (method === "OPTIONS") return jsonResponse(204, "");
  if (!WEB_THEMES_TABLE_NAME) {
    console.error("[web_themes] table not configured");
    return jsonResponse(500, { message: "Internal error" });
  }

  const isList = path === PATH_PREFIX;
  // Design-IDs sind UUIDs, ein kodierter Pfad wird nicht dekodiert, sondern als ungültige ID abgelehnt.
  // Kleingeschrieben wie beim Import, damit dieselbe ID nicht in zwei Schreibweisen gespeichert wird.
  const themeId = path.startsWith(`${PATH_PREFIX}/`) ? path.slice(PATH_PREFIX.length + 1).toLowerCase() : "";
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
