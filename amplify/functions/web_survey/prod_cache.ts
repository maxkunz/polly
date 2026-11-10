/**
 * Regeln für den Cache des Prod-Stands in der Lambda `web_survey` (rein, ohne AWS-SDK),
 * getestet in `test/webSurveyBackend.test.ts`.
 */

/** Lebensdauer eines gecachten Prod-Stands pro Lambda-Container. */
export const PROD_CACHE_TTL_MS = 30 * 1000;

/**
 * Jüngere Cache-Einträge werden beim Absenden nicht nachgeladen: Nach einem Deploy schicken viele offene
 * Seiten die alte Version, sonst läse jede davon die Genesys-API des Mandanten erneut.
 */
export const PROD_RELOAD_MIN_AGE_MS = 5 * 1000;

export interface ProdReloadInput {
  /** Alter des Cache-Eintrags in ms; `undefined`, wenn der Stand gerade frisch gelesen wurde. */
  cacheAgeMs: number | undefined;
  cachedVersion: number;
  /** `surveyVersion` aus der Absendung. */
  requestedVersion: number;
}

/**
 * Muss das Absenden den Prod-Stand frisch nachladen? Nur wenn er aus dem Cache kam, von der Version der
 * Seite abweicht (neuer Deploy, Seite aus anderem Container) und der Eintrag nicht gerade erst gelesen wurde.
 */
export function shouldReloadProd(input: ProdReloadInput): boolean {
  if (input.cacheAgeMs === undefined) return false;
  if (input.cachedVersion === input.requestedVersion) return false;
  return input.cacheAgeMs >= PROD_RELOAD_MIN_AGE_MS;
}
