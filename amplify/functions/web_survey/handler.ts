import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { FlowSurvey } from "../../../src/domain/survey/flowTypes";
import type { WebTheme, WebThemeTokens } from "../../../src/domain/webTheme/webTheme";
import { pruneFlowAnswers, validateFlowAnswers } from "../../../src/domain/survey/flowNavigation";
import type { WebSurveySubmitStatus } from "../../../src/domain/survey/webSurveyTypes";
import { loadFlowSurvey, type ProdSurveyResult } from "../shared/genesys_survey_check";
import { loadInvitationKeys } from "../shared/invitation_keys";
import { verifyInvitation, type InvitationClaims } from "../shared/invitation_token";
import { updateSurveyAggregate } from "../shared/survey_results";
import { loadTenantCredentials, type TenantCredentials } from "../shared/tenant_auth";
import { buildStoredAnswers, surveyVersionOf, toWebSurvey } from "../shared/web_survey_format";
import { pickTheme, toWebTheme } from "../shared/web_themes";
import { queryWebThemeItems } from "../shared/web_themes_table";
import { normalizeToken, parseSubmitRequest, readRequestBody } from "./request";

/**
 * Öffentliche Endpunkte des Web-Kanals (ohne Login, Zugang nur über die signierte Einladung),
 * siehe `documentation/polly_web.md`:
 *  - GET  /web-survey?token=<jwt>   → bereinigter Prod-Stand der Umfrage oder Status
 *  - POST /web-survey/submit        → prüft und speichert alle Antworten auf einmal
 *
 * Jede Antwort hat ein Feld `status` (`WebSurveySubmitStatus`), an dem sich die Umfrageseite orientiert.
 * Dazu kommt, wo der Mandant bekannt ist, das Design der Seite als bereinigte Tokens (`theme`, optional).
 * Webvorschau-Links (Claim `stage`) zeigen den Stage-Stand mit `preview: true`; beim Absenden wird
 * alles geprüft, aber nichts gespeichert.
 */

type AnyApiGwEvent = any;
type AnyResult = { statusCode: number; headers: Record<string, string>; body: string };

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const INVITATION_TOKENS_TABLE_NAME = process.env.INVITATION_TOKENS_TABLE_NAME ?? "";
const SURVEY_RESPONSES_TABLE_NAME = process.env.SURVEY_RESPONSES_TABLE_NAME ?? "";
const SURVEY_AGGREGATES_TABLE_NAME = process.env.SURVEY_AGGREGATES_TABLE_NAME ?? "";
const WEB_THEMES_TABLE_NAME = process.env.WEB_THEMES_TABLE_NAME ?? "";

/** Aufbewahrung benutzter Einmal-Tokens (DynamoDB-TTL `ttl`). */
const USED_TOKEN_RETENTION_SECONDS = 180 * 24 * 60 * 60;
/**
 * Cache des Prod-Stands (bzw. Stage-Stands bei Webvorschau) für GET im Lambda-Container: Große Kampagnen
 * würden sonst bei jedem Seitenaufruf die Genesys-API des Mandanten belasten (Rate-Limit). Das Absenden
 * liest immer frisch und aktualisiert den Cache.
 */
const PROD_CACHE_TTL_MS = 30 * 1000;
const PROD_CACHE_MAX_ENTRIES = 500;

const prodCache = new Map<string, { expiresAt: number; survey: FlowSurvey }>();

/**
 * Cache der Mandanten-Credentials (Query auf die Tenants-Tabelle), damit nicht jeder Seitenaufruf DynamoDB abfragt.
 * Nur Treffer werden gemerkt; ein entzogener Mandant wird spätestens nach Ablauf abgelehnt.
 */
const TENANT_CACHE_TTL_MS = 60 * 1000;
const TENANT_CACHE_MAX_ENTRIES = 500;

const tenantCache = new Map<string, { expiresAt: number; credentials: TenantCredentials }>();

