import { randomUUID } from "node:crypto";
import {
  POLLY_ROLE_DEPLOY,
  POLLY_ROLE_REPORTING,
  POLLY_ROLE_WRITE,
} from "../../../src/constants/permissionConstants";
import { isFeatureEnabled, type FeatureFlags } from "../../../src/domain/features/featureFlags";
import {
  defaultWebThemeTokens,
  sanitizeWebThemeTokens,
  WEB_THEME_MAX_PER_TENANT,
  type WebTheme,
  type WebThemeTokens,
} from "../../../src/domain/webTheme/webTheme";
import { isValidSurveyId } from "../shared/survey_id";
import type { ExportSession } from "../shared/answer_records";
import { openCursor, sealCursor, type PseudonymKeys } from "../shared/pseudonym";
import { MAX_RANGE_MS, MAX_SUMMARY_RANGE_MS } from "../shared/reporting_limits";
import type { ExportSummary } from "../shared/session_summary";
import type { SurveyAggregateItem } from "../shared/survey_results";
import type { Survey } from "../../../src/domain/survey/surveyTypes";
import { checkDraft, prepareDraft, type SurveyStoreError } from "../shared/survey_pipeline";
import type {
  beginEdit as storeBeginEdit,
  createSurvey as storeCreateSurvey,
  deploySurvey as storeDeploySurvey,
  DeployTarget,
  endEdit as storeEndEdit,
  rollbackSurvey as storeRollbackSurvey,
  saveDraft as storeSaveDraft,
  StoreResult,
  SurveyListItem,
  SurveyRowView,
  SurveyStoreContext,
} from "../shared/survey_store";
import type { TenantCredentials } from "../shared/tenant_auth";
import { checkWebThemeName, isValidThemeId } from "../shared/web_themes";
import type { SaveWebThemesResult, WebThemeInput } from "../shared/web_themes_table";
import {
  buildResponsesPage,
  collectQuestionIndex,
  cursorPayload,
  CURSOR_TTL_MS,
  parseResultsRange,
  queryFingerprint,
  readCursorPosition,
  RESPONSES_DEFAULT_LIMIT,
  toV1AggregatesResult,
  toV1ResultsSummary,
  type ResultsRange,
} from "./results_v1";
import type { GenesysRenewal, McpCallContext } from "./session";
import {
  buildAuthoringGuide,
  findToolV1,
  mergeThemeTokens,
  SURVEY_FIELDS,
  toInputIssues,
  toolError,
  toolSuccess,
  toSurveyInput,
  toV1BeginEditResult,
  toV1CreateResult,
  toV1DeployResult,
  toV1EndEditResult,
  toV1ErrorDetails,
  toV1RollbackResult,
  toV1SavedWebTheme,
  toV1SaveDraftResult,
  toV1SurveyDetail,
  toV1SurveyList,
  toV1ValidateResult,
  toV1WebTheme,
  toV1WebThemes,
  type McpToolErrorCode,
  type SurveyField,
  type SurveyInput,
  type ToolCallResult,
  type ToolRole,
  type WebThemeTokensPatch,
} from "./tools_v1";

/**
 * Ausführung der MCP-Tools: Prüfkette Schritte 7 und 8 (`documentation/polly_mcp.md`, Abschnitt 3) – Rolle des Tools
 * und Audit-Log – sowie die Tool-Logik. Ohne AWS-SDK: Zugriffe nach außen kommen über `McpToolDeps` (Standard in
 * `tool_deps.ts`, im Test ersetzt). Ein- und Ausgaben bildet `tools_v1.ts` ab.
 */

/** Ein geprüfter Aufruf: Person, Mandant und Zugang aus der Prüfkette. */
export interface McpToolContext {
  call: McpCallContext;
  /** Region, Umfrage-Data-Table und Client Credentials aus `TenantsTable`, nie aus der Eingabe. */
  credentials: TenantCredentials;
  /** Feature Flags aus `__meta` (`web_survey`). */
  features: FeatureFlags;
  now: number;
}

/** Polly-Rollen der Person (Rollennamen ohne Projekt-Präfix) oder Fehler beim Laden. */
export type PollyRolesResult = { ok: true; roles: ReadonlySet<string> } | { ok: false; status?: number };

