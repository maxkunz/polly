/** Prüfung von Umfrage-IDs ohne AWS-Abhängigkeiten (genutzt von reinen Request-Prüfungen und Lambdas). */

const SURVEY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Umfrage-IDs sind UUIDs; nur so ist `begins_with "<id>#"` eindeutig. */
export function isValidSurveyId(value: unknown): value is string {
  return typeof value === "string" && SURVEY_ID_PATTERN.test(value);
}