async function loadCredentialsCached(tenantId: string): Promise<TenantCredentials | undefined> {
  const cached = tenantCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.credentials;

  const credentials = await loadTenantCredentials(tenantId);
  if (credentials) {
    if (tenantCache.size >= TENANT_CACHE_MAX_ENTRIES) tenantCache.clear();
    tenantCache.set(tenantId, { credentials, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
  } else {
    tenantCache.delete(tenantId);
  }
  return credentials;
}

/**
 * Cache der Designs pro Mandant (eine Query auf PK `tenantId`, höchstens 50 Designs, wenige KB).
 * Auch eine leere Liste wird gemerkt. Änderungen an einem Design wirken so nach höchstens 30 s.
 */
const THEME_CACHE_TTL_MS = 30 * 1000;
const THEME_CACHE_MAX_ENTRIES = 500;

const themeCache = new Map<string, { expiresAt: number; themes: WebTheme[] }>();

/**
 * Designs des Mandanten (gecacht). Fehler sind nicht fatal: Die Seite erscheint dann im eingebauten Design.
 * Läuft per `Promise.all` parallel zum Laden des Prod-Stands, weil nur `tenantId` gebraucht wird.
 */
async function loadTenantThemesCached(tenantId: string): Promise<WebTheme[]> {
  if (!WEB_THEMES_TABLE_NAME) return [];
  const cached = themeCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.themes;

  try {
    const items = await queryWebThemeItems(WEB_THEMES_TABLE_NAME, tenantId);
    const themes = items.map(toWebTheme).filter((theme): theme is WebTheme => theme !== null);
    if (themeCache.size >= THEME_CACHE_MAX_ENTRIES) themeCache.clear();
    themeCache.set(tenantId, { themes, expiresAt: Date.now() + THEME_CACHE_TTL_MS });
    return themes;
  } catch (err) {
    console.error("[web_survey] cannot load themes", { tenantId, error: String((err as Error)?.message ?? err) });
    return [];
  }
}

/** `{ preview: true }` nur bei Webvorschau-Links (Stage-Stand, nichts wird gespeichert). */
function previewField(claims: InvitationClaims): { preview?: true } {
  return claims.stage ? { preview: true } : {};
}

/** `{ theme }` nur, wenn es ein Design gibt (sonst bleibt das Feld weg). */
function themeField(theme: WebThemeTokens | undefined): { theme?: WebThemeTokens } {
  return theme ? { theme } : {};
}

function jsonResponse(statusCode: number, body: { status: WebSurveySubmitStatus } & Record<string, unknown>): AnyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
    },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Einladung prüfen
// ---------------------------------------------------------------------------

type InvitationCheck =
  | { status: "ok"; claims: InvitationClaims; credentials: TenantCredentials }
  | { status: "invalid" | "expired" }
  | { status: "used"; claims: InvitationClaims; credentials: TenantCredentials; usedResponseId?: string };

/** Eintrag eines verbrauchten Einmal-Tokens (mit der zugehörigen Antwort) oder `null`. */
async function loadUsedToken(tenantId: string, tokenId: string): Promise<{ responseId?: string } | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: INVITATION_TOKENS_TABLE_NAME,
      Key: { tenantId, tokenId },
      ProjectionExpression: "tokenId, responseId",
      ConsistentRead: true,
    })
  );
  if (!result.Item) return null;
  return { responseId: typeof result.Item.responseId === "string" ? result.Item.responseId : undefined };
}

/** Signatur, `kid`, `exp`, Mandant (`APPROVED` mit Credentials) und bei Einmal-Token die Nutzung. */
async function checkInvitation(token: string): Promise<InvitationCheck> {
  if (!token) return { status: "invalid" };

  const verification = verifyInvitation(token, await loadInvitationKeys());
  if (!verification.ok) return { status: verification.error };
  const { claims } = verification;

  const credentials = await loadCredentialsCached(claims.tenant_id);
  if (!credentials) {
    console.warn("[web_survey] unknown or unapproved tenant", { tenantId: claims.tenant_id });
    return { status: "invalid" };
  }
  if (!claims.multi) {
    const used = await loadUsedToken(claims.tenant_id, claims.token_id);
    if (used) return { status: "used", claims, credentials, usedResponseId: used.responseId };
  }

  return { status: "ok", claims, credentials };
}

