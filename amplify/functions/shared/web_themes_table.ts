import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { WEB_THEME_MAX_PER_TENANT, type WebTheme, type WebThemeTokens } from "../../../src/domain/webTheme/webTheme";
import { TtlCache } from "./ttl_cache";
import { toWebTheme } from "./web_themes";

/**
 * Zugriff auf `WebSurveyThemesTable` (Lambdas `web_themes`, `web_survey` und `surveys_api`). Getrennt von
 * `web_themes.ts`, damit die reinen Funktionen dort ohne AWS-SDK testbar bleiben.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Verwaltungseintrag pro Mandant (SK, keine UUID, also nie eine Design-ID) mit dem Zähler `revision`.
 * Jedes Speichern erhöht ihn unter Bedingung, so schließen sich parallele Schreibvorgänge eines Mandanten aus
 * und die Obergrenze `WEB_THEME_MAX_PER_TENANT` gilt auch bei gleichzeitigen Importen.
 */
const REVISION_ITEM_ID = "#revision";

/**
 * Alle Designs eines Mandanten mit einer Query auf PK `tenantId` (höchstens 50 Designs, wenige KB;
 * trotzdem paginiert), ohne den Verwaltungseintrag. `projection` z. B. `"themeId, isDefault"`.
 */
export async function queryWebThemeItems(
  tableName: string,
  tenantId: string,
  projection?: string
): Promise<Record<string, unknown>[]> {
  const items = await queryTenantItems(tableName, tenantId, projection);
  return items.filter((item) => item.themeId !== REVISION_ITEM_ID);
}

async function queryTenantItems(
  tableName: string,
  tenantId: string,
  projection?: string
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "tenantId = :tenantId",
        ExpressionAttributeValues: { ":tenantId": tenantId },
        ...(projection ? { ProjectionExpression: projection } : {}),
        ...(projection?.includes("#revision") ? { ExpressionAttributeNames: { "#revision": "revision" } } : {}),
        ExclusiveStartKey: startKey,
      })
    );
    items.push(...((result.Items ?? []) as Record<string, unknown>[]));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return items;
}

/**
 * Cache der Designs pro Mandant (eine Query auf PK `tenantId`, höchstens 50 Designs, wenige KB).
 * Auch eine leere Liste wird gemerkt. Änderungen an einem Design wirken so nach höchstens 30 s.
 */
const themeCache = new TtlCache<WebTheme[]>({ ttlMs: 30 * 1000 });

/**
 * Designs des Mandanten (gecacht, Tabelle aus `WEB_THEMES_TABLE_NAME`). Fehler sind nicht fatal: Die Seite
 * erscheint dann im eingebauten Design. Läuft bei `web_survey` per `Promise.all` parallel zum Laden des
 * Prod-Stands, weil nur `tenantId` gebraucht wird.
 */
export async function loadTenantThemesCached(tenantId: string, fresh = false): Promise<WebTheme[]> {
  const tableName = process.env.WEB_THEMES_TABLE_NAME ?? "";
  if (!tableName) return [];
  try {
    return await themeCache.getOrLoad(
      tenantId,
      async () => {
        const items = await queryWebThemeItems(tableName, tenantId);
        return { value: items.map(toWebTheme).filter((theme): theme is WebTheme => theme !== null) };
      },
      fresh
    );
  } catch (err) {
    console.error("[web_themes_table] cannot load themes", { tenantId, error: String((err as Error)?.message ?? err) });
    return [];
  }
}

export interface WebThemeInput {
  themeId: string;
  name: string;
  /** Fehlt (nur beim Import): Ein vorhandenes Design behält seine Markierung, ein neues wird kein Standard. */
  isDefault?: boolean;
  tokens: WebThemeTokens;
}

export interface SaveWebThemesOptions {
  /**
   * Optimistisches Sperren (nur bei genau einem Design): `updatedAt` des Stands, den der Editor geladen hat,
   * `null` = neues Design. Ohne die Option überschreibt der Aufruf (Import über die Kunden-API).
   */
  expectedUpdatedAt?: string | null;
}

export type SaveWebThemesResult =
  | { ok: true; themes: WebTheme[]; created: number; updated: number; clearedDefaults: number }
  | { ok: false; reason: "limit_reached" | "conflict" };

/** Abbruchgründe einer Transaktion, die auf eine parallele Änderung hindeuten (sonst ein echter Fehler). */
const CONFLICT_REASONS = new Set(["None", "ConditionalCheckFailed", "TransactionConflict"]);

/**
 * Legt Designs an oder überschreibt sie (Upsert nach `themeId`), alles oder nichts: Prüfung der Obergrenze
 * `WEB_THEME_MAX_PER_TENANT` über die Gesamtzahl danach; ein neues Standard-Design nimmt den bisherigen
 * die Markierung in derselben Transaktion (höchstens 100 Einträge, hier höchstens 50 Designs, die bisherigen
 * Standard-Designs und der Verwaltungseintrag). Die Aufrufer prüfen vorab Format und doppelte IDs.
 * `updatedBy` ist der Bearbeiter (Name der App-Nutzerin bzw. `api:<clientId>`). Parallele Änderungen
 * desselben Mandanten ergeben `conflict` (über `revision`, siehe `REVISION_ITEM_ID`).
 */
