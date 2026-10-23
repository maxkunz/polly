import type { APIGatewayProxyResult, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  SecretsManagerClient,
  CreateSecretCommand,
  PutSecretValueCommand,
  DescribeSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  DeleteUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { loadTenantByTenantId, resolveTenantContext } from "../shared/tenant_auth";
import type { ApiClientItem } from "../shared/api_client_auth";
import { parseRequestedScopes, scopeString, toFullScope } from "../shared/api_scopes";

import { isGenesysRegion, normalizeGenesysRegion } from "../shared/genesys_regions";

const TENANTS_TABLE_NAME = process.env.TENANTS_TABLE_NAME!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const RESOURCE_SERVER_IDENTIFIER = process.env.RESOURCE_SERVER_IDENTIFIER!; // e.g. "backend"
const CLIENT_SCOPE = process.env.CLIENT_SCOPE!; // e.g. "invoke"
const SECRETS_PREFIX = process.env.SECRETS_PREFIX ?? "gc-clients"; // name prefix only
const TOKEN_URL = process.env.TOKEN_URL ?? "";
// API-Clients der Kunden-API (/ext/v1); fehlt die Variable, antworten nur die api-clients-Routen mit 500
const API_CLIENTS_TABLE_NAME = process.env.API_CLIENTS_TABLE_NAME ?? "";
const API_CLIENT_TOKEN_VALIDITY_MINUTES = 60;
const API_CLIENT_LABEL_MAX_CHARS = 100;
const COGNITO_CLIENT_NAME_MAX_CHARS = 128;

// Optional: protect destructive endpoints (HIGHLY recommended)
// Set this env var to a random value (and provide it as header x-admin-token)
const ADMIN_TOKEN_SECRET_ARN = process.env.ADMIN_TOKEN_SECRET_ARN ?? "";

if (
  !TENANTS_TABLE_NAME ||
  !USER_POOL_ID ||
  !RESOURCE_SERVER_IDENTIFIER ||
  !CLIENT_SCOPE
) {
  throw new Error("Missing required env vars");
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sm = new SecretsManagerClient({});
const cognito = new CognitoIdentityProviderClient({});

type AnyApiGwEvent = any;
type AnyResult = APIGatewayProxyResult | APIGatewayProxyResultV2;

function json(statusCode: number, body: unknown): AnyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  } as AnyResult;
}

function getMethod(event: AnyApiGwEvent): string {
  const v2 = event?.requestContext?.http?.method;
  if (typeof v2 === "string") return v2;

  const v1 = event?.httpMethod;
  if (typeof v1 === "string") return v1;

  return "";
}

function getPath(event: AnyApiGwEvent): string {
  const v2 = event?.requestContext?.http?.path ?? event?.rawPath;
  if (typeof v2 === "string") return v2;

  const v1 = event?.path;
  if (typeof v1 === "string") return v1;

  return "";
}

