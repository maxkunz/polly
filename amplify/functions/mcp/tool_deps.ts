import {
  POLLY_ROLE_DEPLOY,
  POLLY_ROLE_REPORTING,
  POLLY_ROLE_WRITE,
} from "../../../src/constants/permissionConstants";
import { hasPollyRole } from "../../../src/domain/permissions/roleCheck";
import { loadCallerRoles, loadInstallationProjectTag } from "../shared/caller_roles";
import {
  beginEdit,
  createSurvey,
  deploySurvey,
  endEdit,
  readSurveyList,
  readSurveyRow,
  readSurveyRows,
  rollbackSurvey,
  saveDraft,
} from "../shared/survey_store";
import type { ExportSession } from "../shared/answer_records";
import { loadPseudonymKeys } from "../shared/mcp_pseudonym_keys";
import { MAX_SESSIONS } from "../shared/reporting_limits";
import { createSummary, openSlices, summarizeSlices } from "../shared/session_summary";
import { findSurveysBeingDeleted, isSurveyBeingDeleted, loadSurveyAggregates } from "../shared/survey_results";
import { iterateSessions, SessionReadAbortedError } from "../shared/survey_sessions";
import { TtlCache } from "../shared/ttl_cache";
import { loadTenantThemesOrThrow } from "../shared/web_themes_table";
import type { McpToolDeps, PollyRolesResult } from "./tool_handlers";

/**
 * Standard-Abhängigkeiten der MCP-Tools (Genesys, DynamoDB). Getrennt von `tool_handlers.ts`, damit der Test
 * die Tools ohne AWS-SDK und ohne Genesys ausführen kann.
 */

const POLLY_ROLES = [POLLY_ROLE_WRITE, POLLY_ROLE_DEPLOY, POLLY_ROLE_REPORTING];

/** Rollenänderungen greifen nach höchstens 60 s (`documentation/polly_mcp.md`, Abschnitt 11). Fehler werden nicht gemerkt. */
const ROLE_CACHE_TTL_MS = 60 * 1000;
const roleCache = new TtlCache<PollyRolesResult>({ ttlMs: ROLE_CACHE_TTL_MS, maxEntries: 1000 });

export const defaultToolDeps: McpToolDeps = {
  pollyRoles: (ctx) => {
    const { tenant, userId, genesysAccessToken } = ctx.call;
    return roleCache.getOrLoad(`${tenant.tenantId}:${userId}`, async () => {
      const [caller, projectTag] = await Promise.all([
        loadCallerRoles(tenant.region, genesysAccessToken),
        loadInstallationProjectTag(tenant.tenantId, ctx.credentials),
      ]);
      if (caller.status !== "ok" || !projectTag.ok) {
        const status = caller.status !== "ok" ? caller.httpStatus : projectTag.ok ? undefined : projectTag.httpStatus;
        console.warn("[mcp] cannot load roles", { tenantId: tenant.tenantId, callerStatus: caller.status, status });
        return { value: { ok: false, ...(status !== undefined ? { status } : {}) }, ttlMs: 0 };
      }
      const roles = POLLY_ROLES.filter((role) => hasPollyRole(caller.roles, role, projectTag.projectTag));
      return { value: { ok: true, roles: new Set(roles) } };
    });
  },
  readSurveyList,
  readSurveyRow,
  readSurveyRows,
  createSurvey,
  beginEdit,
  saveDraft,
  endEdit,
  deploySurvey,
  rollbackSurvey,
  isSurveyBeingDeleted,
  findSurveysBeingDeleted,
  // Fehler werfen statt leerer Liste (sonst gälte jedes Design als unbekannt); der Aufruf ergibt dann internal_error
  loadWebThemes: (tenantId, fresh) => loadTenantThemesOrThrow(tenantId, fresh),
  async summarizeSessions(tenantId, surveyId, fromIso, toIso, deadline) {
    const summary = createSummary();
    const slices = await summarizeSlices(tenantId, surveyId, openSlices(fromIso, toIso), summary, () => Date.now() < deadline, {
      withChannels: true,
    });
    return slices.every((slice) => slice.done) ? { ok: true, summary } : { ok: false };
  },
  loadAggregates: loadSurveyAggregates,
  async readSessions(tenantId, params, deadline) {
    const sessions: ExportSession[] = [];
    try {
      for await (const { session } of iterateSessions(tenantId, params, () => Date.now() < deadline)) {
        if (sessions.length >= MAX_SESSIONS) return { ok: false };
        sessions.push(session);
      }
    } catch (err) {
      if (err instanceof SessionReadAbortedError) return { ok: false };
      throw err;
    }
    return { ok: true, sessions };
  },
  pseudonymKeys: loadPseudonymKeys,
};
