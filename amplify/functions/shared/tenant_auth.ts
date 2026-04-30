import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createPublicKey, verify } from "crypto";

type AnyApiGwEvent = any;

export type TenantContext = {
  tenantId: string;
  backendClientId?: string;
  genesysRegion?: string;
  genesysClientId?: string;
  genesysClientSecret?: string;
  status?: string;
  source: "cognito" | "genesys";
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sm = new SecretsManagerClient({});

const TENANTS_TABLE_NAME = process.env.TENANTS_TABLE_NAME ?? "";
const COGNITO_ISSUER = (process.env.COGNITO_ISSUER ?? "").trim();
const USER_POOL_ID = (process.env.USER_POOL_ID ?? "").trim();

const JWKS_TTL_MS = 10 * 60 * 1000;
const SECRET_TTL_MS = 5 * 60 * 1000;

const jwksCache = new Map<string, { expiresAt: number; jwks: any }>();
const secretCache = new Map<string, { expiresAt: number; value: any }>();

function jsonParseSafe(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function base64UrlToBuffer(input: string): Buffer {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

function getAuthorizationToken(event: AnyApiGwEvent): string {
  const headers = event?.headers ?? {};
  const auth = headers.authorization ?? headers.Authorization ?? "";
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

function getGenesysRegion(event: AnyApiGwEvent): string {
  const headers = event?.headers ?? {};
  const region = typeof headers["x-genesys-region"] === "string"
    ? headers["x-genesys-region"].trim()
    : "";
  return region || "mypurecloud.de";
}

function getIssuer(): string {
  if (COGNITO_ISSUER) return COGNITO_ISSUER;
  if (USER_POOL_ID && process.env.AWS_REGION) {
    return `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${USER_POOL_ID}`;
  }
  return "";
}

async function fetchJson(url: string, timeoutMs = 3000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadJwks(issuer: string): Promise<any> {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.jwks;

  const jwks = await fetchJson(`${issuer}/.well-known/jwks.json`);
  jwksCache.set(issuer, { jwks, expiresAt: Date.now() + JWKS_TTL_MS });
  return jwks;
}

function getClientIdFromClaims(claims: Record<string, any>): string {
  const clientId = claims.client_id;
  if (typeof clientId === "string" && clientId.trim()) return clientId.trim();

  const aud = claims.aud;
  if (typeof aud === "string" && aud.trim()) return aud.trim();
  if (Array.isArray(aud) && typeof aud[0] === "string") return aud[0];

  return "";
}

async function verifyCognitoJwt(token: string): Promise<{ claims?: Record<string, any>; error?: string }> {
  const issuer = getIssuer();
  if (!issuer) return { error: "COGNITO_ISSUER or USER_POOL_ID/AWS_REGION not configured" };

  const parts = token.split(".");
  if (parts.length !== 3) return { error: "Invalid token format" };

  const header = jsonParseSafe(base64UrlToBuffer(parts[0]).toString("utf8"));
  const claims = jsonParseSafe(base64UrlToBuffer(parts[1]).toString("utf8"));
  if (!header || !claims) return { error: "Invalid token payload" };

  if (header.alg !== "RS256") return { error: "Unsupported token alg" };
  const kid = header.kid;
  if (!kid) return { error: "Missing token kid" };

  const jwks = await loadJwks(issuer);
  const key = (jwks?.keys ?? []).find((k: any) => k.kid === kid);
  if (!key) return { error: "Unknown token kid" };

  const message = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToBuffer(parts[2]);

  let valid = false;
  try {
    const publicKey = createPublicKey({ key, format: "jwk" });
    valid = verify("RSA-SHA256", message, publicKey, signature);
  } catch {
    return { error: "Token verification failed" };
  }

  if (!valid) return { error: "Token verification failed" };
  if (claims.iss && claims.iss !== issuer) return { error: "Invalid token issuer" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && now >= claims.exp) return { error: "Token expired" };
  if (claims.token_use && claims.token_use !== "access") return { error: "Invalid token_use" };

  return { claims };
}

async function loadGenesysSecret(secretArn: string): Promise<{ genesysClientId?: string; genesysClientSecret?: string }> {
  const cached = secretCache.get(secretArn);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const parsed = jsonParseSafe(res.SecretString ?? "") ?? {};

  secretCache.set(secretArn, { value: parsed, expiresAt: Date.now() + SECRET_TTL_MS });
  return parsed;
}

async function loadTenantByBackendClientId(backendClientId: string) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TENANTS_TABLE_NAME,
      Key: { backendClientId },
    })
  );
  return res.Item as Record<string, any> | undefined;
}

async function loadTenantByTenantId(tenantId: string) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TENANTS_TABLE_NAME,
      IndexName: "byTenantId",
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "tenantId" },
      ExpressionAttributeValues: { ":pk": tenantId },
      Limit: 1,
    })
  );
  return res.Items?.[0] as Record<string, any> | undefined;
}