function invitationErrorResponse(
  check: Exclude<InvitationCheck, { status: "ok" }>,
  forSubmit: boolean,
  theme?: WebThemeTokens
): AnyResult {
  // GET liefert die Zustände als 200 (die Seite zeigt eine Meldung), beim Absenden sind es Fehler
  if (!forSubmit) return jsonResponse(200, { status: check.status, ...themeField(theme) });
  return jsonResponse(check.status === "used" ? 409 : 403, { status: check.status });
}

// ---------------------------------------------------------------------------
// Prod- bzw. Stage-Stand
// ---------------------------------------------------------------------------

/** Prod-Stand, bei Webvorschau-Links (`stage`) der Stage-Stand. */
async function loadProd(claims: InvitationClaims, credentials: TenantCredentials, fresh: boolean): Promise<ProdSurveyResult> {
  const column = claims.stage ? "Stage" : "Prod";
  const cacheKey = `${claims.tenant_id}#${claims.survey_id}#${column}`;
  const cached = prodCache.get(cacheKey);
  if (!fresh && cached && cached.expiresAt > Date.now()) return { status: "ok", survey: cached.survey };

  const result = await loadFlowSurvey(claims.tenant_id, claims.survey_id, credentials, column);
  if (result.status === "ok") {
    if (prodCache.size >= PROD_CACHE_MAX_ENTRIES) prodCache.clear();
    prodCache.set(cacheKey, { survey: result.survey, expiresAt: Date.now() + PROD_CACHE_TTL_MS });
  } else if (result.status === "unavailable") {
    prodCache.delete(cacheKey);
  }
  return result;
}

function prodErrorResponse(
  result: Exclude<ProdSurveyResult, { status: "ok" }>,
  claims: InvitationClaims,
  forSubmit: boolean,
  theme?: WebThemeTokens
): AnyResult {
  if (result.status === "unavailable") {
    return jsonResponse(forSubmit ? 404 : 200, { status: "unavailable", ...themeField(theme) });
  }
  console.error("[web_survey] cannot load survey", {
    tenantId: claims.tenant_id,
    surveyId: claims.survey_id,
    stage: claims.stage === true,
    reason: result.reason,
  });
  return result.throttled ? jsonResponse(429, { status: "throttled" }) : jsonResponse(502, { status: "error" });
}

// ---------------------------------------------------------------------------
// Routen
// ---------------------------------------------------------------------------

/** GET /web-survey?token=<jwt> */
async function getWebSurvey(event: AnyApiGwEvent): Promise<AnyResult> {
  const check = await checkInvitation(normalizeToken(event?.queryStringParameters?.token));
  if (check.status === "used") {
    // Signatur gültig, Mandant bekannt: Meldung im Design der Umfrage (z. B. im iframe). Prod kommt meist
    // aus dem Cache; lässt er sich nicht laden, gilt das Standard-Design des Mandanten.
    const [prod, themes] = await Promise.all([
      loadProd(check.claims, check.credentials, false).catch(() => null),
      loadTenantThemesCached(check.claims.tenant_id),
    ]);
    const webThemeId = prod?.status === "ok" ? prod.survey.web_theme_id : undefined;
    return invitationErrorResponse(check, false, pickTheme(themes, webThemeId));
  }
  if (check.status !== "ok") return invitationErrorResponse(check, false);

  const [prod, themes] = await Promise.all([
    loadProd(check.claims, check.credentials, false),
    loadTenantThemesCached(check.claims.tenant_id),
  ]);
  if (prod.status !== "ok") return prodErrorResponse(prod, check.claims, false, pickTheme(themes));

  return jsonResponse(200, {
    status: "ok",
    survey: toWebSurvey(prod.survey),
    ...themeField(pickTheme(themes, prod.survey.web_theme_id)),
    ...previewField(check.claims),
  });
}

/** Abbruchgründe einer Transaktion (`ConditionalCheckFailed`, `TransactionConflict`, …); leer bei anderen Fehlern. */
function cancellationCodes(err: any): string[] {
  if (err?.name !== "TransactionCanceledException") return [];
  const reasons: Array<{ Code?: string }> = Array.isArray(err?.CancellationReasons) ? err.CancellationReasons : [];
  return reasons.map((reason) => String(reason?.Code ?? ""));
}

/** Versuche bei `TransactionConflict` (zwei Absendungen desselben Einmal-Tokens im selben Moment). */
const TRANSACTION_CONFLICT_ATTEMPTS = 3;
const TRANSACTION_CONFLICT_DELAY_MS = 100;

