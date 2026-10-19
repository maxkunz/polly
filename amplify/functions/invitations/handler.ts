import { randomUUID } from "crypto";
import { POLLY_ROLE_DEPLOY } from "../../../src/constants/permissionConstants";
import { hasPollyRole } from "../../../src/domain/permissions/roleCheck";
import { getSurveyTableAccess, loadProdSurvey, loadProjectTag } from "../shared/genesys_survey_check";
import { fetchWithTimeout, readRequestBody } from "../shared/http";
import { loadInvitationKeys } from "../shared/invitation_keys";
import { signInvitation } from "../shared/invitation_token";
import {
  getAuthorizationToken,
  getGenesysRegion,
  loadTenantCredentials,
  resolveTenantContext,
  type TenantCredentials,
} from "../shared/tenant_auth";
import { parseInvitationRequest } from "./request";

/**
 * POST /invitations – signiert Einladungslinks für den Web-Kanal (siehe `documentation/polly_web.md`).
 * Nur mit Genesys-Bearer eines Users mit Rolle `polly_deploy` (serverseitig geprüft); Cognito-M2M-Tokens
 * werden abgelehnt. Die Tokens werden nicht gespeichert, den Link baut das Frontend.
 */

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };

/** Der Body enthält nur wenige Felder; größere Bodies werden nicht geparst. */
const INVITATION_MAX_BODY_BYTES = 4 * 1024;

function jsonResponse(statusCode: number, body: unknown): AnyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST",
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

type CallerRoles =
  | { status: "ok"; roles: string[] }
  | { status: "unauthorized"; httpStatus: number }
  | { status: "error"; httpStatus?: number; error?: string };

/** Rollen des Aufrufers wie im Frontend (`loadCurrentUserRoles`), mit seinem eigenen Genesys-Token. */
async function loadCallerRoles(region: string, token: string): Promise<CallerRoles> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`https://api.${region}/api/v2/users/me?expand=authorization`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err: any) {
    // Timeout oder Netzwerkfehler: als Genesys-Fehler melden statt als 500
    return { status: "error", error: String(err?.message ?? err) };
  }
  if (res.status === 401) return { status: "unauthorized", httpStatus: res.status };
  // 403: dem Token fehlt der Scope authorization:readonly, wie im Frontend gilt der User dann als ohne Rolle
  if (res.status === 403) return { status: "ok", roles: [] };
  if (!res.ok) return { status: "error", httpStatus: res.status };
  const me: any = await res.json();
  const roles: Array<{ name?: unknown }> = Array.isArray(me?.authorization?.roles) ? me.authorization.roles : [];
  return { status: "ok", roles: roles.map((role) => String(role?.name ?? "")).filter(Boolean) };
}

type ProjectTagResult = { ok: true; projectTag: string | undefined } | { ok: false; httpStatus?: number; error: string };

/** Projekt-Tag der Installation, damit die präfixierte Rolle wie im Frontend erkannt wird. */
async function loadInstallationProjectTag(credentials: TenantCredentials): Promise<ProjectTagResult> {
  try {
    return { ok: true, projectTag: await loadProjectTag(await getSurveyTableAccess(credentials)) };
  } catch (err: any) {
    return { ok: false, httpStatus: err?.status, error: String(err?.message ?? err) };
  }
}

async function createInvitations(event: AnyApiGwEvent, tenantId: string, region: string): Promise<AnyResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const body = readRequestBody(event, INVITATION_MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse(413, { code: "payload_too_large", message: "Request body too large" });
  const parsed = parseInvitationRequest(parseJson(body.text), nowSeconds);
  if (!parsed.ok) return jsonResponse(400, { code: "invalid_request", message: parsed.message });
  const { surveyId, count, multi, exp } = parsed.request;

  const credentials = await loadTenantCredentials(tenantId);
  if (!credentials) {
    return jsonResponse(502, { code: "no_credentials", message: "No Genesys backend credentials for tenant" });
  }

  // Rollen und Projekt-Tag sind unabhängig voneinander: parallel laden spart einen Genesys-Umlauf
  const [caller, projectTag] = await Promise.all([
    loadCallerRoles(region, getAuthorizationToken(event)),
    loadInstallationProjectTag(credentials),
  ]);
  if (caller.status === "unauthorized") return jsonResponse(401, { code: "unauthorized", message: "Genesys token invalid" });
  if (caller.status === "error") {
    console.error("[invitations] cannot load roles", { tenantId, httpStatus: caller.httpStatus, error: caller.error });
    return jsonResponse(caller.httpStatus === 429 ? 429 : 502, { code: "genesys_error", message: "Cannot load user roles" });
  }
  if (!projectTag.ok) {
    console.error("[invitations] cannot read __meta", { tenantId, error: projectTag.error });
    return jsonResponse(projectTag.httpStatus === 429 ? 429 : 502, { code: "genesys_error", message: "Cannot read setup metadata" });
  }
  if (!hasPollyRole(caller.roles, POLLY_ROLE_DEPLOY, projectTag.projectTag)) {
    console.warn("[invitations] missing role", { tenantId, projectTag: projectTag.projectTag });
    return jsonResponse(403, { code: "missing_role", message: `Role ${POLLY_ROLE_DEPLOY} required` });
  }

  const prod = await loadProdSurvey(tenantId, surveyId, credentials);
  if (prod.status === "unavailable") {
    return jsonResponse(409, { code: "no_prod", message: "Survey has no Prod version", reason: prod.reason });
  }
  if (prod.status === "error") {
    console.error("[invitations] cannot load Prod", { tenantId, surveyId, reason: prod.reason });
    return jsonResponse(prod.throttled ? 429 : 502, { code: "genesys_error", message: "Cannot load survey" });
  }

  const [signingKey] = await loadInvitationKeys();
  const tokens = Array.from({ length: count }, () => ({
    jwt: signInvitation(
      { tenant_id: tenantId, survey_id: surveyId, token_id: randomUUID(), multi, iat: nowSeconds, ...(exp !== undefined ? { exp } : {}) },
      signingKey,
      nowSeconds
    ),
    exp,
    multi,
  }));

  console.log("[invitations] created", { tenantId, surveyId, count, multi, exp: exp ?? null, kid: signingKey.kid });
  return jsonResponse(200, { tokens });
}

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  const method = event?.requestContext?.http?.method ?? "";
  const path = event?.requestContext?.http?.path ?? event?.rawPath ?? "";

  if (method === "OPTIONS") return jsonResponse(204, "");
  if (method !== "POST" || path !== "/invitations") {
    return jsonResponse(404, { message: "Not found", method, path });
  }

  const { context, error } = await resolveTenantContext(event, { requireApproved: true });
  if (error || !context?.tenantId) {
    return jsonResponse(401, { code: "unauthorized", message: error ?? "Unauthorized" });
  }
  // Für M2M-Tokens (Data Action des Flows) gibt es keine Benutzerrollen; Links erzeugt nur die App-Oberfläche
  if (context.source !== "genesys") {
    return jsonResponse(403, { code: "forbidden_m2m", message: "Invitations require a Genesys user token" });
  }
  const region = getGenesysRegion(event) ?? context.genesysRegion;
  if (!region) return jsonResponse(400, { code: "invalid_request", message: "Unsupported Genesys region" });

  try {
    return await createInvitations(event, context.tenantId, region);
  } catch (err) {
    console.error("[invitations] unhandled error", err);
    return jsonResponse(500, { message: "Internal error" });
  }
};
