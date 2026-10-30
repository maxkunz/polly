import { DecryptCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms";

/**
 * KMS-Verschlüsselung mit `McpTokenKey` (nur `mcp_admin` und `mcp`): das Secret des Genesys-Clients der
 * MCP-Anmeldung und die Genesys-Tokens einer MCP-Session. Getrennt von `mcp_tenant.ts`, damit Lambdas, die nur
 * aufräumen, kein KMS bündeln.
 */

const kms = new KMSClient({});

const MCP_TOKEN_KEY_ARN = process.env.MCP_TOKEN_KEY_ARN ?? "";

async function encrypt(plaintext: string, context: Record<string, string>): Promise<string> {
  if (!MCP_TOKEN_KEY_ARN) throw new Error("MCP_TOKEN_KEY_ARN not configured");
  const res = await kms.send(
    new EncryptCommand({
      KeyId: MCP_TOKEN_KEY_ARN,
      Plaintext: Buffer.from(plaintext, "utf8"),
      EncryptionContext: context,
    })
  );
  if (!res.CiphertextBlob) throw new Error("KMS returned no ciphertext");
  return Buffer.from(res.CiphertextBlob).toString("base64");
}

async function decrypt(encrypted: string, context: Record<string, string>): Promise<string> {
  const res = await kms.send(
    new DecryptCommand({
      KeyId: MCP_TOKEN_KEY_ARN,
      CiphertextBlob: Buffer.from(encrypted, "base64"),
      EncryptionContext: context,
    })
  );
  if (!res.Plaintext) throw new Error("KMS returned no plaintext");
  return Buffer.from(res.Plaintext).toString("utf8");
}

/** Das Secret ist an den Mandanten gebunden: ein kopierter Eintrag lässt sich bei einem anderen nicht entschlüsseln. */
function secretContext(tenantId: string): Record<string, string> {
  return { purpose: "mcp-genesys-client-secret", tenantId };
}

/** Verschlüsselt das Secret des Genesys-Clients (Base64) für `TenantsTable.mcpClientSecretEnc`. */
export function encryptClientSecret(tenantId: string, secret: string): Promise<string> {
  return encrypt(secret, secretContext(tenantId));
}

/** Gegenstück zu `encryptClientSecret` (für den Token-Tausch und Refresh bei Genesys). */
export function decryptClientSecret(tenantId: string, encrypted: string): Promise<string> {
  return decrypt(encrypted, secretContext(tenantId));
}

export interface GenesysSessionTokens {
  accessToken: string;
  refreshToken?: string;
}

/** Genesys-Tokens sind an Mandant und Session gebunden. */
function sessionContext(tenantId: string, sessionId: string): Record<string, string> {
  return { purpose: "mcp-genesys-tokens", tenantId, sessionId };
}

/** Verschlüsselt Access- und Refresh-Token der Session in einem Aufruf (`SESSION#…`, `genesysTokensEnc`). */
export function encryptGenesysTokens(tenantId: string, sessionId: string, tokens: GenesysSessionTokens): Promise<string> {
  return encrypt(JSON.stringify({ a: tokens.accessToken, r: tokens.refreshToken }), sessionContext(tenantId, sessionId));
}

export async function decryptGenesysTokens(tenantId: string, sessionId: string, encrypted: string): Promise<GenesysSessionTokens> {
  const data = JSON.parse(await decrypt(encrypted, sessionContext(tenantId, sessionId)));
  if (typeof data?.a !== "string" || !data.a) throw new Error("Session tokens malformed");
  return { accessToken: data.a, refreshToken: typeof data.r === "string" && data.r ? data.r : undefined };
}