/**
 * Schreibt die Transaktion. `condition_failed`, wenn das Einmal-Token schon verbraucht ist oder die
 * `responseId` schon existiert. Kollidiert sie mit einer gleichzeitigen Transaktion auf dasselbe Token,
 * wird sie kurz wiederholt: Hat die andere gespeichert, scheitert die Wiederholung an der Bedingung,
 * sonst wird jetzt gespeichert.
 */
async function writeSubmitTransaction(transactItems: any[]): Promise<"ok" | "condition_failed"> {
  for (let attempt = 1; ; attempt++) {
    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
      return "ok";
    } catch (err: any) {
      const codes = cancellationCodes(err);
      if (codes.includes("ConditionalCheckFailed")) return "condition_failed";
      if (!codes.includes("TransactionConflict") || attempt >= TRANSACTION_CONFLICT_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, TRANSACTION_CONFLICT_DELAY_MS * attempt));
    }
  }
}

/** Liegt unter `responseId` schon eine Antwort mit dieser Einladung (frühere Absendung derselben Seite)? */
async function isStoredWithToken(claims: InvitationClaims, responseId: string): Promise<boolean> {
  const result = await ddb.send(
    new GetCommand({
      TableName: SURVEY_RESPONSES_TABLE_NAME,
      Key: { tenantId: claims.tenant_id, responseId },
      ProjectionExpression: "tokenId, surveyId, channel",
      ConsistentRead: true,
    })
  );
  const item = result.Item;
  return Boolean(item && item.channel === "web" && item.tokenId === claims.token_id && item.surveyId === claims.survey_id);
}

function duplicateSubmitResponse(claims: InvitationClaims, responseId: string): AnyResult {
  console.log("[web_survey] duplicate submit, already saved", {
    tenantId: claims.tenant_id,
    surveyId: claims.survey_id,
    responseId,
  });
  return jsonResponse(200, { status: "ok" });
}

/**
 * POST /web-survey/submit
 *
 * Idempotent über `submissionId`: Die Seite schickt bei jeder Wiederholung dieselbe ID (sie wird `responseId`).
 * War eine frühere Absendung schon gespeichert (Antwort ging z. B. durch eine Zeitüberschreitung verloren),
 * antwortet die Lambda mit `200 ok`, ohne erneut zu speichern.
 */
