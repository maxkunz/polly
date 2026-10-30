import { randomUUID } from "node:crypto";
import {
  POLLY_ROLE_DEPLOY,
  POLLY_ROLE_REPORTING,
  POLLY_ROLE_WRITE,
} from "../../../src/constants/permissionConstants";
import { isFeatureEnabled, type FeatureFlags } from "../../../src/domain/features/featureFlags";
import type { WebTheme } from "../../../src/domain/webTheme/webTheme";
import { isValidSurveyId } from "../shared/survey_id";
import { checkDraft, prepareDraft, type SurveyStoreError } from "../shared/survey_pipeline";
import type { StoreResult, SurveyListItem, SurveyRowView, SurveyStoreContext } from "../shared/survey_store";
import type { TenantCredentials } from "../shared/tenant_auth";
import type { McpCallContext } from "./session";
import {
  buildAuthoringGuide,
  findToolV1,
  SURVEY_FIELDS,
  toInputIssues,
  toolError,
  toolSuccess,
  toSurveyInput,
  toV1SurveyDetail,
  toV1SurveyList,
  toV1ValidateResult,
  toV1WebThemes,
  type McpToolErrorCode,
  type SurveyField,
  type ToolCallResult,
  type ToolRole,
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

export interface McpToolDeps {
  /** Gehaltene Polly-Rollen, höchstens 60 s gemerkt. */
  pollyRoles(ctx: McpToolContext): Promise<PollyRolesResult>;
  readSurveyList(store: SurveyStoreContext): Promise<StoreResult<SurveyListItem[]>>;
  readSurveyRow(store: SurveyStoreContext, surveyId: string): Promise<StoreResult<SurveyRowView>>;
  readSurveyRows(store: SurveyStoreContext): Promise<StoreResult<SurveyRowView[]>>;
  /** IDs, deren Löschung läuft oder abgeschlossen ist. */
  findSurveysBeingDeleted(tenantId: string, surveyIds: readonly string[]): Promise<Set<string>>;
  loadWebThemes(tenantId: string): Promise<WebTheme[]>;
}

const REQUIRED_ROLES: Record<Exclude<ToolRole, "any">, string> = {
  write: POLLY_ROLE_WRITE,
  deploy: POLLY_ROLE_DEPLOY,
  reporting: POLLY_ROLE_REPORTING,
};

type ToolOutcome = { ok: true; value: Record<string, unknown> } | { ok: false; code: McpToolErrorCode; details?: Record<string, unknown> };

function failed(error: SurveyStoreError): ToolOutcome {
  return { ok: false, code: error.code, details: error.details };
}

function storeContext(ctx: McpToolContext): SurveyStoreContext {
  return {
    tenantId: ctx.call.tenant.tenantId,
    credentials: ctx.credentials,
    token: ctx.call.genesysAccessToken,
    userName: ctx.call.userName,
    now: () => new Date(ctx.now),
  };
}

function webSurveyEnabled(ctx: McpToolContext): boolean {
  return isFeatureEnabled(ctx.features, "web_survey");
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
  const store = storeContext(ctx);
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
  const read = await deps.readSurveyRow(storeContext(ctx), args.surveyId);
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

async function validateSurvey(args: { survey: any; surveyId?: string }, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const webSurvey = webSurveyEnabled(ctx);
  let surveyId: string = randomUUID();
  let saved = null;
  let version = 1;
  if (args.surveyId !== undefined) {
    const read = await deps.readSurveyRow(storeContext(ctx), args.surveyId);
    if (!read.ok) return failed(read.error);
    surveyId = args.surveyId;
    saved = read.value.draft;
    version = (read.value.versions.draft ?? 0) + 1;
  }
  const knownThemeIds = webSurvey ? new Set((await deps.loadWebThemes(ctx.call.tenant.tenantId)).map((theme) => theme.id)) : undefined;
  const prepared = prepareDraft(toSurveyInput(args.survey), {
    surveyId,
    saved,
    version,
    webSurvey,
    knownThemeIds,
    now: new Date(ctx.now).toISOString(),
  });
  return { ok: true, value: toV1ValidateResult(prepared) };
}

const HANDLERS: Record<string, ToolHandler> = {
  get_authoring_guide: getAuthoringGuide,
  list_surveys: listSurveys,
  get_survey: getSurvey,
  list_web_themes: listWebThemes,
  validate_survey: validateSurvey,
};

// ---------------------------------------------------------------------------
// Aufruf: Tool finden, Rolle, Eingabe, Ausführung, Audit-Log
// ---------------------------------------------------------------------------

export type CallToolOutcome = { kind: "result"; result: ToolCallResult } | { kind: "unknown_tool" };

/** Rolle prüfen: `any` verlangt irgendeine Polly-Rolle. Liefert den Fehler oder `undefined`. */
export async function checkToolRole(role: ToolRole, ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome | undefined> {
  const roles = await deps.pollyRoles(ctx);
  if (!roles.ok) return { ok: false, code: "upstream_error", details: roles.status !== undefined ? { status: roles.status } : {} };
  if (role === "any") {
    return roles.roles.size > 0 ? undefined : { ok: false, code: "forbidden", details: { requiredRole: "any" } };
  }
  const required = REQUIRED_ROLES[role];
  return roles.roles.has(required) ? undefined : { ok: false, code: "forbidden", details: { requiredRole: required } };
}

/** Audit-Log ohne Inhalte: Mandant, Person, Tool, Umfrage, Ergebnis-Code, Dauer. */
function audit(ctx: McpToolContext, tool: string, surveyId: unknown, result: string, startedAt: number): void {
  console.log("[mcp] tool call", {
    tenantId: ctx.call.tenant.tenantId,
    userId: ctx.call.userId,
    tool,
    ...(typeof surveyId === "string" && isValidSurveyId(surveyId) ? { surveyId } : {}),
    result,
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
  const surveyId = (rawArgs as { surveyId?: unknown } | undefined)?.surveyId;

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

  audit(ctx, tool.name, surveyId, outcome.ok ? "ok" : outcome.code, startedAt);
  return { kind: "result", result: outcome.ok ? toolSuccess(outcome.value) : toolError(outcome.code, outcome.details) };
}

/** Lesen der Resource `polly://authoring-guide`: wie das Tool, verlangt irgendeine Polly-Rolle. */
export async function readAuthoringGuideResource(ctx: McpToolContext, deps: McpToolDeps): Promise<ToolOutcome> {
  const denied = await checkToolRole("any", ctx, deps);
  return denied ?? { ok: true, value: buildAuthoringGuide(webSurveyEnabled(ctx)) };
}
