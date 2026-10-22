import { randomUUID } from "crypto";
import { POLLY_ROLE_DEPLOY } from "../../../src/constants/permissionConstants";
import { requireCallerRole } from "../shared/caller_roles";
import { PREVIEW_TOKEN_TTL_SECONDS } from "../../../src/domain/survey/invitationLinks";
import { loadFlowSurvey, loadProdSurvey } from "../shared/genesys_survey_check";
import { readRequestBody } from "../shared/http";
import { loadInvitationKeys } from "../shared/invitation_keys";
import { signInvitation } from "../shared/invitation_token";
import {
  getAuthorizationToken,
  getGenesysRegion,
  loadTenantCredentials,
  resolveTenantContext,
  type TenantCredentials,
} from "../shared/tenant_auth";
import { parseInvitationRequest, parsePreviewRequest } from "./request";

/**
 * POST /invitations – signiert Einladungslinks für den Web-Kanal (siehe `documentation/polly_web.md`).
 * POST /invitations/preview – signiert einen Webvorschau-Link auf den Stage-Stand (`stage: true`,
 * mehrfach nutzbar, läuft nach `PREVIEW_TOKEN_TTL_SECONDS` ab; `web_survey` speichert dazu nichts).
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

type CallerCheck = { ok: true; credentials: TenantCredentials } | { ok: false; response: AnyResult };

/** Lädt die Credentials des Mandanten und prüft die Rolle `polly_deploy` des Aufrufers. */
async function checkCaller(event: AnyApiGwEvent, tenantId: string, region: string): Promise<CallerCheck> {
  const credentials = await loadTenantCredentials(tenantId);
  if (!credentials) {
    return {
      ok: false,
      response: jsonResponse(502, { code: "no_credentials", message: "No Genesys backend credentials for tenant" }),
    };
  }

  const roleCheck = await requireCallerRole({
    logPrefix: "[invitations]",
    tenantId,
    region,
    token: getAuthorizationToken(event),
    credentials,
    role: POLLY_ROLE_DEPLOY,
  });
  if (!roleCheck.ok) {
    return { ok: false, response: jsonResponse(roleCheck.httpStatus, { code: roleCheck.code, message: roleCheck.message }) };
  }
  return { ok: true, credentials };
}

async function createInvitations(event: AnyApiGwEvent, tenantId: string, region: string): Promise<AnyResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const body = readRequestBody(event, INVITATION_MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse(413, { code: "payload_too_large", message: "Request body too large" });
  const parsed = parseInvitationRequest(parseJson(body.text), nowSeconds);
  if (!parsed.ok) return jsonResponse(400, { code: "invalid_request", message: parsed.message });
  const { surveyId, count, multi, exp } = parsed.request;

  const caller = await checkCaller(event, tenantId, region);
  if (!caller.ok) return caller.response;

  const prod = await loadProdSurvey(tenantId, surveyId, caller.credentials);
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

async function createPreviewInvitation(event: AnyApiGwEvent, tenantId: string, region: string): Promise<AnyResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const body = readRequestBody(event, INVITATION_MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse(413, { code: "payload_too_large", message: "Request body too large" });
  const parsed = parsePreviewRequest(parseJson(body.text));
  if (!parsed.ok) return jsonResponse(400, { code: "invalid_request", message: parsed.message });
  const { surveyId } = parsed;

  const caller = await checkCaller(event, tenantId, region);
  if (!caller.ok) return caller.response;

  const stage = await loadFlowSurvey(tenantId, surveyId, caller.credentials, "Stage");
  if (stage.status === "unavailable") {
    return jsonResponse(409, { code: "no_stage", message: "Survey has no Stage version", reason: stage.reason });
  }
  if (stage.status === "error") {
    console.error("[invitations] cannot load Stage", { tenantId, surveyId, reason: stage.reason });
    return jsonResponse(stage.throttled ? 429 : 502, { code: "genesys_error", message: "Cannot load survey" });
  }

  const [signingKey] = await loadInvitationKeys();
  const exp = nowSeconds + PREVIEW_TOKEN_TTL_SECONDS;
  const jwt = signInvitation(
    { tenant_id: tenantId, survey_id: surveyId, token_id: randomUUID(), multi: true, stage: true, iat: nowSeconds, exp },
    signingKey,
    nowSeconds
  );

  console.log("[invitations] preview created", { tenantId, surveyId, exp, kid: signingKey.kid });
  return jsonResponse(200, { jwt, exp });
}

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  const method = event?.requestContext?.http?.method ?? "";
  const path = event?.requestContext?.http?.path ?? event?.rawPath ?? "";

  if (method === "OPTIONS") return jsonResponse(204, "");
  if (method !== "POST" || (path !== "/invitations" && path !== "/invitations/preview")) {
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
    return path === "/invitations/preview"
      ? await createPreviewInvitation(event, context.tenantId, region)
      : await createInvitations(event, context.tenantId, region);
  } catch (err) {
    console.error("[invitations] unhandled error", err);
    return jsonResponse(500, { message: "Internal error" });
  }
};