function safeParse<T>(raw?: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

let cachedAdminToken: string | null = null;
let cachedAdminTokenLoaded = false;

async function loadAdminToken(): Promise<string> {
  if (cachedAdminTokenLoaded) return cachedAdminToken ?? "";

  cachedAdminTokenLoaded = true;

  if (!ADMIN_TOKEN_SECRET_ARN) {
    console.warn("ADMIN_TOKEN_SECRET_ARN not configured.");
    cachedAdminToken = "";
    return "";
  }

  const res = await sm.send(
    new GetSecretValueCommand({
      SecretId: ADMIN_TOKEN_SECRET_ARN,
    })
  );

  const token = (res.SecretString ?? "").trim();
  cachedAdminToken = token;

  return token;
}

async function requireAdmin(event: AnyApiGwEvent): Promise<AnyResult | null> {
  const adminToken = await loadAdminToken();

  // If token is not configured, block admin endpoints
  if (!adminToken) {
    console.warn("Admin token not configured; blocking admin endpoint.");
    return json(403, {
      message:
        "Admin endpoint is disabled. Configure ADMIN_TOKEN_SECRET_ARN to enable.",
    });
  }

  const headerToken =
    event?.headers?.["x-admin-token"] ??
    event?.headers?.["X-Admin-Token"];

  if (headerToken !== adminToken) {
    console.warn("Invalid admin token.");
    return json(403, { message: "Forbidden" });
  }

  return null;
}

type StartBody = {
  tenantName: string;
  frontendVersion?: string;
  tenantId?: string;
};

type CompleteBody = {
  backendClientId: string; // returned from start
  genesysRegion: string;
  genesysClientId: string;
  genesysClientSecret: string;
  allowedDataTableIds?: string[];
  /** Data Table mit den Umfragen (Web-Kanal liest dort `survey_<id>`); fehlt sie, gilt `allowedDataTableIds[0]`. */
  surveyDataTableId?: string;
};

type ApproveBody = {
  backendClientId: string;
};

type DeleteTenantBody = {
  backendClientId: string;
  // If true, the secret is deleted immediately without recovery window.
  forceDeleteSecret?: boolean;
};

type UninstallTenantBody = {
  backendClientId: string;
};

type WipeAllBody = {
  // Must be exactly this string to proceed.
  confirm: "DELETE_ALL";
  // If true, secrets are deleted immediately without recovery window.
  forceDeleteSecrets?: boolean;
};

type CreateApiClientBody = {
  tenantId: string;
  // Freitext für das Betriebsteam, z. B. "CMS Kunde X"
  label: string;
  // ohne Präfix polly-api/, z. B. ["reporting.read"]
  scopes: string[];
};

type ListApiClientsBody = {
  tenantId: string;
};

type DeleteApiClientBody = {
  clientId: string;
};

type RouteHandler = (event: AnyApiGwEvent) => Promise<AnyResult>;
type RouteKey = `${string} ${string}`;

const routes: Record<RouteKey, RouteHandler> = {
  "POST /onboarding/start": startRoute,
  "POST /onboarding/complete": completeRoute,
  "POST /onboarding/approve": approveRoute,
  "POST /onboarding/uninstall": uninstallTenantRoute,

  // Destructive endpoints (ADMIN_TOKEN required)
  "POST /onboarding/delete": deleteTenantRoute,
  "POST /onboarding/wipeAll": wipeAllRoute,

  // API-Clients der Kunden-API (ADMIN_TOKEN required)
  "POST /onboarding/api-clients/create": createApiClientRoute,
  "POST /onboarding/api-clients/list": listApiClientsRoute,
  "POST /onboarding/api-clients/delete": deleteApiClientRoute,
};

export const handler = async (event: AnyApiGwEvent): Promise<AnyResult> => {
  const method = getMethod(event);
  const path = getPath(event);

  // CORS preflight
  if (method === "OPTIONS") return json(204, "");

  if (!method || !path) {
    console.error("Unable to determine method/path", { method, path });
    return json(400, { message: "Bad request" });
  }

  const key = `${method} ${path}` as RouteKey;
  const route = routes[key];

  if (!route) {
    const debug = {
      message: "Not found",
      method,
      path,
      key,
      rawPath: event?.rawPath,
      v1Path: event?.path,
      v2Path: event?.requestContext?.http?.path,
      stage: event?.requestContext?.stage,
      httpMethodV1: event?.httpMethod,
      httpMethodV2: event?.requestContext?.http?.method,
    };

    console.warn("No route match", debug);
    return json(404, debug);
  }

  try {
    return await route(event);
  } catch (err: any) {
    console.error("Unhandled error", err);
    return json(500, {
      message: "Internal error",
      details: err?.message ?? String(err),
    });
  }
};

async function startRoute(event: AnyApiGwEvent): Promise<AnyResult> {
  const tenantResult = await resolveTenantContext(event, { skipTenantLookup: true });
  if (!tenantResult.context || tenantResult.context.source !== "genesys") {
    return json(403, { message: tenantResult.error ?? "Genesys token required" });
  }

  const body = safeParse<StartBody>(event.body);
  if (!body?.tenantName) return json(400, { message: "tenantName is required" });

  const providedTenantId = (body.tenantId ?? "").trim();
  const isValidExternalTenantId =
    providedTenantId.length > 0 && /^[a-zA-Z0-9-]{6,128}$/.test(providedTenantId);

  if (providedTenantId.length > 0 && !isValidExternalTenantId) {
    console.warn("Invalid tenantId provided; rejecting request", {
      providedTenantIdLength: providedTenantId.length,
    });
    return json(400, {
      message:
        "tenantId must contain only letters, numbers and hyphens (6-128 chars)",
    });
  }

  const tenantId = isValidExternalTenantId ? providedTenantId : randomUUID();
  const now = new Date().toISOString();

  const createdClient = await cognito.send(
    new CreateUserPoolClientCommand({
      UserPoolId: USER_POOL_ID,
      ClientName: `ora-tenant-${tenantId}`,
      GenerateSecret: true,
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["client_credentials"],
      AllowedOAuthScopes: [`${RESOURCE_SERVER_IDENTIFIER}/${CLIENT_SCOPE}`],
      PreventUserExistenceErrors: "ENABLED",
    })
  );

  const backendClientId = createdClient.UserPoolClient?.ClientId;
  const backendClientSecret = createdClient.UserPoolClient?.ClientSecret;

  if (!backendClientId || !backendClientSecret) {
    return json(500, { message: "Failed to create cognito app client" });
  }

  await ddb.send(
    new PutCommand({
      TableName: TENANTS_TABLE_NAME,
      Item: {
        backendClientId,
        tenantId,
        installerTenantId: tenantResult.context.tenantId,
        tenantName: body.tenantName,
        frontendVersion: body.frontendVersion ?? null,
        status: "PENDING",
        genesysRegion: null,
        genesysClientId: null,
        genesysSecretArn: null,
        allowedDataTableIds: [],
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: "attribute_not_exists(backendClientId)",
    })
  );

  return json(200, {
    tenantId,
    status: "PENDING",
    tokenUrl: TOKEN_URL,
    backendAuth: {
      clientId: backendClientId,
      clientSecret: backendClientSecret,
      scope: `${RESOURCE_SERVER_IDENTIFIER}/${CLIENT_SCOPE}`,
    },
  });
}

async function completeRoute(event: AnyApiGwEvent): Promise<AnyResult> {
  const tenantResult = await resolveTenantContext(event, { skipTenantLookup: true });
  if (!tenantResult.context || tenantResult.context.source !== "genesys") {
    return json(403, { message: tenantResult.error ?? "Genesys token required" });
  }

  const body = safeParse<CompleteBody>(event.body);
  if (
    !body?.backendClientId ||
    !body?.genesysRegion ||
    !body?.genesysClientId ||
    !body?.genesysClientSecret
  ) {
    return json(400, {
      message:
        "backendClientId, genesysRegion, genesysClientId, genesysClientSecret are required",
    });
  }
  if (!isGenesysRegion(body.genesysRegion)) {
    return json(400, { message: "Unsupported genesysRegion" });
  }
  const genesysRegion = normalizeGenesysRegion(body.genesysRegion);
  if (body.surveyDataTableId !== undefined && (typeof body.surveyDataTableId !== "string" || !body.surveyDataTableId.trim())) {
    return json(400, { message: "surveyDataTableId must be a non-empty string" });
  }
  const surveyDataTableId = body.surveyDataTableId?.trim() ?? null;
  // Die Umfrage-Tabelle gehört immer zu den erlaubten Tabellen (Prüfung vor dem Löschen von Ergebnissen)
  const allowedDataTableIds = Array.from(
    new Set([...(surveyDataTableId ? [surveyDataTableId] : []), ...(body.allowedDataTableIds ?? [])])
  );

  const now = new Date().toISOString();

  const existing = await ddb.send(
    new GetCommand({
      TableName: TENANTS_TABLE_NAME,
      Key: { backendClientId: body.backendClientId },
    })
  );

  if (!existing.Item) return json(404, { message: "Unknown backendClientId" });
  if (existing.Item.tenantId !== tenantResult.context.tenantId
    && existing.Item.installerTenantId !== tenantResult.context.tenantId) {
    return json(403, { message: "backendClientId does not match authenticated tenant" });
  }

  const tenantId = existing.Item.tenantId as string;
  // DELETED-Installationen bleiben für die Admin-Bereinigung erhalten.
  // Ihr Secret darf deshalb nicht von einer Neuinstallation wiederverwendet werden.
  const secretName = `${SECRETS_PREFIX}/${tenantId}/${body.backendClientId}`;

  let secretArn: string | undefined = existing.Item.genesysSecretArn as
    | string
    | undefined;

  const secretPayload = JSON.stringify({
    genesysClientId: body.genesysClientId,
    genesysClientSecret: body.genesysClientSecret,
  });

  if (!secretArn) {
    try {
      const created = await sm.send(
        new CreateSecretCommand({
          Name: secretName,
          SecretString: secretPayload,
          Tags: [
            { Key: "App", Value: "ora" },
            { Key: "TenantId", Value: tenantId },
          ],
        })
      );
      secretArn = created.ARN;
    } catch (e: any) {
      console.warn(
        "CreateSecret failed (likely already exists). Falling back to DescribeSecret + PutSecretValue.",
        e?.name ?? e
      );

      const described = await sm.send(
        new DescribeSecretCommand({
          SecretId: secretName,
        })
      );

      if (!described.ARN) {
        return json(500, { message: "Secret exists but ARN could not be resolved" });
      }

      secretArn = described.ARN;

      await sm.send(
        new PutSecretValueCommand({
          SecretId: secretArn,
          SecretString: secretPayload,
        })
      );
    }
  } else {
    await sm.send(
      new PutSecretValueCommand({
        SecretId: secretArn,
        SecretString: secretPayload,
      })
    );
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TENANTS_TABLE_NAME,
      Key: { backendClientId: body.backendClientId },
      UpdateExpression:
        "SET genesysRegion = :r, genesysClientId = :cid, genesysSecretArn = :arn, allowedDataTableIds = :dt, surveyDataTableId = :sdt, updatedAt = :u",
      ExpressionAttributeValues: {
        ":r": genesysRegion,
        ":cid": body.genesysClientId,
        ":arn": secretArn!,
        ":dt": allowedDataTableIds,
        ":sdt": surveyDataTableId,
        ":u": now,
      },
    })
  );

  return json(200, {
    status: "PENDING",
    message: "Genesys credentials stored. Awaiting approval.",
  });
}