async function submitWebSurvey(event: AnyApiGwEvent): Promise<AnyResult> {
  const body = readRequestBody(event);
  if (!body.ok) return jsonResponse(413, { status: "payload_too_large" });

  const parsed = parseSubmitRequest(body.text);
  if (!parsed.ok) return jsonResponse(400, { status: "invalid_request", message: parsed.message });
  const { token, surveyVersion, answers, submissionId } = parsed.request;

  const check = await checkInvitation(token);
  if (check.status === "used" && submissionId && check.usedResponseId === submissionId) {
    return duplicateSubmitResponse(check.claims, submissionId);
  }
  if (check.status !== "ok") return invitationErrorResponse(check, true);
  const { claims } = check;

  const prod = await loadProd(claims, check.credentials, true);
  if (prod.status !== "ok") return prodErrorResponse(prod, claims, true);
  const survey = prod.survey;
  const currentVersion = surveyVersionOf(survey);

  // Prod hat sich seit dem Laden geändert: nichts speichern, Token bleibt unverbraucht.
  // Die neue Fassung geht gleich mit, die Seite übernimmt die noch passenden Antworten.
  if (surveyVersion !== currentVersion) {
    const themes = await loadTenantThemesCached(claims.tenant_id);
    return jsonResponse(409, {
      status: "survey_changed",
      survey: toWebSurvey(survey),
      ...themeField(pickTheme(themes, survey.web_theme_id)),
      ...previewField(claims),
    });
  }

  const errors = validateFlowAnswers(survey, answers);
  if (errors.length > 0) return jsonResponse(400, { status: "invalid_answers", errors });

  // Webvorschau: alles geprüft wie beim echten Absenden, gespeichert wird nichts (auch keine Aggregate)
  if (claims.stage) {
    console.log("[web_survey] preview submit, not saved", {
      tenantId: claims.tenant_id,
      surveyId: claims.survey_id,
      surveyVersion: currentVersion,
    });
    return jsonResponse(200, { status: "ok", preview: true });
  }

  const now = new Date().toISOString();
  const responseId = submissionId ?? randomUUID();
  const storedAnswers = buildStoredAnswers(survey, pruneFlowAnswers(survey, answers), now);

  const responseItem = {
    tenantId: claims.tenant_id,
    responseId,
    surveyId: claims.survey_id,
    surveyName: survey.name ?? "",
    surveyVersion: currentVersion,
    status: "completed",
    channel: "web",
    tokenId: claims.token_id,
    startedAt: now,
    completedAt: now,
    updatedAt: now,
    surveyStartedAt: `${claims.survey_id}#${now}`,
    answers: storedAnswers,
  };

  const transactItems: any[] = [];
  if (!claims.multi) {
    // Einmal-Token atomar mit der Antwort verbrauchen: Bei gleichzeitigem Absenden gewinnt genau einer
    transactItems.push({
      Put: {
        TableName: INVITATION_TOKENS_TABLE_NAME,
        Item: {
          tenantId: claims.tenant_id,
          tokenId: claims.token_id,
          tenantSurveyId: `${claims.tenant_id}#${claims.survey_id}`,
          surveyId: claims.survey_id,
          usedAt: now,
          responseId,
          ttl: Math.floor(Date.now() / 1000) + USED_TOKEN_RETENTION_SECONDS,
        },
        ConditionExpression: "attribute_not_exists(tokenId)",
      },
    });
  }
  transactItems.push({
    Put: {
      TableName: SURVEY_RESPONSES_TABLE_NAME,
      Item: responseItem,
      ConditionExpression: "attribute_not_exists(responseId)",
    },
  });

  if ((await writeSubmitTransaction(transactItems)) === "condition_failed") {
    if (await isStoredWithToken(claims, responseId)) return duplicateSubmitResponse(claims, responseId);
    // Einmal-Token von einer anderen Absendung verbraucht; bei mehrfach nutzbaren Links ist die ID fremd belegt
    return claims.multi
      ? jsonResponse(400, { status: "invalid_request", message: "submissionId already in use" })
      : jsonResponse(409, { status: "used" });
  }

  // Aggregate erst nach dem Speichern; ein Fehler hier macht die gespeicherte Antwort nicht ungültig
  const aggregateResults = await Promise.allSettled(
    Object.entries(storedAnswers).map(([questionName, answer]) =>
      updateSurveyAggregate(
        claims.tenant_id,
        {
          surveyId: claims.survey_id,
          surveyName: responseItem.surveyName,
          questionName,
          questionType: answer.type,
          value: answer.value,
        },
        now
      )
    )
  );
  const failedAggregates = aggregateResults.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failedAggregates.length > 0) {
    console.warn("[web_survey] aggregate updates failed", {
      tenantId: claims.tenant_id,
      responseId,
      failedAggregates: failedAggregates.length,
      error: failedAggregates[0].reason,
    });
  }

  console.log("[web_survey] response saved", {
    tenantId: claims.tenant_id,
    surveyId: claims.survey_id,
    surveyVersion: currentVersion,
    responseId,
    multi: claims.multi,
    answers: Object.keys(storedAnswers).length,
  });
  return jsonResponse(200, { status: "ok" });
}

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  const method = event?.requestContext?.http?.method ?? "";
  const path = event?.requestContext?.http?.path ?? event?.rawPath ?? "";

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  }

  if (!INVITATION_TOKENS_TABLE_NAME || !SURVEY_RESPONSES_TABLE_NAME || !SURVEY_AGGREGATES_TABLE_NAME) {
    console.error("[web_survey] tables not configured");
    return jsonResponse(500, { status: "error" });
  }

  try {
    if (method === "GET" && path === "/web-survey") return await getWebSurvey(event);
    if (method === "POST" && path === "/web-survey/submit") return await submitWebSurvey(event);
    return jsonResponse(404, { status: "error", message: "Not found" });
  } catch (err) {
    console.error("[web_survey] unhandled error", err);
    return jsonResponse(500, { status: "error" });
  }
};
