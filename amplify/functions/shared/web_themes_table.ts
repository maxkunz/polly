import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { WebTheme } from "../../../src/domain/webTheme/webTheme";
import { toWebTheme } from "./web_themes";

/**
 * Lesezugriff auf `WebSurveyThemesTable` (Lambdas `web_themes`, `web_survey` und `surveys_api`). Getrennt von
 * `web_themes.ts`, damit die reinen Funktionen dort ohne AWS-SDK testbar bleiben.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Alle Einträge eines Mandanten mit einer Query auf PK `tenantId` (höchstens 50 Designs, wenige KB;
 * trotzdem paginiert). `projection` z. B. `"themeId, isDefault"`.
 */
export async function queryWebThemeItems(
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
const THEME_CACHE_TTL_MS = 30 * 1000;
const THEME_CACHE_MAX_ENTRIES = 500;

const themeCache = new Map<string, { expiresAt: number; themes: WebTheme[] }>();

/**
 * Designs des Mandanten (gecacht, Tabelle aus `WEB_THEMES_TABLE_NAME`). Fehler sind nicht fatal: Die Seite
 * erscheint dann im eingebauten Design. Läuft bei `web_survey` per `Promise.all` parallel zum Laden des
 * Prod-Stands, weil nur `tenantId` gebraucht wird.
 */
export async function loadTenantThemesCached(tenantId: string, fresh = false): Promise<WebTheme[]> {
  const tableName = process.env.WEB_THEMES_TABLE_NAME ?? "";
  if (!tableName) return [];
  const cached = themeCache.get(tenantId);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.themes;

  try {
    const items = await queryWebThemeItems(tableName, tenantId);
    const themes = items.map(toWebTheme).filter((theme): theme is WebTheme => theme !== null);
    if (themeCache.size >= THEME_CACHE_MAX_ENTRIES) themeCache.clear();
    themeCache.set(tenantId, { themes, expiresAt: Date.now() + THEME_CACHE_TTL_MS });
    return themes;
  } catch (err) {
    console.error("[web_themes_table] cannot load themes", { tenantId, error: String((err as Error)?.message ?? err) });
    return [];
  }
}
