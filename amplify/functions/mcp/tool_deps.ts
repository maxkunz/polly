import {
  POLLY_ROLE_DEPLOY,
  POLLY_ROLE_REPORTING,
  POLLY_ROLE_WRITE,
} from "../../../src/constants/permissionConstants";
import { hasPollyRole } from "../../../src/domain/permissions/roleCheck";
import { loadCallerRoles, loadInstallationProjectTag } from "../shared/caller_roles";
import { readSurveyList, readSurveyRow, readSurveyRows } from "../shared/survey_store";
import { findSurveysBeingDeleted } from "../shared/survey_results";
import { TtlCache } from "../shared/ttl_cache";
import { loadTenantThemesCached } from "../shared/web_themes_table";
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
  findSurveysBeingDeleted,
  loadWebThemes: (tenantId) => loadTenantThemesCached(tenantId),
};
