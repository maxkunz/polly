import {
  WEB_THEME_NAME_MAX_CHARS,
  isWebThemeId,
  parseWebTheme,
  sanitizeWebThemeTokens,
  type WebTheme,
  type WebThemeTokens,
} from "../../../src/domain/webTheme/webTheme";

/**
 * Web-Designs ohne AWS-Abhängigkeiten (Lambdas `web_themes` und `web_survey`, getestet in
 * `test/webSurveyBackend.test.ts`). Tabelle `WebSurveyThemesTable`: PK `tenantId`, SK `themeId`,
 * Attribute `name`, `isDefault`, `tokens` (Map), `updatedAt`, `updatedBy`.
 */

/** Design-IDs sind UUIDs (vom Frontend erzeugt, wie Umfrage-IDs). */
export const isValidThemeId = isWebThemeId;

/** Steuerzeichen (inkl. Zeilenumbruch) sind im Namen nicht erlaubt. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface WebThemeRequest {
  name: string;
  isDefault: boolean;
  tokens: WebThemeTokens;
  /**
   * Optimistisches Sperren: `updatedAt` des Stands, den der Editor geladen hat; `null` = neues Design.
   * Weicht der gespeicherte Stand ab (zwischenzeitlich geändert oder gelöscht), antwortet die Lambda mit 409.
   */
  expectedUpdatedAt: string | null;
}

/** ISO-Zeitstempel sind 24 Zeichen lang; die Grenze schützt nur vor Unsinn im Body. */
const UPDATED_AT_MAX_CHARS = 40;

export type WebThemeRequestResult = { ok: true; request: WebThemeRequest } | { ok: false; message: string };

/** Body von `PUT /web-themes/{id}`: `{ name, isDefault, tokens, expectedUpdatedAt }`. */
export function parseWebThemeRequest(body: unknown): WebThemeRequestResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Body must be a JSON object" };
  }
  const { name, isDefault, tokens, expectedUpdatedAt } = body as Record<string, unknown>;
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > WEB_THEME_NAME_MAX_CHARS || CONTROL_CHARS.test(trimmed)) {
    return { ok: false, message: `name must be 1 to ${WEB_THEME_NAME_MAX_CHARS} characters` };
  }
  if (isDefault !== undefined && typeof isDefault !== "boolean") {
    return { ok: false, message: "isDefault must be a boolean" };
  }
  if (
    expectedUpdatedAt !== undefined &&
    expectedUpdatedAt !== null &&
    (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt || expectedUpdatedAt.length > UPDATED_AT_MAX_CHARS)
  ) {
    return { ok: false, message: "expectedUpdatedAt must be a timestamp or null" };
  }
  const sanitized = sanitizeWebThemeTokens(tokens);
  if (!sanitized) {
    return { ok: false, message: "tokens are invalid" };
  }
  return {
    ok: true,
    request: {
      name: trimmed,
      isDefault: isDefault === true,
      tokens: sanitized,
      expectedUpdatedAt: typeof expectedUpdatedAt === "string" ? expectedUpdatedAt : null,
    },
  };
}

/** DynamoDB-Eintrag (SK `themeId`) → Design, Prüfung wie in der App (`parseWebTheme`). */
export function toWebTheme(item: Record<string, unknown> | undefined): WebTheme | null {
  return item ? parseWebTheme({ ...item, id: item.themeId }) : null;
}

/**
 * Design einer Umfrage: zuerst das gewählte (`web_theme_id` im Prod-Stand), sonst das Standard-Design
 * des Mandanten, sonst `undefined` (die Seite nutzt ihre Defaults). Ein gelöschtes gewähltes Design
 * fällt so auf das Standard-Design zurück.
 */
export function pickTheme(themes: readonly WebTheme[], webThemeId?: string | null): WebThemeTokens | undefined {
  const chosen = webThemeId ? themes.find((theme) => theme.id === webThemeId) : undefined;
  return (chosen ?? themes.find((theme) => theme.isDefault))?.tokens;
}