async function approveRoute(event: AnyApiGwEvent): Promise<AnyResult> {
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  const body = safeParse<ApproveBody>(event.body);
  if (!body?.backendClientId)
    return json(400, { message: "backendClientId is required" });

  const now = new Date().toISOString();

  await ddb.send(
    new UpdateCommand({
      TableName: TENANTS_TABLE_NAME,
      Key: { backendClientId: body.backendClientId },
      UpdateExpression: "SET #s = :a, updatedAt = :u",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":a": "APPROVED", ":u": now },
    })
  );

  return json(200, { status: "APPROVED" });
}

/**
 * Frontend uninstall and rollback mark the authenticated tenant as DELETED.
 * Cognito clients and secrets are retained for admin cleanup.
 */
async function uninstallTenantRoute(event: AnyApiGwEvent): Promise<AnyResult> {
  const tenantResult = await resolveTenantContext(event, { skipTenantLookup: true });
  if (!tenantResult.context || tenantResult.context.source !== "genesys") {
    return json(403, { message: tenantResult.error ?? "Genesys token required" });
  }

  const body = safeParse<UninstallTenantBody>(event.body);
  const backendClientId = body?.backendClientId?.trim() ?? "";
  if (!backendClientId) return json(400, { message: "backendClientId is required" });

  // Die konkrete Installation nachschlagen: auch PENDING-Rollbacks und Wiederholungen
  // nach DELETED müssen ohne Freigabe und ohne mehrdeutige Tenant-ID-Suche funktionieren.
  const existing = await ddb.send(new GetCommand({
    TableName: TENANTS_TABLE_NAME,
    Key: { backendClientId },
  }));
  if (!existing.Item) return json(404, { message: "Tenant not found" });
  if (existing.Item.tenantId !== tenantResult.context.tenantId
    && existing.Item.installerTenantId !== tenantResult.context.tenantId) {
    return json(403, { message: "backendClientId does not match authenticated tenant" });
  }

  const now = new Date().toISOString();
  await ddb.send(new UpdateCommand({
    TableName: TENANTS_TABLE_NAME,
    Key: { backendClientId },
    UpdateExpression: "SET #s = :deleted, updatedAt = :u",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":deleted": "DELETED", ":u": now },
  }));

  return json(200, {
    message: "Tenant marked as deleted",
    backendClientId,
    tenantId: existing.Item.tenantId,
    previousStatus: existing.Item.status ?? null,
    status: "DELETED",
  });
}

