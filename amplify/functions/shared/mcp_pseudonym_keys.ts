import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { derivePseudonymKeys, type PseudonymKeys } from "./pseudonym";
import { TtlCache } from "./ttl_cache";

/**
 * Lädt den Ausgangsschlüssel für Pseudonyme und versiegelte Cursor (`MCP_PSEUDONYM_SECRET_ARN`, angelegt in
 * `backend.ts`) und leitet die Schlüssel ab. Der Wert steht nie in Env-Variablen oder Logs, nur der ARN; im Speicher
 * der Lambda-Instanz liegen nur die abgeleiteten Schlüssel (5 min gemerkt).
 */

const sm = new SecretsManagerClient({});

const SECRET_ARN = process.env.MCP_PSEUDONYM_SECRET_ARN ?? "";

const cache = new TtlCache<PseudonymKeys>({ ttlMs: 5 * 60 * 1000, maxEntries: 1 });

/** Wirft, wenn das Secret fehlt, leer oder zu kurz ist (die Tools melden dann `internal_error`, nie Klartext-IDs). */
export function loadPseudonymKeys(): Promise<PseudonymKeys> {
  return cache.getOrLoad(SECRET_ARN, async () => {
    if (!SECRET_ARN) throw new Error("MCP_PSEUDONYM_SECRET_ARN not configured");
    const res = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
    if (!res.SecretString) throw new Error("Pseudonym secret is empty");
    return { value: derivePseudonymKeys(res.SecretString) };
  });
}