/**
 * Status für `PollyRolesResult` bei Fehlern. 401 heißt nur dann „Token der Person abgelehnt“ (löst die Erneuerung aus),
 * wenn er von den Rollen der Person kommt; ein 401 beim Projekt-Tag (Client Credentials des Mandanten) wird 502.
 */
export function rolesFailureStatus(
  caller: { status: "ok" | "unauthorized" | "error"; httpStatus?: number },
  projectTag: { ok: boolean; httpStatus?: number }
): number | undefined {
  if (caller.status !== "ok") return caller.httpStatus;
  if (projectTag.ok) return undefined;
  return projectTag.httpStatus === 401 ? 502 : projectTag.httpStatus;
}

export interface McpToolDeps {
  /** Gehaltene Polly-Rollen, höchstens 60 s gemerkt. */
  pollyRoles(ctx: McpToolContext): Promise<PollyRolesResult>;
  readSurveyList(store: SurveyStoreContext): Promise<StoreResult<SurveyListItem[]>>;
  readSurveyRow(store: SurveyStoreContext, surveyId: string): Promise<StoreResult<SurveyRowView>>;
  readSurveyRows(store: SurveyStoreContext): Promise<StoreResult<SurveyRowView[]>>;
  createSurvey: typeof storeCreateSurvey;
  beginEdit: typeof storeBeginEdit;
  saveDraft: typeof storeSaveDraft;
  endEdit: typeof storeEndEdit;
  deploySurvey: typeof storeDeploySurvey;
  rollbackSurvey: typeof storeRollbackSurvey;
  /** Löschung läuft oder ist abgeschlossen; der Store fragt das vor jedem Schreiben. */
  isSurveyBeingDeleted(tenantId: string, surveyId: string): Promise<boolean>;
  /** IDs, deren Löschung läuft oder abgeschlossen ist. */
  findSurveysBeingDeleted(tenantId: string, surveyIds: readonly string[]): Promise<Set<string>>;
  /** Web-Designs des Mandanten (30 s gemerkt, `fresh` liest neu). Wirft bei Fehlern statt eine leere Liste zu liefern. */
  loadWebThemes(tenantId: string, fresh?: boolean): Promise<WebTheme[]>;
  /**
   * Legt ein Design an (`expectedUpdatedAt: null`) oder ändert es auf dem Stand `expectedUpdatedAt` (`saveWebThemes`,
   * optimistisches Sperren, `""` = Design ohne `updatedAt`). Danach gilt der Cache der Designs des Mandanten als veraltet.
   */
  saveWebTheme(tenantId: string, theme: WebThemeInput, updatedBy: string, expectedUpdatedAt: string | null): Promise<SaveWebThemesResult>;
  /** Zählt die Sitzungen eines Zeitraums (ohne Antworten); `ok: false`, wenn `deadline` (ms) vorher erreicht ist. */
  summarizeSessions(
    tenantId: string,
    surveyId: string,
    fromIso: string,
    toIso: string,
    deadline: number
  ): Promise<{ ok: true; summary: ExportSummary } | { ok: false }>;
  /** Aggregate je Frage (alle Versionen). */
  loadAggregates(tenantId: string, surveyId: string): Promise<SurveyAggregateItem[]>;
  /** Sitzungen mit Antworten; `ok: false` bei mehr als `MAX_SESSIONS` Sitzungen oder wenn `deadline` (ms) erreicht ist. */
  readSessions(
    tenantId: string,
    params: { surveyId: string; fromIso: string; toIso: string; version?: number },
    deadline: number
  ): Promise<{ ok: true; sessions: ExportSession[] } | { ok: false }>;
  /** Schlüssel für Pseudonyme und Cursor (aus `McpPseudonymSecret`). Wirft, wenn das Secret nicht lesbar ist. */
  pseudonymKeys(): Promise<PseudonymKeys>;
}

/** So lange darf eine Auswertung lesen (die Lambda läuft höchstens 28 s). */
const RESULTS_READ_BUDGET_MS = 20 * 1000;

const REQUIRED_ROLES: Record<Exclude<ToolRole, "any">, string> = {
  write: POLLY_ROLE_WRITE,
  deploy: POLLY_ROLE_DEPLOY,
  reporting: POLLY_ROLE_REPORTING,
};

type ToolOutcome =
  | { ok: true; value: Record<string, unknown>; audit?: Record<string, unknown> }
  | { ok: false; code: McpToolErrorCode; details?: Record<string, unknown> };