/**
 * Deletes exactly one tenant:
 * - Deletes the Cognito User Pool App Client (backendClientId)
 * - Deletes the Secrets Manager secret (genesysSecretArn) if present
 * - Deletes the DynamoDB item
 *
 */
async function deleteTenantRoute(event: AnyApiGwEvent): Promise<AnyResult> {
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  const body = safeParse<DeleteTenantBody>(event.body);
  if (!body?.backendClientId) {
    return json(400, { message: "backendClientId is required" });
  }

  const backendClientId = body.backendClientId;
  const forceDeleteSecret = body.forceDeleteSecret === true;

  console.log("Deleting tenant by backendClientId", { backendClientId });

  const existing = await ddb.send(
    new GetCommand({
      TableName: TENANTS_TABLE_NAME,
      Key: { backendClientId },
    })
  );

  if (!existing.Item) {
    return json(404, { message: "Tenant not found" });
  }

  const tenantId = existing.Item.tenantId as string;
  const secretArn = existing.Item.genesysSecretArn as string | undefined;

  // 1) Delete Cognito app client
  try {
    await cognito.send(
      new DeleteUserPoolClientCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: backendClientId,
      })
    );
    console.log("Deleted Cognito app client", { backendClientId });
  } catch (e: any) {
    console.warn("Failed to delete Cognito app client", {
      backendClientId,
      errorName: e?.name,
      message: e?.message,
    });
    if (e?.name !== "ResourceNotFoundException") throw e;
  }

  // 2) Delete secret (if exists)
  if (secretArn) {
    try {
      await sm.send(
        new DeleteSecretCommand({
          SecretId: secretArn,
          ForceDeleteWithoutRecovery: forceDeleteSecret,
        })
      );
      console.log("Deleted secret", {
        tenantId,
        secretArn,
        forceDeleteSecret,
      });
    } catch (e: any) {
      console.warn("Failed to delete secret", {
        tenantId,
        secretArn,
        errorName: e?.name,
        message: e?.message,
      });
      if (e?.name !== "ResourceNotFoundException") throw e;
    }
  }

  // 3) Delete DynamoDB item
  await ddb.send(
    new DeleteCommand({
      TableName: TENANTS_TABLE_NAME,
      Key: { backendClientId },
    })
  );

  console.log("Deleted tenant record", { backendClientId, tenantId });

  // 4) API-Clients der Kunden-API, falls keine weitere Installation mit dieser tenantId übrig ist.
  // Ein Fehler bricht nicht ab: Der Mandant ist schon gelöscht, die Clients sind damit ohnehin gesperrt.
  let deletedApiClients = 0;
  let failedApiClientIds: string[] = [];
  let apiClientsError: string | null = null;
  try {
    const cleanup = await deleteApiClientsOfRemovedTenant(tenantId, new Set([backendClientId]));
    deletedApiClients = cleanup.deleted;
    failedApiClientIds = cleanup.failedClientIds;
    if (failedApiClientIds.length) apiClientsError = "Some API clients could not be deleted";
  } catch (e: any) {
    console.warn("Failed to delete API clients of tenant", { tenantId, errorName: e?.name, message: e?.message });
    apiClientsError = e?.message ?? String(e);
  }

  return json(200, {
    message: "Tenant deleted",
    backendClientId,
    tenantId,
    deletedSecretArn: secretArn ?? null,
    deletedApiClients,
    failedApiClientIds,
    apiClientsError,
  });
}

