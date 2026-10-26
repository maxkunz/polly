import { sanitizeWebThemeTokens, WEB_THEME_MAX_PER_TENANT } from "../../../src/domain/webTheme/webTheme";
import type { WebTheme, WebThemeTokens } from "../../../src/domain/webTheme/webTheme";
import { checkWebThemeName, compareWebThemes, isValidThemeId } from "../shared/web_themes";
import type { WebThemeInput } from "../shared/web_themes_table";

/**
 * Versionsschicht v1 von `GET /ext/v1/web-themes` und `POST /ext/v1/web-themes/import`: Request-Prüfung und
 * feste Feldabbildung. Rein (ohne AWS-SDK). Das interne Modell wird nie durchgereicht, siehe `toV1Theme`.
 * Export und Import haben dasselbe Format, ein Export lässt sich unverändert wieder importieren.
 */

/** Ein Import-Body enthält höchstens `WEB_THEME_MAX_PER_TENANT` Designs mit je wenigen hundert Byte. */
export const IMPORT_MAX_BODY_BYTES = 128 * 1024;

export type V1ImportResult = { ok: true; themes: WebThemeInput[] } | { ok: false; message: string };

/**
 * Prüft den Import-Body `{ themes: [{ themeId, name, isDefault?, tokens }] }` vorab für alle Einträge
 * (alles oder nichts). Unbekannte Felder (z. B. `updatedAt` aus dem Export) werden ignoriert, die Tokens laufen
 * durch `sanitizeWebThemeTokens` (unbekannte Felder fallen weg, ungültige Werte ergeben einen Fehler).
 * Die Meldungen nennen den Index des Eintrags, z. B. `themes[3].tokens are invalid`.
 */
export function parseV1ImportRequest(body: unknown): V1ImportResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object" };
  }
  const { themes } = body as Record<string, unknown>;
  if (!Array.isArray(themes) || themes.length === 0 || themes.length > WEB_THEME_MAX_PER_TENANT) {
    return { ok: false, message: `themes must be an array with 1 to ${WEB_THEME_MAX_PER_TENANT} entries` };
  }

  const result: WebThemeInput[] = [];
  const seen = new Set<string>();
  let defaultIndex = -1;
  for (const [index, entry] of themes.entries()) {
    const at = `themes[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, message: `${at} must be an object` };
    }
    const { themeId, name, isDefault, tokens } = entry as Record<string, unknown>;
    if (!isValidThemeId(themeId)) return { ok: false, message: `${at}.themeId must be a valid UUID` };
    // Wie die App erzeugte IDs (kleingeschrieben), damit dieselbe ID nicht in zwei Schreibweisen vorkommt
    const id = themeId.toLowerCase();
    if (seen.has(id)) return { ok: false, message: `${at}.themeId is a duplicate` };
    seen.add(id);

    const checkedName = checkWebThemeName(name);
    if (!checkedName.ok) return { ok: false, message: `${at}.${checkedName.message}` };
    if (isDefault !== undefined && typeof isDefault !== "boolean") {
      return { ok: false, message: `${at}.isDefault must be a boolean` };
    }
    const sanitized = sanitizeWebThemeTokens(tokens);
    if (!sanitized) return { ok: false, message: `${at}.tokens are invalid` };

    if (isDefault === true) {
      if (defaultIndex >= 0) {
        return { ok: false, message: `At most one theme can be the default (themes[${defaultIndex}] and ${at})` };
      }
      defaultIndex = index;
    }
    // Ohne `isDefault` bleibt die Markierung eines vorhandenen Designs erhalten (siehe `saveWebThemes`)
    result.push({ themeId: id, name: checkedName.name, isDefault, tokens: sanitized });
  }
  return { ok: true, themes: result };
}

export type V1Theme = {
  themeId: string;
  name: string;
  isDefault: boolean;
  updatedAt: string | null;
  tokens: WebThemeTokens;
};

/** Ein Design mit festen Feldern; `updatedBy` wird nicht ausgegeben. */
export function toV1Theme(theme: WebTheme): V1Theme {
  return {
    themeId: theme.id,
    name: theme.name,
    isDefault: theme.isDefault,
    updatedAt: theme.updatedAt || null,
    tokens: theme.tokens,
  };
}

/** Sortiert wie die Liste in der App (`compareWebThemes`). */
export function buildV1Response(themes: WebTheme[]): { themes: V1Theme[] } {
  return { themes: [...themes].sort(compareWebThemes).map(toV1Theme) };
}

export function buildV1ImportResponse(
  themes: WebTheme[],
  counts: { created: number; updated: number }
): { created: number; updated: number; themes: V1Theme[] } {
  return { created: counts.created, updated: counts.updated, ...buildV1Response(themes) };
}
