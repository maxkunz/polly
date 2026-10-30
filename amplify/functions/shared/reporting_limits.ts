/**
 * Grenzwerte beim Lesen von Ergebnissen, gemeinsam für die Kunden-API (`reporting_api/v1.ts`) und MCP.
 * Rein, ohne Abhängigkeiten.
 */

/** Größter erlaubter Zeitraum (`to − from`) beim Lesen einzelner Antworten. */
export const MAX_RANGE_MS = 24 * 60 * 60 * 1000;
/** Größter erlaubter Zeitraum bei Zusammenfassungen: gezählt wird nur, die Antworten werden nicht gelesen. */
export const MAX_SUMMARY_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
/** Mehr Sitzungen im Zeitraum werden nicht im Speicher aufgebaut (Kunden-API: 413). */
export const MAX_SESSIONS = 10000;
