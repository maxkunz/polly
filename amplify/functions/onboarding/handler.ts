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

const TENANTS_TABLE_NAME = process.env.TENANTS_TABLE_NAME!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const RESOURCE_SERVER_IDENTIFIER = process.env.RESOURCE_SERVER_IDENTIFIER!; // e.g. "backend"
const CLIENT_SCOPE = process.env.CLIENT_SCOPE!; // e.g. "invoke"
const SECRETS_PREFIX = process.env.SECRETS_PREFIX ?? "gc-clients"; // name prefix only
const TOKEN_URL = process.env.TOKEN_URL ?? "";

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
};

type ApproveBody = {
  backendClientId: string;
};

type DeleteTenantBody = {
  backendClientId: string;
  // If true, the secret is deleted immediately without recovery window.
  forceDeleteSecret?: boolean;
};

type WipeAllBody = {
  // Must be exactly this string to proceed.
  confirm: "DELETE_ALL";
  // If true, secrets are deleted immediately without recovery window.
  forceDeleteSecrets?: boolean;
};

type RouteHandler = (event: AnyApiGwEvent) => Promise<AnyResult>;
type RouteKey = `${string} ${string}`;

const routes: Record<RouteKey, RouteHandler> = {
  "POST /onboarding/start": startRoute,
  "POST /onboarding/complete": completeRoute,
  "POST /onboarding/approve": approveRoute,

  // Destructive endpoints
  "POST /onboarding/delete": deleteTenantRoute,
  "POST /onboarding/wipeAll": wipeAllRoute,
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

  const now = new Date().toISOString();

  const existing = await ddb.send(
    new GetCommand({
      TableName: TENANTS_TABLE_NAME,
      Key: { backendClientId: body.backendClientId },
    })
  );

  if (!existing.Item) return json(404, { message: "Unknown backendClientId" });

  const tenantId = existing.Item.tenantId as string;
  const secretName = `${SECRETS_PREFIX}/${tenantId}`;

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
        "SET genesysRegion = :r, genesysClientId = :cid, genesysSecretArn = :arn, allowedDataTableIds = :dt, updatedAt = :u",
      ExpressionAttributeValues: {
        ":r": body.genesysRegion,
        ":cid": body.genesysClientId,
        ":arn": secretArn!,
        ":dt": body.allowedDataTableIds ?? [],
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
 * Deletes exactly one tenant:
 * - Deletes the Cognito User Pool App Client (backendClientId)
 * - Deletes the Secrets Manager secret (genesysSecretArn) if present
 * - Deletes the DynamoDB item
 *
 */
async function deleteTenantRoute(event: AnyApiGwEvent): Promise<AnyResult> {
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
    console.warn("Failed to delete Cognito app client (continuing)", {
      backendClientId,
      errorName: e?.name,
      message: e?.message,
    });
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
      console.warn("Failed to delete secret (continuing)", {
        tenantId,
        secretArn,
        errorName: e?.name,
        message: e?.message,
      });
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

  return json(200, {
    message: "Tenant deleted",
    backendClientId,
    tenantId,
    deletedSecretArn: secretArn ?? null,
  });
}

/**
 * DANGEROUS: wipes ALL tenants in the table.
 * - Scans DynamoDB table
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

  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TENANTS_TABLE_NAME,
        ExclusiveStartKey: lastEvaluatedKey,
        ProjectionExpression: "backendClientId, tenantId, genesysSecretArn",
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

  console.warn("WIPING ALL TENANTS - DONE", { deletedCount });

  return json(200, {
    message: "All tenants wiped",
    deletedCount,
    forceDeleteSecrets,
  });
}
