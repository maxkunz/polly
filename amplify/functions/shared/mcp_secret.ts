import { DecryptCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms";

/**
 * Secret des Genesys-Clients der MCP-Anmeldung, verschlüsselt mit `McpTokenKey` (nur `mcp_admin` und `mcp`).
 * Getrennt von `mcp_tenant.ts`, damit Lambdas, die nur aufräumen, kein KMS bündeln.
 */

const kms = new KMSClient({});

const MCP_TOKEN_KEY_ARN = process.env.MCP_TOKEN_KEY_ARN ?? "";

/** Das Secret ist an den Mandanten gebunden: ein kopierter Eintrag lässt sich bei einem anderen nicht entschlüsseln. */
function secretContext(tenantId: string): Record<string, string> {
  return { purpose: "mcp-genesys-client-secret", tenantId };
}

/** Verschlüsselt das Secret des Genesys-Clients (Base64) für `TenantsTable.mcpClientSecretEnc`. */
export async function encryptClientSecret(tenantId: string, secret: string): Promise<string> {
  if (!MCP_TOKEN_KEY_ARN) throw new Error("MCP_TOKEN_KEY_ARN not configured");
  const res = await kms.send(
    new EncryptCommand({
      KeyId: MCP_TOKEN_KEY_ARN,
      Plaintext: Buffer.from(secret, "utf8"),
      EncryptionContext: secretContext(tenantId),
    })
  );
  if (!res.CiphertextBlob) throw new Error("KMS returned no ciphertext");
  return Buffer.from(res.CiphertextBlob).toString("base64");
}

/** Gegenstück zu `encryptClientSecret` (für den Token-Tausch bei Genesys, M7). */
export async function decryptClientSecret(tenantId: string, encrypted: string): Promise<string> {
  const res = await kms.send(
    new DecryptCommand({
      KeyId: MCP_TOKEN_KEY_ARN,
      CiphertextBlob: Buffer.from(encrypted, "base64"),
      EncryptionContext: secretContext(tenantId),
    })
  );
  if (!res.Plaintext) throw new Error("KMS returned no plaintext");
  return Buffer.from(res.Plaintext).toString("utf8");
}