/**
 * Deletes tenants marked DELETED, including their Cognito clients and secrets.
 * - Scans DynamoDB table for status DELETED
 * - For each item: delete Cognito app client, delete secret, delete DynamoDB item
 *
 * Requires ADMIN_TOKEN and body.confirm === "DELETE_ALL".
 */
async function wipeAllRoute(event: AnyApiGwEvent): Promise<AnyResult> {
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  const body = safeParse<WipeAllBody>(event.body);
  if (!body || body.confirm !== "DELETE_ALL") {
    return json(400, {
      message: 'Missing confirmation. Set {"confirm":"DELETE_ALL"} to proceed.',
    });
  }

  const forceDeleteSecrets = body.forceDeleteSecrets === true;

  console.warn("WIPING ALL TENANTS - START", { forceDeleteSecrets });

  let deletedCount = 0;
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;
  const wipedTenantIds = new Set<string>();
  const wipedBackendClientIds = new Set<string>();

  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TENANTS_TABLE_NAME,
        ExclusiveStartKey: lastEvaluatedKey,
        ProjectionExpression: "backendClientId, tenantId, genesysSecretArn, #status",
        FilterExpression: "#status = :deleted",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":deleted": "DELETED" },
      })
    );

    const items = (page.Items ?? []) as Array<{
      backendClientId: string;
      tenantId?: string;
      genesysSecretArn?: string;
    }>;

    for (const item of items) {
      const backendClientId = item.backendClientId;
      const tenantId = item.tenantId ?? "";
      const secretArn = item.genesysSecretArn;

      console.warn("Wipe tenant", { backendClientId, tenantId });

      // Delete Cognito app client
      try {
        await cognito.send(
          new DeleteUserPoolClientCommand({
            UserPoolId: USER_POOL_ID,
            ClientId: backendClientId,
          })
        );
      } catch (e: any) {
        console.warn("Failed to delete Cognito app client (continuing)", {
          backendClientId,
          errorName: e?.name,
          message: e?.message,
        });
      }

      // Delete secret
      if (secretArn) {
        try {
          await sm.send(
            new DeleteSecretCommand({
              SecretId: secretArn,
              ForceDeleteWithoutRecovery: forceDeleteSecrets,
            })
          );
        } catch (e: any) {
          console.warn("Failed to delete secret (continuing)", {
            backendClientId,
            secretArn,
            errorName: e?.name,
            message: e?.message,
          });
        }
      }

      // Delete DDB item
      try {
        await ddb.send(
          new DeleteCommand({
            TableName: TENANTS_TABLE_NAME,
            Key: { backendClientId },
          })
        );
        deletedCount += 1;
        wipedBackendClientIds.add(backendClientId);
        if (tenantId) wipedTenantIds.add(tenantId);
      } catch (e: any) {
        console.warn("Failed to delete DynamoDB item (continuing)", {
          backendClientId,
          errorName: e?.name,
          message: e?.message,
        });
      }
    }

    lastEvaluatedKey = page.LastEvaluatedKey as any;
  } while (lastEvaluatedKey);

  // API-Clients erst nach dem Scan löschen: Erst dann steht fest, welche tenantIds ganz verschwunden sind
  let deletedApiClients = 0;
  const failedApiClientIds: string[] = [];
  for (const tenantId of wipedTenantIds) {
    try {
      const cleanup = await deleteApiClientsOfRemovedTenant(tenantId, wipedBackendClientIds);
      deletedApiClients += cleanup.deleted;
      failedApiClientIds.push(...cleanup.failedClientIds);
    } catch (e: any) {
      console.warn("Failed to delete API clients (continuing)", {
        tenantId,
        errorName: e?.name,
        message: e?.message,
      });
    }
  }

  console.warn("WIPING ALL TENANTS - DONE", { deletedCount, deletedApiClients, failedApiClientIds });

  return json(200, {
    message: "All tenants wiped",
    deletedCount,
    deletedApiClients,
    failedApiClientIds,
    forceDeleteSecrets,
  });
}