function failed(error: SurveyStoreError): ToolOutcome {
  return { ok: false, code: error.code, details: toV1ErrorDetails(error) };
}

function storeContext(ctx: McpToolContext, deps: McpToolDeps): SurveyStoreContext {
  return {
    tenantId: ctx.call.tenant.tenantId,
    credentials: ctx.credentials,
    token: ctx.call.genesysAccessToken,
    userName: ctx.call.userName,
    isBeingDeleted: deps.isSurveyBeingDeleted,
    now: () => new Date(ctx.now),
  };
}

function webSurveyEnabled(ctx: McpToolContext): boolean {
  return isFeatureEnabled(ctx.features, "web_survey");
}

/**
 * Designs für die Prüfung von `web_theme_id` (Schritt 5 der Pipeline), gleich für Prüfen und Schreiben: nur mit
 * `web_survey` und nur, wenn die Umfrage ein Design nennt (sonst kein DynamoDB-Zugriff). Erst aus dem Cache (30 s);
 * fehlt die ID dort, wird einmal frisch gelesen, damit ein gerade angelegtes Design nicht als unbekannt gilt.
 */
async function themeIdsFor(survey: Survey, ctx: McpToolContext, deps: McpToolDeps): Promise<ReadonlySet<string> | undefined> {
  const themeId = survey.web_theme_id;
  if (!webSurveyEnabled(ctx) || typeof themeId !== "string" || themeId === "") return undefined;
  const tenantId = ctx.call.tenant.tenantId;
  const cached = new Set((await deps.loadWebThemes(tenantId)).map((theme) => theme.id));
  if (cached.has(themeId)) return cached;
  return new Set((await deps.loadWebThemes(tenantId, true)).map((theme) => theme.id));
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

type ToolHandler = (args: any, ctx: McpToolContext, deps: McpToolDeps) => Promise<ToolOutcome>;

async function getAuthoringGuide(_args: unknown, ctx: McpToolContext): Promise<ToolOutcome> {
  return { ok: true, value: buildAuthoringGuide(webSurveyEnabled(ctx)) };
}

async function listSurveys(
  args: { includeVersions?: boolean; includeLock?: boolean },
  ctx: McpToolContext,
  deps: McpToolDeps
): Promise<ToolOutcome> {
  const store = storeContext(ctx, deps);
  const list = await deps.readSurveyList(store);
  if (!list.ok) return failed(list.error);
  const includeVersions = args.includeVersions === true;
  const includeLock = args.includeLock === true;

  let rows: Map<string, SurveyRowView> | undefined;
  if (includeVersions || includeLock) {
    const read = await deps.readSurveyRows(store);
    if (!read.ok) return failed(read.error);
    rows = new Map(read.value.map((view) => [view.surveyId, view]));
  }
  const items = list.value.filter((item) => isValidSurveyId(item?.id));
  const ids = [...new Set([...items.map((item) => item.id), ...(rows?.keys() ?? [])])];
  const deleting = await deps.findSurveysBeingDeleted(ctx.call.tenant.tenantId, ids);
  for (const surveyId of deleting) rows?.delete(surveyId);

  return {
    ok: true,
    value: toV1SurveyList(
      items.filter((item) => !deleting.has(item.id)),
      rows,
      { includeVersions, includeLock, userName: ctx.call.userName, now: ctx.now }
    ),
  };
}

async function getSurvey(args: { surveyId: string; fields?: SurveyField[] }, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const read = await deps.readSurveyRow(storeContext(ctx, deps), args.surveyId);
  if (!read.ok) return failed(read.error);
  const webSurvey = webSurveyEnabled(ctx);
  const fields = args.fields && args.fields.length > 0 ? args.fields : (["draft"] as SurveyField[]);
  return {
    ok: true,
    value: toV1SurveyDetail(read.value, {
      fields: SURVEY_FIELDS.filter((field) => fields.includes(field)),
      webSurvey,
      check: read.value.draft ? checkDraft(read.value.draft, { webSurvey }) : null,
      userName: ctx.call.userName,
      now: ctx.now,
    }),
  };
}

async function listWebThemes(_args: unknown, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  return { ok: true, value: toV1WebThemes(await deps.loadWebThemes(ctx.call.tenant.tenantId)) };
}

// --- Web-Designs (Schreiben mit `polly_deploy`, wie `PUT /web-themes/{id}` der App) -----------------------------

const THEME_NOT_FOUND: ToolOutcome = { ok: false, code: "theme_not_found" };

function invalidInput(path: string, message: string): ToolOutcome {
  return { ok: false, code: "invalid_input", details: { issues: [{ path, message }] } };
}

/** Frisch gelesen: Das Ändern braucht den aktuellen `updatedAt`. IDs werden kleingeschrieben gespeichert. */
async function findWebTheme(themeId: string, ctx: McpToolContext, deps: McpToolDeps): Promise<WebTheme | undefined> {
  if (!isValidThemeId(themeId)) return undefined;
  const wanted = themeId.toLowerCase();
  return (await deps.loadWebThemes(ctx.call.tenant.tenantId, true)).find((theme) => theme.id === wanted);
}

/** Patch auf die Basis mischen und wie in der App prüfen; `null` bei Werten außerhalb der Grenzen. */
function themeTokens(base: WebThemeTokens, patch: WebThemeTokensPatch | undefined): WebThemeTokens | null {
  return sanitizeWebThemeTokens(mergeThemeTokens(base, patch));
}

const INVALID_TOKENS = invalidInput("tokens", "tokens are invalid (check the limits in the input schema; lineHeight has at most two decimals)");

async function saveWebTheme(
  theme: WebThemeInput,
  expectedUpdatedAt: string | null,
  ctx: McpToolContext,
  deps: McpToolDeps
): Promise<ToolOutcome> {
  const saved = await deps.saveWebTheme(ctx.call.tenant.tenantId, theme, ctx.call.userName, expectedUpdatedAt);
  if (!saved.ok) {
    if (saved.reason === "limit_reached") return { ok: false, code: "theme_limit_reached", details: { max: WEB_THEME_MAX_PER_TENANT } };
    // `busy`: Jemand hat parallel ein anderes Design gespeichert, dieses ist unverändert
    return { ok: false, code: saved.reason === "busy" ? "theme_busy" : "theme_conflict" };
  }
  const [stored] = saved.themes;
  if (!stored) throw new Error("saved theme is invalid");
  return {
    ok: true,
    value: toV1SavedWebTheme(stored, saved.clearedDefaults > 0),
    audit: { isDefault: stored.isDefault, created: saved.created > 0 },
  };
}

async function getWebTheme(args: { themeId: string }, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const theme = await findWebTheme(args.themeId, ctx, deps);
  return theme ? { ok: true, value: toV1WebTheme(theme) } : THEME_NOT_FOUND;
}

/** Neues Standard-Design stellt sofort alle Umfragen ohne `web_theme_id` um: nur mit `confirm`. */
async function createWebTheme(
  args: { name: string; tokens?: WebThemeTokensPatch; isDefault?: boolean; confirm?: boolean },
  ctx: McpToolContext,
  deps: McpToolDeps
): Promise<ToolOutcome> {
  if (args.isDefault === true && args.confirm !== true) return { ok: false, code: "confirm_required" };
  const name = checkWebThemeName(args.name);
  if (!name.ok) return invalidInput("name", name.message);
  const tokens = themeTokens(defaultWebThemeTokens(), args.tokens);
  if (!tokens) return INVALID_TOKENS;
  // Die ID vergibt der Server; `null` = darf noch nicht existieren
  return saveWebTheme({ themeId: randomUUID(), name: name.name, isDefault: args.isDefault === true, tokens }, null, ctx, deps);
}

/** Wirkt sofort auf alle Umfragen mit diesem Design (auch Prod): immer nur mit `confirm`, geprüft vor jedem Zugriff. */
async function updateWebTheme(
  args: { themeId: string; expectedUpdatedAt: string | null; name?: string; tokens?: WebThemeTokensPatch; isDefault?: boolean; confirm?: boolean },
  ctx: McpToolContext,
  deps: McpToolDeps
): Promise<ToolOutcome> {
  if (args.confirm !== true) return { ok: false, code: "confirm_required" };
  let name: string | undefined;
  if (args.name !== undefined) {
    const checked = checkWebThemeName(args.name);
    if (!checked.ok) return invalidInput("name", checked.message);
    name = checked.name;
  }
  const stored = await findWebTheme(args.themeId, ctx, deps);
  if (!stored) return THEME_NOT_FOUND;
  // Veralteter Stand: ohne Transaktion abweisen. `null` steht wie in `get_web_theme` für ein Design ohne `updatedAt`
  const expectedUpdatedAt = args.expectedUpdatedAt ?? "";
  if (stored.updatedAt !== expectedUpdatedAt) return { ok: false, code: "theme_conflict" };
  const tokens = args.tokens ? themeTokens(stored.tokens, args.tokens) : stored.tokens;
  if (!tokens) return INVALID_TOKENS;
  // Ohne `isDefault` bleibt die Markierung, wie sie ist (siehe `saveWebThemes`)
  return saveWebTheme({ themeId: stored.id, name: name ?? stored.name, isDefault: args.isDefault, tokens }, expectedUpdatedAt, ctx, deps);
}

async function validateSurvey(args: { survey: any; surveyId?: string }, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const webSurvey = webSurveyEnabled(ctx);
  let surveyId: string = randomUUID();
  let saved = null;
  let version = 1;
  if (args.surveyId !== undefined) {
    const read = await deps.readSurveyRow(storeContext(ctx, deps), args.surveyId);
    if (!read.ok) return failed(read.error);
    surveyId = args.surveyId;
    saved = read.value.draft;
    version = (read.value.versions.draft ?? 0) + 1;
  }
  const survey = toSurveyInput(args.survey);
  const prepared = prepareDraft(survey, {
    surveyId,
    saved,
    version,
    webSurvey,
    knownThemeIds: await themeIdsFor(survey, ctx, deps),
    now: new Date(ctx.now).toISOString(),
  });
  return { ok: true, value: toV1ValidateResult(prepared) };
}

async function createSurvey(args: { survey: SurveyInput }, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const survey = toSurveyInput(args.survey);
  const options = { webSurvey: webSurveyEnabled(ctx), knownThemeIds: await themeIdsFor(survey, ctx, deps) };
  const result = await deps.createSurvey(storeContext(ctx, deps), survey, options);
  return result.ok ? { ok: true, value: toV1CreateResult(result.value) } : failed(result.error);
}

async function beginEdit(args: { surveyId: string }, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const result = await deps.beginEdit(storeContext(ctx, deps), args.surveyId);
  return result.ok ? { ok: true, value: toV1BeginEditResult(result.value) } : failed(result.error);
}

async function saveDraft(
  args: { surveyId: string; survey: SurveyInput; expectedDraftVersion: number | null; release?: boolean },
  ctx: McpToolContext,
  deps: McpToolDeps
): Promise<ToolOutcome> {
  const survey = toSurveyInput(args.survey);
  const options = {
    webSurvey: webSurveyEnabled(ctx),
    knownThemeIds: await themeIdsFor(survey, ctx, deps),
    release: args.release === true,
  };
  const result = await deps.saveDraft(storeContext(ctx, deps), args.surveyId, survey, args.expectedDraftVersion, options);
  return result.ok ? { ok: true, value: toV1SaveDraftResult(result.value) } : failed(result.error);
}

async function endEdit(args: { surveyId: string }, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const result = await deps.endEdit(storeContext(ctx, deps), args.surveyId);
  return result.ok ? { ok: true, value: toV1EndEditResult(result.value) } : failed(result.error);
}

/** Deploy und Rollback nur mit `confirm: true`; geprüft vor jedem Zugriff. */
async function deploySurvey(
  args: { surveyId: string; target: DeployTarget; expectedDraftVersion: number; confirm?: boolean },
  ctx: McpToolContext,
  deps: McpToolDeps
): Promise<ToolOutcome> {
  if (args.confirm !== true) return { ok: false, code: "confirm_required" };
  const result = await deps.deploySurvey(storeContext(ctx, deps), args.surveyId, args.target, args.expectedDraftVersion, {
    webSurvey: webSurveyEnabled(ctx),
  });
  return result.ok ? { ok: true, value: toV1DeployResult(result.value) } : failed(result.error);
}

async function rollbackSurvey(
  args: { surveyId: string; expectedProdVersion: number | null; confirm?: boolean },
  ctx: McpToolContext,
  deps: McpToolDeps
): Promise<ToolOutcome> {
  if (args.confirm !== true) return { ok: false, code: "confirm_required" };
  const result = await deps.rollbackSurvey(storeContext(ctx, deps), args.surveyId, args.expectedProdVersion);
  return result.ok ? { ok: true, value: toV1RollbackResult(result.value) } : failed(result.error);
}

// --- Auswertung (Rolle `polly_reporting`, Datenschutz: documentation/polly_mcp.md, Abschnitt 8) --------------------

const NOT_FOUND: ToolOutcome = { ok: false, code: "not_found" };

function rangeFailure(range: Exclude<ResultsRange, { ok: true }>): ToolOutcome {
  return range.kind === "invalid"
    ? { ok: false, code: "invalid_input", details: { issues: range.issues } }
    : { ok: false, code: "range_too_large", details: { maxMs: range.maxMs } };
}

/** Umfrage-ID kleingeschrieben wie in der Kunden-API; `undefined` bei ungültiger ID (keine Abfrage). */
function resultsSurveyId(raw: string): string | undefined {
  return isValidSurveyId(raw) ? raw.toLowerCase() : undefined;
}

async function getResultsSummary(args: { surveyId: string; from: string; to: string }, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const surveyId = resultsSurveyId(args.surveyId);
  if (!surveyId) return NOT_FOUND;
  const range = parseResultsRange(args.from, args.to, MAX_SUMMARY_RANGE_MS);
  if (!range.ok) return rangeFailure(range);
  const tenantId = ctx.call.tenant.tenantId;
  if (await deps.isSurveyBeingDeleted(tenantId, surveyId)) return NOT_FOUND;
  // Wie bei get_aggregates: Die Umfrage muss in der Data Table stehen und für die Person (Genesys-Token) lesbar sein
  const read = await deps.readSurveyRow(storeContext(ctx, deps), surveyId);
  if (!read.ok) return failed(read.error);
  const result = await deps.summarizeSessions(tenantId, surveyId, range.fromIso, range.toIso, Date.now() + RESULTS_READ_BUDGET_MS);
  // Ein unfertiger Zeitraum ergäbe eine zu niedrige Zählung: lieber ablehnen
  if (!result.ok) return { ok: false, code: "range_too_large", details: { maxMs: MAX_SUMMARY_RANGE_MS } };
  return { ok: true, value: toV1ResultsSummary(result.summary), audit: { from: range.fromIso, to: range.toIso } };
}

async function getAggregates(args: { surveyId: string }, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const surveyId = resultsSurveyId(args.surveyId);
  if (!surveyId) return NOT_FOUND;
  const tenantId = ctx.call.tenant.tenantId;
  if (await deps.isSurveyBeingDeleted(tenantId, surveyId)) return NOT_FOUND;
  // Die Zeile der Umfrage (Genesys-Token der Person) liefert die Fragetitel und stellt sicher, dass es die Umfrage gibt
  const [read, items] = await Promise.all([deps.readSurveyRow(storeContext(ctx, deps), surveyId), deps.loadAggregates(tenantId, surveyId)]);
  if (!read.ok) return failed(read.error);
  const { row, draft } = read.value;
  const index = collectQuestionIndex(draft, [row.Prod, row.Stage, row.Backup], surveyId);
  return { ok: true, value: toV1AggregatesResult(items, index) };
}

async function getResponses(
  args: { surveyId: string; from: string; to: string; channel?: string; status?: string; version?: number; cursor?: string; limit?: number },
  ctx: McpToolContext,
  deps: McpToolDeps
): Promise<ToolOutcome> {
  const surveyId = resultsSurveyId(args.surveyId);
  if (!surveyId) return NOT_FOUND;
  const range = parseResultsRange(args.from, args.to, MAX_RANGE_MS);
  if (!range.ok) return rangeFailure(range);
  const tenantId = ctx.call.tenant.tenantId;
  if (await deps.isSurveyBeingDeleted(tenantId, surveyId)) return NOT_FOUND;

  const filter = { fromIso: range.fromIso, toIso: range.toIso, channel: args.channel, status: args.status, version: args.version };
  const fingerprint = queryFingerprint(filter);
  const keys = await deps.pseudonymKeys();
  const binding = { tenantId, surveyId };
  let after;
  if (args.cursor !== undefined) {
    after = readCursorPosition(openCursor(keys, binding, args.cursor, ctx.now), fingerprint);
    if (!after) return { ok: false, code: "cursor_invalid" };
  }

  // Die Umfrage muss in der Data Table stehen (Genesys-Token der Person); ihre Labels entscheiden, welche Auswahlwerte
  // als strukturiert gelten
  const survey = await deps.readSurveyRow(storeContext(ctx, deps), surveyId);
  if (!survey.ok) return failed(survey.error);
  const { row, draft } = survey.value;
  const { choiceLabels } = collectQuestionIndex(draft, [row.Prod, row.Stage, row.Backup], surveyId);

  // Sitzungen vor der Cursor-Position fallen ohnehin weg: erst ab dort lesen (gleicher Start ist enthalten, BETWEEN)
  const readFrom = after && after.t > range.fromIso ? after.t : range.fromIso;
  const read = await deps.readSessions(tenantId, { surveyId, fromIso: readFrom, toIso: range.toIso, version: args.version }, Date.now() + RESULTS_READ_BUDGET_MS);
  if (!read.ok) return { ok: false, code: "range_too_large", details: { maxMs: MAX_RANGE_MS } };

  const allowComments = ctx.call.tenant.allowComments;
  const page = buildResponsesPage(read.sessions, {
    keys,
    tenantId,
    surveyId,
    allowComments,
    choiceLabels,
    filter,
    after,
    limit: args.limit ?? RESPONSES_DEFAULT_LIMIT,
  });
  return {
    ok: true,
    value: {
      responses: page.responses,
      ...(page.next ? { nextCursor: sealCursor(keys, binding, cursorPayload(page.next, fingerprint), ctx.now + CURSOR_TTL_MS) } : {}),
    },
    // Nachweis, welche Daten in welchem Umfang abgerufen wurden (ohne Inhalte und Pseudonyme)
    audit: {
      from: range.fromIso,
      to: range.toIso,
      ...(args.channel !== undefined ? { channel: args.channel } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.version !== undefined ? { version: args.version } : {}),
      continued: after !== undefined,
      returned: page.responses.length,
      allowComments,
    },
  };
}

const HANDLERS: Record<string, ToolHandler> = {
  get_authoring_guide: getAuthoringGuide,
  list_surveys: listSurveys,
  get_survey: getSurvey,
  list_web_themes: listWebThemes,
  get_web_theme: getWebTheme,
  validate_survey: validateSurvey,
  create_survey: createSurvey,
  begin_edit: beginEdit,
  save_draft: saveDraft,
  end_edit: endEdit,
  deploy_survey: deploySurvey,
  rollback_survey: rollbackSurvey,
  get_results_summary: getResultsSummary,
  get_aggregates: getAggregates,
  get_responses: getResponses,
  create_web_theme: createWebTheme,
  update_web_theme: updateWebTheme,
};

// ---------------------------------------------------------------------------
// Aufruf: Tool finden, Rolle, Eingabe, Ausführung, Audit-Log
// ---------------------------------------------------------------------------

export type CallToolOutcome = { kind: "result"; result: ToolCallResult } | { kind: "unknown_tool" };

/** Genesys hat das Token der Person abgelehnt (401). */
function isGenesysRejection(outcome: ToolOutcome): boolean {
  return !outcome.ok && outcome.code === "upstream_error" && outcome.details?.status === 401;
}

/**
 * Nach einem 401 von Genesys das Token einmal erneuern (`McpCallContext.renewGenesysAccess`); ohne Erneuerung
 * (Test) oder bei Fehlern (KMS, DynamoDB) `upstream`.
 */
async function renewGenesysAccess(ctx: McpToolContext): Promise<GenesysRenewal> {
  if (!ctx.call.renewGenesysAccess) return "upstream";
  try {
    return await ctx.call.renewGenesysAccess();
  } catch (err: any) {
    console.error("[mcp] Genesys renewal failed", { tenantId: ctx.call.tenant.tenantId, name: err?.name, message: err?.message });
    return "upstream";
  }
}

/**
 * Rolle prüfen: `any` verlangt irgendeine Polly-Rolle. Liefert den Fehler oder `undefined`. Lehnt Genesys das Token
 * ab, wird es einmal erneuert und die Prüfung wiederholt (nur lesend, deshalb unbedenklich).
 */
export async function checkToolRole(role: ToolRole, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome | undefined> {
  let roles = await deps.pollyRoles(ctx);
  if (!roles.ok && roles.status === 401 && (await renewGenesysAccess(ctx)) === "renewed") roles = await deps.pollyRoles(ctx);
  if (!roles.ok) return { ok: false, code: "upstream_error", details: roles.status !== undefined ? { status: roles.status } : {} };
  if (role === "any") {
    return roles.roles.size > 0 ? undefined : { ok: false, code: "forbidden", details: { requiredRole: "any" } };
  }
  const required = REQUIRED_ROLES[role];
  return roles.roles.has(required) ? undefined : { ok: false, code: "forbidden", details: { requiredRole: required } };
}

/**
 * Audit-Log ohne Inhalte: Mandant, Person, Tool, Umfrage bzw. Design, Ergebnis-Code, Dauer; bei der Auswertung zusätzlich
 * Umfang des Abrufs (`extra`: Zeitraum, Filter, Anzahl, Freigabe der Kommentare).
 */
function audit(
  ctx: McpToolContext,
  tool: string,
  ids: { surveyId: unknown; themeId: unknown },
  result: string,
  startedAt: number,
  extra?: Record<string, unknown>
): void {
  const { surveyId, themeId } = ids;
  console.log("[mcp] tool call", {
    tenantId: ctx.call.tenant.tenantId,
    userId: ctx.call.userId,
    tool,
    ...(typeof surveyId === "string" && isValidSurveyId(surveyId) ? { surveyId } : {}),
    ...(isValidThemeId(themeId) ? { themeId: themeId.toLowerCase() } : {}),
    result,
    ...extra,
    ms: Date.now() - startedAt,
  });
}

/**
 * Führt `tools/call` aus. Reihenfolge: Tool bekannt (sonst JSON-RPC-Fehler), Rolle, Eingabe (eigene Prüfung,
 * damit `invalid_input` das Format aus Abschnitt 4.2 hat), Tool. Fehler kommen als Tool-Ergebnis mit `isError`.
 */
export async function callTool(name: string, rawArgs: unknown, ctx: McpToolContext, deps: McpToolDeps): Promise<CallToolOutcome> {
  const tool = findToolV1(name, webSurveyEnabled(ctx));
  const handler = tool ? HANDLERS[tool.name] : undefined;
  if (!tool || !handler) return { kind: "unknown_tool" };
  const startedAt = Date.now();
  const { surveyId, themeId } = (rawArgs as { surveyId?: unknown; themeId?: unknown } | undefined) ?? {};

  let outcome: ToolOutcome;
  try {
    const denied = await checkToolRole(tool.role, ctx, deps);
    if (denied) {
      outcome = denied;
    } else {
      const parsed = tool.input(true).safeParse(rawArgs ?? {});
      outcome = parsed.success
        ? await handler(parsed.data, ctx, deps)
        : { ok: false, code: "invalid_input", details: { issues: toInputIssues(parsed.error.issues) } };
    }
  } catch (err: any) {
    console.error("[mcp] tool failed", { tenantId: ctx.call.tenant.tenantId, tool: tool.name, name: err?.name, message: err?.message });
    outcome = { ok: false, code: "internal_error" };
  }
  // 401 im Tool (Rollen noch gemerkt): kein zweiter Versuch, das Tool kann schon geschrieben haben. Erneuern, damit
  // der nächste Aufruf wieder geht; ist die Genesys-Sitzung tot, antwortet der Endpunkt mit 401 invalid_token.
  if (isGenesysRejection(outcome)) await renewGenesysAccess(ctx);

  // Die ID aus dem Ergebnis gilt vor der Eingabe: Bei create_survey/create_web_theme vergibt sie der Server, eine
  // mitgeschickte ID (von zod verworfen) darf das Audit-Log nicht auf eine fremde Umfrage bzw. ein fremdes Design lenken.
  const resultSurveyId = outcome.ok ? outcome.value.surveyId : undefined;
  const resultThemeId = outcome.ok ? outcome.value.themeId : undefined;
  audit(
    ctx,
    tool.name,
    {
      surveyId: resultSurveyId ?? (tool.name === "create_survey" ? undefined : surveyId),
      themeId: resultThemeId ?? (tool.name === "create_web_theme" ? undefined : themeId),
    },
    outcome.ok ? "ok" : outcome.code,
    startedAt,
    outcome.ok ? outcome.audit : undefined
  );
  return { kind: "result", result: outcome.ok ? toolSuccess(outcome.value) : toolError(outcome.code, outcome.details) };
}

/** Lesen der Resource `polly://authoring-guide`: wie das Tool, verlangt irgendeine Polly-Rolle. */
export async function readAuthoringGuideResource(ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const denied = await checkToolRole("any", ctx, deps);
  return denied ?? { ok: true, value: buildAuthoringGuide(webSurveyEnabled(ctx)) };
}
