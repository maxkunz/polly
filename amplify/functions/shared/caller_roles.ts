import { hasPollyRole } from "../../../src/domain/permissions/roleCheck";
import { getSurveyTableAccess } from "./genesys_survey_check";
import { fetchWithTimeout } from "./http";
import { loadProjectTag } from "./installation_meta";
import type { TenantCredentials } from "./tenant_auth";

/**
 * Serverseitige Rollenprüfung für Genesys-User (Lambdas `invitations`, `web_themes`): Rollen des
 * Aufrufers mit seinem eigenen Token, Projekt-Tag der Installation aus `__meta`, Namenslogik wie im
 * Frontend (`hasPollyRole`, `src/domain/permissions/roleCheck.ts`).
 */

export type CallerRoles =
  | { status: "ok"; roles: string[]; userId?: string; userName?: string }
  | { status: "unauthorized"; httpStatus: number }
  | { status: "error"; httpStatus?: number; error?: string };

/** Rollen des Aufrufers wie im Frontend (`loadCurrentUserRoles`), mit seinem eigenen Genesys-Token. */
export async function loadCallerRoles(region: string, token: string): Promise<CallerRoles> {
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
  return {
    status: "ok",
    roles: roles.map((role) => String(role?.name ?? "")).filter(Boolean),
    userId: typeof me?.id === "string" ? me.id : undefined,
    userName: typeof me?.name === "string" ? me.name : undefined,
  };
}

export type ProjectTagResult = { ok: true; projectTag: string | undefined } | { ok: false; httpStatus?: number; error: string };

/** Projekt-Tag der Installation (60 s gemerkt), damit die präfixierte Rolle wie im Frontend erkannt wird. */
export async function loadInstallationProjectTag(tenantId: string, credentials: TenantCredentials): Promise<ProjectTagResult> {
  try {
    return { ok: true, projectTag: await loadProjectTag(tenantId, await getSurveyTableAccess(credentials)) };
  } catch (err: any) {
    return { ok: false, httpStatus: err?.status, error: String(err?.message ?? err) };
  }
}

export type RequiredRoleResult =
  | { ok: true; userId?: string; userName?: string }
  | { ok: false; httpStatus: number; code: "unauthorized" | "genesys_error" | "missing_role"; message: string };

/**
 * Prüft, ob der Aufrufer die Polly-Rolle `role` hat. Rollen und Projekt-Tag sind unabhängig voneinander
 * und werden parallel geladen (spart einen Genesys-Umlauf). `logPrefix` z. B. `[invitations]`.
 */
export async function requireCallerRole(params: {
  logPrefix: string;
  tenantId: string;
  region: string;
  token: string;
  credentials: TenantCredentials;
  role: string;
}): Promise<RequiredRoleResult> {
  const { logPrefix, tenantId, region, token, credentials, role } = params;
  const [caller, projectTag] = await Promise.all([
    loadCallerRoles(region, token),
    loadInstallationProjectTag(tenantId, credentials),
  ]);
  if (caller.status === "unauthorized") {
    return { ok: false, httpStatus: 401, code: "unauthorized", message: "Genesys token invalid" };
  }
  if (caller.status === "error") {
    console.error(`${logPrefix} cannot load roles`, { tenantId, httpStatus: caller.httpStatus, error: caller.error });
    return { ok: false, httpStatus: caller.httpStatus === 429 ? 429 : 502, code: "genesys_error", message: "Cannot load user roles" };
  }
  if (!projectTag.ok) {
    console.error(`${logPrefix} cannot read __meta`, { tenantId, error: projectTag.error });
    return { ok: false, httpStatus: projectTag.httpStatus === 429 ? 429 : 502, code: "genesys_error", message: "Cannot read setup metadata" };
  }
  if (!hasPollyRole(caller.roles, role, projectTag.projectTag)) {
    console.warn(`${logPrefix} missing role`, { tenantId, projectTag: projectTag.projectTag });
    return { ok: false, httpStatus: 403, code: "missing_role", message: `Role ${role} required` };
  }
  return { ok: true, userId: caller.userId, userName: caller.userName };
}
