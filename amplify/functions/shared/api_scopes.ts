/**
 * Scopes der Kunden-API (`/ext/v1/…`), rein und ohne AWS-SDK: gemeinsam genutzt von `backend.ts`
 * (Resource Server), der Lambda `onboarding` (API-Clients anlegen) und `api_client_auth.ts` (Prüfung).
 * Die Scopes gelten für alle API-Versionen, siehe documentation/polly_customer_api.md.
 */

/** Kennung des Cognito Resource Servers; Präfix jedes Scopes im Token (`polly-api/reporting.read`). */
export const API_RESOURCE_SERVER = "polly-api";

/** Fachliche Scopes, ohne Mandant (den Mandanten findet die Lambda über die client_id). */
export const API_SCOPES = ["reporting.read", "invitations.write", "surveys.read"] as const;

export type ApiScope = (typeof API_SCOPES)[number];
export type ApiFullScope = `${typeof API_RESOURCE_SERVER}/${ApiScope}`;

/** Beschreibungen für den Resource Server in Cognito (ASCII). */
export const API_SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  "reporting.read": "Read survey responses",
  "invitations.write": "Create web survey invitations",
  "surveys.read": "Read survey details",
};

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && (API_SCOPES as readonly string[]).includes(value);
}

export function toFullScope(scope: ApiScope): ApiFullScope {
  return `${API_RESOURCE_SERVER}/${scope}`;
}

/** Zerlegt den Claim `scope` eines Cognito-Access-Tokens (durch Leerzeichen getrennt). */
export function parseScopeClaim(claim: unknown): string[] {
  if (typeof claim !== "string") return [];
  return claim.split(/\s+/).filter(Boolean);
}

/** true, wenn der Claim `scope` den geforderten Scope exakt enthält (kein Präfix- oder Teilvergleich). */
export function hasScope(claim: unknown, required: ApiFullScope): boolean {
  return parseScopeClaim(claim).includes(required);
}

export type RequestedScopesResult = { ok: true; scopes: ApiScope[] } | { ok: false; error: string };

/**
 * Prüft die Scopes beim Anlegen eines API-Clients: nicht leeres Array, nur Werte aus `API_SCOPES`
 * (ohne Präfix `polly-api/`), Duplikate werden entfernt, Reihenfolge wie in `API_SCOPES`.
 */
export function parseRequestedScopes(input: unknown): RequestedScopesResult {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: `scopes must be a non-empty array of: ${API_SCOPES.join(", ")}` };
  }
  const unknown = input.filter((scope) => !isApiScope(scope));
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown scopes: ${unknown.map((scope) => JSON.stringify(scope)).join(", ")}` };
  }
  return { ok: true, scopes: API_SCOPES.filter((scope) => input.includes(scope)) };
}

/** Scope-String für den Token-Abruf (`scope=…`), durch Leerzeichen getrennt. */
export function scopeString(scopes: readonly ApiScope[]): string {
  return scopes.map(toFullScope).join(" ");
}