// ---------------------------------------------------------------------------
// API-Clients der Kunden-API (/ext/v1). Anleitung: documentation/betrieb_api_zugaenge.md
// ---------------------------------------------------------------------------

function apiClientsTableMissing(): AnyResult | null {
  if (API_CLIENTS_TABLE_NAME) return null;
  console.error("API_CLIENTS_TABLE_NAME not configured");
  return json(500, { message: "API_CLIENTS_TABLE_NAME not configured" });
}

/**
 * Legt einen Cognito-Client (Client Credentials) mit den gewünschten Scopes und den Eintrag in
 * ApiClientsTable an. Das Secret steht nur in dieser Antwort und wird nirgends gespeichert.
 */
async function createApiClientRoute(event: AnyApiGwEvent): Promise<AnyResult> {
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;
  const configErr = apiClientsTableMissing();
  if (configErr) return configErr;

  const body = safeParse<CreateApiClientBody>(event.body);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
  if (!tenantId) return json(400, { message: "tenantId is required" });
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label || label.length > API_CLIENT_LABEL_MAX_CHARS) {
    return json(400, { message: `label is required (max. ${API_CLIENT_LABEL_MAX_CHARS} characters)` });
  }
  const requested = parseRequestedScopes(body?.scopes);
  if (!requested.ok) return json(400, { message: requested.error });
  const scopes = requested.scopes;

  if (!(await loadTenantByTenantId(tenantId))) {
    return json(409, { message: "Tenant not found or not APPROVED" });
  }

  const created = await cognito.send(
    new CreateUserPoolClientCommand({
      UserPoolId: USER_POOL_ID,
      ClientName: `polly-api-${tenantId}`.slice(0, COGNITO_CLIENT_NAME_MAX_CHARS),
      GenerateSecret: true,
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["client_credentials"],
      AllowedOAuthScopes: scopes.map(toFullScope),
      AccessTokenValidity: API_CLIENT_TOKEN_VALIDITY_MINUTES,
      TokenValidityUnits: { AccessToken: "minutes" },
      PreventUserExistenceErrors: "ENABLED",
    })
  );

  const clientId = created.UserPoolClient?.ClientId;
  const clientSecret = created.UserPoolClient?.ClientSecret;
  if (!clientId || !clientSecret) {
    return json(500, { message: "Failed to create cognito app client" });
  }

  const item: ApiClientItem = {
    clientId,
    tenantId,
    scopes,
    label,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: API_CLIENTS_TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(clientId)",
      })
    );
  } catch (e) {
    // Ohne Tabelleneintrag wäre der Client nutzlos (resolveApiClient lehnt ihn ab), also wieder entfernen
    await cognito
      .send(new DeleteUserPoolClientCommand({ UserPoolId: USER_POOL_ID, ClientId: clientId }))
      .catch((cleanupErr: any) =>
        console.warn("Failed to roll back Cognito app client", { clientId, errorName: cleanupErr?.name })
      );
    throw e;
  }

  console.log("API client created", { clientId, tenantId, scopes, label });

  return json(200, {
    clientId,
    clientSecret,
    tokenUrl: TOKEN_URL,
    scope: scopeString(scopes),
    tenantId,
    label,
  });
}