export async function saveWebThemes(
  tableName: string,
  tenantId: string,
  themes: readonly WebThemeInput[],
  updatedBy: string | undefined,
  options: SaveWebThemesOptions = {}
): Promise<SaveWebThemesResult> {
  const all = await queryTenantItems(tableName, tenantId, "themeId, isDefault, #revision");
  const revisionItem = all.find((item) => item.themeId === REVISION_ITEM_ID);
  const existing = all.filter((item) => item !== revisionItem);
  const existingIds = new Set(existing.map((item) => item.themeId));
  const created = themes.filter((theme) => !existingIds.has(theme.themeId)).length;
  if (existing.length + created > WEB_THEME_MAX_PER_TENANT) return { ok: false, reason: "limit_reached" };

  // Ohne Angabe bleibt die Markierung erhalten, außer ein anderer Eintrag wird neues Standard-Design
  const hasNewDefault = themes.some((theme) => theme.isDefault === true);
  const defaultIds = new Set(existing.filter((item) => item.isDefault === true).map((item) => String(item.themeId)));
  const updatedAt = new Date().toISOString();
  const items = themes.map((theme) => ({
    tenantId,
    ...theme,
    isDefault: theme.isDefault ?? (!hasNewDefault && defaultIds.has(theme.themeId)),
    updatedAt,
    updatedBy,
  }));

  // Optimistisches Sperren: Neu anlegen nur, wenn es die ID noch nicht gibt; Ändern nur auf dem Stand, den
  // der Editor geladen hat. So überschreibt ein veralteter Editor keine fremde Änderung und holt ein
  // zwischenzeitlich gelöschtes Design nicht zurück.
  const { expectedUpdatedAt } = options;
  const puts = items.map((item) => ({
    TableName: tableName,
    Item: item,
    ...(expectedUpdatedAt === undefined
      ? {}
      : expectedUpdatedAt === null
        ? { ConditionExpression: "attribute_not_exists(themeId)" }
        : { ConditionExpression: "updatedAt = :expected", ExpressionAttributeValues: { ":expected": expectedUpdatedAt } }),
  }));

  // Neues Standard-Design: Die bisherigen verlieren die Markierung in derselben Transaktion
  const savedIds = new Set(themes.map((theme) => theme.themeId));
  const previousDefaults = hasNewDefault
    ? existing.filter((entry) => entry.isDefault === true && !savedIds.has(String(entry.themeId)))
    : [];

  // Die Anzahl oben gilt nur, solange niemand dazwischen speichert: `revision` muss noch der gelesene Wert sein
  const revision = Number(revisionItem?.revision);
  const revisionUpdate = {
    TableName: tableName,
    Key: { tenantId, themeId: REVISION_ITEM_ID },
    UpdateExpression: "SET #revision = :next",
    ExpressionAttributeNames: { "#revision": "revision" },
    ...(Number.isFinite(revision)
      ? { ConditionExpression: "#revision = :seen", ExpressionAttributeValues: { ":seen": revision, ":next": revision + 1 } }
      : { ConditionExpression: "attribute_not_exists(#revision)", ExpressionAttributeValues: { ":next": 1 } }),
  };
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          ...puts.map((put) => ({ Put: put })),
          ...previousDefaults.map((entry) => ({
            Update: {
              TableName: tableName,
              Key: { tenantId, themeId: entry.themeId },
              UpdateExpression: "SET isDefault = :false",
              ConditionExpression: "attribute_exists(themeId)",
              ExpressionAttributeValues: { ":false": false },
            },
          })),
          { Update: revisionUpdate },
        ],
      })
    );
  } catch (err: any) {
    // Design zwischenzeitlich geändert/gelöscht, bisheriges Standard-Design gerade gelöscht oder paralleles
    // Speichern. Andere Gründe (z. B. Drosselung) sind kein Konflikt und werden weitergeworfen.
    if (err?.name === "TransactionCanceledException") {
      const reasons: string[] = (err.CancellationReasons ?? []).map((reason: any) => String(reason?.Code ?? "None"));
      if (reasons.every((code) => CONFLICT_REASONS.has(code))) {
        console.warn("[web_themes_table] conflict", { tenantId, reasons });
        return { ok: false, reason: "conflict" };
      }
      console.error("[web_themes_table] transaction cancelled", { tenantId, reasons });
    }
    throw err;
  }

  return {
    ok: true,
    themes: items.map((item) => toWebTheme(item)).filter((theme): theme is WebTheme => theme !== null),
    created,
    updated: themes.length - created,
    clearedDefaults: previousDefaults.length,
  };
}