function pickGenesysClientId(data: any): string {
  if (!data) return "";
  return (
    data.clientId ??
    data.client_id ??
    data.client?.id ??
    data.OAuthClient?.id ??
    ""
  );
}

async function validateGenesysToken(
  region: string,
  token: string
): Promise<{ clientId?: string; error?: string }> {
  const url = `https://api.${region}/api/v2/tokens/me`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.warn("[tenant_auth] Genesys token validation failed", { region, status: res.status });
    return { error: `Genesys token invalid (HTTP ${res.status})` };
  }

  const data = await res.json();
  const actualClientId = pickGenesysClientId(data);
  if (!actualClientId) {
    console.warn("[tenant_auth] Genesys token missing clientId", {
      region,
      hasOAuthClient: Boolean(data?.OAuthClient?.id),
      hasClientId: Boolean(data?.clientId || data?.client_id),
    });
    return { error: "Genesys token missing clientId" };
  }

  console.log("[tenant_auth] Genesys token validated", { region, clientId: actualClientId });
  return { clientId: actualClientId };
}

export async function loadTenantContextFromCognito(
  event: AnyApiGwEvent,
  opts: { requireApproved?: boolean } = {}
): Promise<{ context?: TenantContext; error?: string }> {
  if (!TENANTS_TABLE_NAME) return { error: "TENANTS_TABLE_NAME not configured" };

  const token = getAuthorizationToken(event);
  if (!token) return { error: "Missing Authorization bearer token" };

  const { claims, error } = await verifyCognitoJwt(token);
  if (error || !claims) return { error: error ?? "Invalid token" };

  const backendClientId = getClientIdFromClaims(claims);
  if (!backendClientId) return { error: "Missing client_id in token" };

  const item = await loadTenantByBackendClientId(backendClientId);
  if (!item) return { error: "Unknown backendClientId" };
  if (opts.requireApproved && item.status !== "APPROVED") return { error: "Tenant not approved" };
  console.log("[tenant_auth] Cognito tenant lookup", {
    backendClientId,
    tenantId: item?.tenantId,
    status: item?.status,
    hasGenesysRegion: Boolean(item?.genesysRegion),
  });

  let genesysClientId: string | undefined;
  let genesysClientSecret: string | undefined;

  if (item.genesysSecretArn) {
    const secret = await loadGenesysSecret(item.genesysSecretArn);
    genesysClientId = secret.genesysClientId;
    genesysClientSecret = secret.genesysClientSecret;
  }

  return {
    context: {
      tenantId: item.tenantId,
      backendClientId,
      genesysRegion: item.genesysRegion ?? undefined,
      genesysClientId,
      genesysClientSecret,
      status: item.status,
      source: "cognito",
    },
  };
}

export async function resolveTenantFromGenesysToken(
  event: AnyApiGwEvent,
  opts: { requireApproved?: boolean } = {}
): Promise<{ context?: TenantContext; error?: string }> {
  if (!TENANTS_TABLE_NAME) return { error: "TENANTS_TABLE_NAME not configured" };

  const token = getAuthorizationToken(event);
  if (!token) return { error: "Missing Authorization bearer token" };

  const region = getGenesysRegion(event);
  console.log("[tenant_auth] Validating Genesys token", { region });
  const validation = await validateGenesysToken(region, token);
  if (validation.error) {
    console.warn("[tenant_auth] Genesys validation error", { error: validation.error });
    return { error: validation.error };
  }
  
  const tenantId = validation.clientId ?? "";
  if (!tenantId) return { error: "Genesys token missing clientId" };

  const item = await loadTenantByTenantId(tenantId);
  if (!item) {
    console.warn("[tenant_auth] Unknown tenantId", { tenantId });
    return { error: "Unknown tenantId" };
  }

  if (opts.requireApproved && item.status !== "APPROVED") {
    console.warn("[tenant_auth] Tenant not approved", { tenantId, status: item.status });
    return { error: "Tenant not approved" };
  }

  return {
    context: {
      tenantId,
      backendClientId: item.backendClientId,
      genesysRegion: item.genesysRegion ?? region,
      status: item.status,
      source: "genesys",
    },
  };
}

export async function resolveTenantContext(
  event: AnyApiGwEvent,
  opts: { requireApproved?: boolean } = {}
): Promise<{ context?: TenantContext; error?: string }> {
  const token = getAuthorizationToken(event);
  if (!token) return { error: "Missing Authorization bearer token" };

  let isCognito = false;
  const parts = token.split(".");
  if (parts.length === 3) {
    const claims = jsonParseSafe(base64UrlToBuffer(parts[1]).toString("utf8"));
    const issuer = typeof claims?.iss === "string" ? claims.iss : "";
    const expectedIssuer = getIssuer();
    if (issuer && expectedIssuer && issuer === expectedIssuer) {
      isCognito = true;
    }
  }

  if (isCognito) {
    return await loadTenantContextFromCognito(event, opts);
  }

  return await resolveTenantFromGenesysToken(event, opts);
}