async function listApiClientsRoute(event: AnyApiGwEvent): Promise<AnyResult> {
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;
  const configErr = apiClientsTableMissing();
  if (configErr) return configErr;

  const body = safeParse<ListApiClientsBody>(event.body);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
  if (!tenantId) return json(400, { message: "tenantId is required" });

  const clients = await listApiClientsOfTenant(tenantId);
  return json(200, {
    tenantId,
    clients: clients.map((client) => ({
      clientId: client.clientId,
      label: client.label,
      scopes: client.scopes,
      status: client.status,
      createdAt: client.createdAt,
    })),
  });
}

async function deleteApiClientRoute(event: AnyApiGwEvent): Promise<AnyResult> {
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;
  const configErr = apiClientsTableMissing();
  if (configErr) return configErr;

  const body = safeParse<DeleteApiClientBody>(event.body);
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) return json(400, { message: "clientId is required" });

  // Nur Clients aus ApiClientsTable: Eine versehentlich übergebene backendClientId eines Mandanten
  // (Data Action) darf hier nicht gelöscht werden.
  const existing = await ddb.send(
    new GetCommand({ TableName: API_CLIENTS_TABLE_NAME, Key: { clientId } })
  );
  if (!existing.Item) return json(404, { message: "API client not found" });

  await deleteApiClient(clientId);
  console.log("API client deleted", { clientId, tenantId: existing.Item.tenantId });

  return json(200, {
    message: "API client deleted",
    clientId,
    tenantId: existing.Item.tenantId ?? null,
  });
}

