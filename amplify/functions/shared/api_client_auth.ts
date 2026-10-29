import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { hasScope } from "./api_scopes";
import type { ApiFullScope } from "./api_scopes";
import { getAuthorizationToken, loadTenantByTenantId, verifyCognitoJwt } from "./tenant_auth";

/**
 * Anmeldung der Kunden-API (`/ext/v1/…`) über Cognito Client Credentials, ohne Version.
 * Reihenfolge: Token (401) → Scope (403) → Client in `ApiClientsTable` aktiv (403) → Mandant `APPROVED` (403).
 * Kein Cache: Das Löschen eines Clients wirkt sofort, auch für noch gültige Tokens.
 * Details: documentation/implementationsplan_external_api.md, Abschnitt „Gemeinsame Basis“.
 */

const API_CLIENTS_TABLE_NAME = process.env.API_CLIENTS_TABLE_NAME ?? "";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type ApiClientStatus = "ACTIVE" | "DELETING";

/** Eintrag in `ApiClientsTable` (Schlüssel `clientId`, GSI `byTenantId`). */
export type ApiClientItem = {
  clientId: string;
  tenantId: string;
  scopes: string[];
  label: string;
  status: ApiClientStatus;
  createdAt: string;
};

export type ApiClientAuthError = {
  ok: false;
  statusCode: 401 | 403;
  /** Fehlercode der Kunden-API, siehe documentation/polly_customer_api.md */
  error: "invalid_token" | "insufficient_scope" | "access_denied";
  message: string;
};

/** Eintrag des Mandanten in der TenantsTable (Status `APPROVED`). */
export type ApprovedTenant = Record<string, any>;

/** `tenant`: der bereits geladene Mandanteneintrag, z. B. für `loadTenantCredentials` ohne zweiten Lesezugriff. */
export type ApiClientAuthResult =
  | { ok: true; tenantId: string; clientId: string; tenant: ApprovedTenant }
  | ApiClientAuthError;

export type ApiClientAuthDeps = {
  loadApiClient: (clientId: string) => Promise<Pick<ApiClientItem, "tenantId" | "status"> | undefined>;
  /** Mandanteneintrag nur bei Status `APPROVED`, sonst `undefined`. */
  loadApprovedTenant: (tenantId: string) => Promise<ApprovedTenant | undefined>;
};

function denied(statusCode: 401 | 403, error: ApiClientAuthError["error"], message: string): ApiClientAuthError {
  return { ok: false, statusCode, error, message };
}

/** Prüfschritte 2–4 auf bereits verifizierten Claims; Datenzugriffe über `deps`, damit testbar. */
export async function authorizeApiClient(
  claims: Record<string, any>,
  requiredScope: ApiFullScope,
  deps: ApiClientAuthDeps
): Promise<ApiClientAuthResult> {
  // Lehnt auch den backend/invoke-Client der Data Action ab
  if (!hasScope(claims.scope, requiredScope)) {
    return denied(403, "insufficient_scope", `Token lacks scope ${requiredScope}`);
  }

  const clientId = typeof claims.client_id === "string" ? claims.client_id.trim() : "";
  if (!clientId) return denied(401, "invalid_token", "Missing client_id in token");

  const client = await deps.loadApiClient(clientId);
  if (!client || client.status !== "ACTIVE" || !client.tenantId) {
    console.warn("[api_client_auth] Unknown or inactive API client", { clientId, status: client?.status });
    return denied(403, "access_denied", "API client is not active");
  }

  const tenant = await deps.loadApprovedTenant(client.tenantId);
  if (!tenant) {
    console.warn("[api_client_auth] Tenant not approved", { clientId, tenantId: client.tenantId });
    return denied(403, "access_denied", "Tenant is not active");
  }

  return { ok: true, tenantId: client.tenantId, clientId, tenant };
}

async function loadApiClient(clientId: string): Promise<ApiClientItem | undefined> {
  if (!API_CLIENTS_TABLE_NAME) throw new Error("API_CLIENTS_TABLE_NAME not configured");
  // ConsistentRead: Sperren/Löschen eines Clients soll sofort wirken
  const res = await ddb.send(
    new GetCommand({ TableName: API_CLIENTS_TABLE_NAME, Key: { clientId }, ConsistentRead: true })
  );
  return res.Item as ApiClientItem | undefined;
}


/**
 * Meldet einen API-Client an und liefert seinen Mandanten. Konfigurations- und DynamoDB-Fehler werden
 * geworfen (500 im Handler), Anmeldefehler als `ok: false` mit 401/403 zurückgegeben.
 */
export async function resolveApiClient(event: any, requiredScope: ApiFullScope): Promise<ApiClientAuthResult> {
  const token = getAuthorizationToken(event);
  if (!token) return denied(401, "invalid_token", "Missing Authorization bearer token");

  const { claims, error } = await verifyCognitoJwt(token);
  if (error || !claims) {
    console.warn("[api_client_auth] Token rejected", { error });
    return denied(401, "invalid_token", "Invalid or expired token");
  }

  // loadTenantByTenantId liefert nur Einträge mit Status APPROVED
  return authorizeApiClient(claims, requiredScope, { loadApiClient, loadApprovedTenant: loadTenantByTenantId });
}
