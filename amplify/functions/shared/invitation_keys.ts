import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createInvitationKey, type InvitationKey } from "./invitation_token";
import { TtlCache } from "./ttl_cache";

/**
 * Lädt den Signaturschlüssel der Einladungen aus Secrets Manager (`WEB_SURVEY_JWT_SECRET_ARN`,
 * angelegt in `backend.ts`). Der Wert steht nie in Env-Variablen, nur der ARN.
 *
 * Geliefert werden `AWSCURRENT` (zum Signieren, immer an erster Stelle) und, falls vorhanden,
 * `AWSPREVIOUS` (nur zum Prüfen, damit eine manuelle Rotation bestehende Links nicht sofort ungültig macht).
 * Cache im Lambda-Container; der `kid` wird nur einmal pro geladenem Schlüssel berechnet.
 */

const sm = new SecretsManagerClient({});

const SECRET_ARN = process.env.WEB_SURVEY_JWT_SECRET_ARN ?? "";

const cache = new TtlCache<InvitationKey[]>({ ttlMs: 5 * 60 * 1000, maxEntries: 1 });

async function loadStage(stage: "AWSCURRENT" | "AWSPREVIOUS"): Promise<InvitationKey | null> {
  try {
    const res = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ARN, VersionStage: stage }));
    return res.SecretString ? createInvitationKey(res.SecretString) : null;
  } catch (err: any) {
    // Vor der ersten Rotation gibt es keine Version AWSPREVIOUS
    if (stage === "AWSPREVIOUS" && err?.name === "ResourceNotFoundException") return null;
    throw err;
  }
}

/** Alle gültigen Schlüssel, `AWSCURRENT` zuerst. Wirft, wenn `AWSCURRENT` nicht lesbar ist. */
export function loadInvitationKeys(): Promise<InvitationKey[]> {
  return cache.getOrLoad(SECRET_ARN, async () => ({ value: await requestInvitationKeys() }));
}

async function requestInvitationKeys(): Promise<InvitationKey[]> {
  if (!SECRET_ARN) throw new Error("WEB_SURVEY_JWT_SECRET_ARN not configured");

  const [current, previous] = await Promise.all([loadStage("AWSCURRENT"), loadStage("AWSPREVIOUS")]);
  if (!current) throw new Error("Invitation signing key is empty");

  return previous && previous.kid !== current.kid ? [current, previous] : [current];
}