async function listApiClientsOfTenant(tenantId: string): Promise<ApiClientItem[]> {
  const items: ApiClientItem[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: API_CLIENTS_TABLE_NAME,
        IndexName: "byTenantId",
        KeyConditionExpression: "tenantId = :t",
        ExpressionAttributeValues: { ":t": tenantId },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    items.push(...((page.Items ?? []) as ApiClientItem[]));
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return items;
}

/**
 * Sperrt den Client zuerst (Status DELETING, resolveApiClient akzeptiert nur ACTIVE), löscht dann den
 * Cognito-Client und zuletzt den Eintrag. Bricht ein Schritt ab, lässt sich der Aufruf wiederholen.
 */
async function deleteApiClient(clientId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: API_CLIENTS_TABLE_NAME,
        Key: { clientId },
        UpdateExpression: "SET #s = :deleting",
        ConditionExpression: "attribute_exists(clientId)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":deleting": "DELETING" },
      })
    );
  } catch (e: any) {
    // Eintrag schon weg (paralleles Löschen): nichts mehr zu tun
    if (e?.name === "ConditionalCheckFailedException") return;
    throw e;
  }

  try {
    await cognito.send(
      new DeleteUserPoolClientCommand({ UserPoolId: USER_POOL_ID, ClientId: clientId })
    );
  } catch (e: any) {
    if (e?.name !== "ResourceNotFoundException") throw e;
  }

  await ddb.send(new DeleteCommand({ TableName: API_CLIENTS_TABLE_NAME, Key: { clientId } }));
}

type ApiClientCleanup = { deleted: number; failedClientIds: string[] };

/**
 * Löscht die API-Clients einer tenantId, sofern in der Tenants-Tabelle kein weiterer Eintrag (gleich
 * welcher Status) mit dieser tenantId übrig ist. `removedBackendClientIds` sind die gerade gelöschten
 * Einträge: Der GSI liest nur eventually consistent und liefert sie kurz nach dem Löschen noch mit.
 * Ein fehlgeschlagener Client hält die übrigen nicht auf, er steht in `failedClientIds`.
 */
async function deleteApiClientsOfRemovedTenant(
  tenantId: string,
  removedBackendClientIds: ReadonlySet<string>
): Promise<ApiClientCleanup> {
  const result: ApiClientCleanup = { deleted: 0, failedClientIds: [] };
  if (!tenantId) return result;
  if (!API_CLIENTS_TABLE_NAME) {
    console.warn("API_CLIENTS_TABLE_NAME not configured; skipping API client cleanup", { tenantId });
    return result;
  }

  let lastEvaluatedKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TENANTS_TABLE_NAME,
        IndexName: "byTenantId",
        KeyConditionExpression: "tenantId = :t",
        ExpressionAttributeValues: { ":t": tenantId },
        ProjectionExpression: "backendClientId",
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    if ((page.Items ?? []).some((item) => !removedBackendClientIds.has(item.backendClientId))) {
      return result;
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  const clients = await listApiClientsOfTenant(tenantId);
  for (const client of clients) {
    try {
      await deleteApiClient(client.clientId);
      result.deleted += 1;
      console.log("Deleted API client of removed tenant", { clientId: client.clientId, tenantId });
    } catch (e: any) {
      result.failedClientIds.push(client.clientId);
      console.warn("Failed to delete API client of removed tenant (continuing)", {
        clientId: client.clientId,
        tenantId,
        errorName: e?.name,
        message: e?.message,
      });
    }
  }
  return result;
}
