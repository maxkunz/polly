import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { isFeatureEnabled } from "../../../src/domain/features/featureFlags";
import { isGenesysRegion, normalizeGenesysRegion } from "../shared/genesys_regions";
import { getSurveyTableAccess } from "../shared/genesys_survey_check";
import { loadInstallationMeta } from "../shared/installation_meta";
import { isMcpEnabled } from "../shared/mcp_config";
import { DEFAULT_GENESYS_REGION, loadTenantCredentials, type TenantCredentials } from "../shared/tenant_auth";
import { TtlCache } from "../shared/ttl_cache";
import { isTenantKey } from "./oauth";

/**
 * Prüfkette Schritte 1 bis 3 (`documentation/polly_mcp.md`, Abschnitt 3): Kill-Switch, Mandant per URL-Schlüssel
 * (`mcpEnabled`, `APPROVED`, Genesys-Client und Org gesetzt) und Feature Flag `mcp` in `__meta`. Jede Verletzung
 * ergibt dasselbe „nicht gefunden“, damit sich keine Mandanten aufzählen lassen.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TENANTS_TABLE_NAME = process.env.TENANTS_TABLE_NAME ?? "";
const TENANTS_MCP_KEY_INDEX = process.env.TENANTS_MCP_KEY_INDEX ?? "byMcpTenantKey";

/** Schlüssel → `backendClientId` ändert sich nie; Schalter und Epoch werden trotzdem bei jedem Aufruf frisch gelesen. */
const keyLookupCache = new TtlCache<string | null>({ ttlMs: 5 * 60 * 1000, maxEntries: 1000 });
const KEY_MISS_TTL_MS = 30 * 1000;

export interface McpTenant {
  tenantId: string;
  backendClientId: string;
  mcpTenantKey: string;
  epoch: number;
  region: string;
  genesysClientId: string;
  genesysOrgId: string;
  clientSecretEnc?: string;
  allowComments: boolean;
  tenantName: string;
}

/** Rein: Darf der Mandanteneintrag über diesen Schlüssel MCP nutzen? Sonst `undefined`. */
export function evaluateMcpTenant(item: Record<string, any> | undefined, tenantKey: string): McpTenant | undefined {
  if (!item || item.mcpTenantKey !== tenantKey) return undefined;
  if (item.mcpEnabled !== true || item.status !== "APPROVED") return undefined;
  const tenantId = typeof item.tenantId === "string" ? item.tenantId : "";
  const genesysClientId = typeof item.mcpGenesysClientId === "string" ? item.mcpGenesysClientId : "";
  const genesysOrgId = typeof item.genesysOrgId === "string" ? item.genesysOrgId : "";
  if (!tenantId || !genesysClientId || !genesysOrgId) return undefined;
  const region = normalizeGenesysRegion(item.genesysRegion);
  return {
    tenantId,
    backendClientId: String(item.backendClientId),
    mcpTenantKey: tenantKey,
    epoch: Number.isInteger(item.mcpEpoch) ? item.mcpEpoch : 0,
    region: isGenesysRegion(region) ? region : DEFAULT_GENESYS_REGION,
    genesysClientId,
    genesysOrgId,
    clientSecretEnc: typeof item.mcpClientSecretEnc === "string" && item.mcpClientSecretEnc ? item.mcpClientSecretEnc : undefined,
    allowComments: item.mcpAllowComments === true,
    tenantName: typeof item.tenantName === "string" ? item.tenantName : "",
  };
}

async function lookupBackendClientId(tenantKey: string): Promise<string | null> {
  return keyLookupCache.getOrLoad(tenantKey, async () => {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TENANTS_TABLE_NAME,
        IndexName: TENANTS_MCP_KEY_INDEX,
        KeyConditionExpression: "mcpTenantKey = :k",
        ExpressionAttributeValues: { ":k": tenantKey },
        ProjectionExpression: "backendClientId",
        Limit: 2,
      })
    );
    const items = res.Items ?? [];
    // Doppelte Schlüssel dürfen nicht vorkommen; dann lieber gar keinen Mandanten
    if (items.length !== 1 || typeof items[0].backendClientId !== "string") return { value: null, ttlMs: KEY_MISS_TTL_MS };
    return { value: items[0].backendClientId };
  });
}

export type McpTenantResolution =
  | { ok: true; tenant: McpTenant; credentials: TenantCredentials }
  | { ok: false; reason: "not_found" }
  /** Genesys oder Secrets nicht erreichbar: vorübergehend, kein „nicht gefunden“ */
  | { ok: false; reason: "unavailable" };

export async function resolveMcpTenant(tenantKey: unknown): Promise<McpTenantResolution> {
  if (!isMcpEnabled() || !isTenantKey(tenantKey)) return { ok: false, reason: "not_found" };
  const backendClientId = await lookupBackendClientId(tenantKey);
  if (!backendClientId) return { ok: false, reason: "not_found" };
  const res = await ddb.send(new GetCommand({ TableName: TENANTS_TABLE_NAME, Key: { backendClientId }, ConsistentRead: true }));
  const item = res.Item as Record<string, any> | undefined;
  const tenant = evaluateMcpTenant(item, tenantKey);
  if (!tenant) return { ok: false, reason: "not_found" };

  let credentials: TenantCredentials | undefined;
  let featureEnabled: boolean;
  try {
    credentials = await loadTenantCredentials(tenant.tenantId, item);
    if (!credentials) return { ok: false, reason: "not_found" };
    const meta = await loadInstallationMeta(tenant.tenantId, await getSurveyTableAccess(credentials));
    featureEnabled = isFeatureEnabled(meta.features, "mcp");
  } catch (err: any) {
    console.error("[mcp] cannot read installation meta", { tenantId: tenant.tenantId, name: err?.name, status: err?.status });
    return { ok: false, reason: "unavailable" };
  }
  // Das Flag kann nur abschalten, nie allein einschalten (mcpEnabled ist maßgeblich)
  if (!featureEnabled) return { ok: false, reason: "not_found" };
  return { ok: true, tenant, credentials };
}
