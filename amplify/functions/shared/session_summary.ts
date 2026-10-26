import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_CHANNEL, sessionVersion } from "./answer_records";
import type { ExportSession } from "./answer_records";
import { ddb, SESSION_PAGE_SIZE } from "./survey_sessions";

/**
 * Zählen von Sitzungen eines Zeitraums ohne die Antworten: gemeinsame Grundlage der Vorschau im
 * CSV-Export (mit Cursor) und von `GET /ext/v1/reporting/summary` (ohne Cursor).
 */

const SURVEY_RESPONSES_TABLE_NAME = process.env.SURVEY_RESPONSES_TABLE_NAME ?? "";

// Anzahl paralleler Zeitabschnitte (siehe buildTimeSlices). Bei 100.000+ Sessions dauerte die
// sequenzielle Abfrage ca. 16 s; mit parallelen Teilbereichen laufen die Query-Aufrufe gleichzeitig.
// Ein ungültiger Wert ergäbe keine Abschnitte und damit stillschweigend 0 Sitzungen.
const configuredSliceCount = Number(process.env.SUMMARY_SLICE_COUNT);
export const SUMMARY_SLICE_COUNT =
  Number.isInteger(configuredSliceCount) && configuredSliceCount > 0 ? configuredSliceCount : 10;

export interface ExportSummary {
  sessions: number;
  statusCounts: Record<string, number>;
  versions: Record<string, number>;
  channels: Record<string, number>;
}

export function createSummary(): ExportSummary {
  return { sessions: 0, statusCounts: {}, versions: {}, channels: {} };
}

/** Zählt eine Session in die Teil-Zusammenfassung ein. */
export function addToSummary(summary: ExportSummary, session: ExportSession): void {
  summary.sessions += 1;

  const status = session.status ?? "unknown";
  summary.statusCounts[status] = (summary.statusCounts[status] ?? 0) + 1;

  const version = String(sessionVersion(session));
  summary.versions[version] = (summary.versions[version] ?? 0) + 1;

  const channel = session.channel || DEFAULT_CHANNEL;
  summary.channels[channel] = (summary.channels[channel] ?? 0) + 1;
}

// Für die Zusammenfassung genügen Status, Version und ggf. Kanal (siehe addToSummary). Die answers-Maps
// werden bewusst nicht gelesen: ihr Unmarshalling war bei 100.000+ Sessions der Hauptteil der Laufzeit.
// `channel` nur auf Wunsch (Kunden-API); die Vorschau in der App zeigt keine Kanäle.
const SUMMARY_NAMES: Record<string, string> = {
  "#tenantId": "tenantId",
  "#sk": "surveyStartedAt",
  "#status": "status",
  "#surveyVersion": "surveyVersion",
};
const SUMMARY_PROJECTION = "#status, #surveyVersion";
const SUMMARY_NAMES_WITH_CHANNEL: Record<string, string> = { ...SUMMARY_NAMES, "#channel": "channel" };
const SUMMARY_PROJECTION_WITH_CHANNEL = `${SUMMARY_PROJECTION}, #channel`;

export interface SummaryOptions {
  /** Nur Sessions dieser Version zählen (Filter im Speicher, gleiche Regel wie `/data`). */
  version?: number;
  /** `channel` mitlesen; ohne zählt jede Session unter dem Standardkanal. */
  withChannels?: boolean;
}

export interface SummarySlice {
  from: string;
  to: string;
  startKey?: Record<string, any>;
  done: boolean;
}

/**
 * Teilt [fromIso, toIso] in bis zu `count` lückenlose, nicht überlappende Zeitabschnitte (auf
 * Millisekunden-Basis), damit die Vorschau mehrere Query-Aufrufe parallel statt nacheinander
 * ausführen kann. Bei sehr kurzen Zeiträumen (weniger Millisekunden als `count`) entstehen
 * entsprechend weniger, aber immer gültige (nicht-leere) Abschnitte.
 */
export function buildTimeSlices(fromIso: string, toIso: string, count: number): { from: string; to: string }[] {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  // Anzahl Millisekunden im (inklusiven) Zeitraum; exakte Integer-Aufteilung statt proportionaler
  // Rundung, damit bei sehr kurzen Zeiträumen keine zwei Grenzen zusammenfallen (leerer/ungültiger
  // Abschnitt mit from > to).
  const totalMs = toMs - fromMs + 1;
  const sliceCount = Math.max(1, Math.min(count, totalMs));
  const baseLength = Math.floor(totalMs / sliceCount);
  const remainder = totalMs % sliceCount;

  const slices: { from: string; to: string }[] = [];
  let start = fromMs;
  for (let i = 0; i < sliceCount; i++) {
    const length = baseLength + (i < remainder ? 1 : 0);
    const end = start + length - 1;
    slices.push({ from: new Date(start).toISOString(), to: new Date(end).toISOString() });
    start = end + 1;
  }
  return slices;
}

/**
 * Liest einen Zeitabschnitt zu Ende (oder bis `canContinue` false liefert) und zählt die Sessions
 * direkt in `summary` ein. `summary` wird parallel von mehreren Slices mutiert; das ist
 * unkritisch, weil addToSummary synchron läuft und zwischen den Items keine await-Punkte liegen –
 * die JS-Event-Loop unterbricht also nie mitten in einem Zähl-Durchlauf.
 */
export async function summarizeSlice(
  tenantId: string,
  surveyId: string,
  slice: SummarySlice,
  summary: ExportSummary,
  canContinue: () => boolean,
  options: SummaryOptions = {},
): Promise<SummarySlice> {
  if (slice.done) return slice;
  const { version, withChannels = false } = options;

  let startKey = slice.startKey;
  while (canContinue()) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: SURVEY_RESPONSES_TABLE_NAME,
        IndexName: "byTenantSurvey",
        KeyConditionExpression: "#tenantId = :tenantId AND #sk BETWEEN :from AND :to",
        ExpressionAttributeNames: withChannels ? SUMMARY_NAMES_WITH_CHANNEL : SUMMARY_NAMES,
        ExpressionAttributeValues: {
          ":tenantId": tenantId,
          ":from": `${surveyId}#${slice.from}`,
          ":to": `${surveyId}#${slice.to}`,
        },
        ProjectionExpression: withChannels ? SUMMARY_PROJECTION_WITH_CHANNEL : SUMMARY_PROJECTION,
        Limit: SESSION_PAGE_SIZE,
        ScanIndexForward: true,
        ExclusiveStartKey: startKey,
      }),
    );

    for (const item of result.Items ?? []) {
      if (version !== undefined && sessionVersion(item) !== version) continue;
      addToSummary(summary, item as ExportSession);
    }

    startKey = result.LastEvaluatedKey;
    if (!startKey) {
      return { from: slice.from, to: slice.to, done: true };
    }
  }

  return { from: slice.from, to: slice.to, startKey, done: false };
}

/** Neue, noch ungelesene Zeitabschnitte für [fromIso, toIso] (SUMMARY_SLICE_COUNT Stück). */
export function openSlices(fromIso: string, toIso: string): SummarySlice[] {
  return buildTimeSlices(fromIso, toIso, SUMMARY_SLICE_COUNT).map((range) => ({ ...range, done: false }));
}

/**
 * Liest alle `slices` parallel und zählt in `summary`. Wirft ein Abschnitt einen Fehler, liefert
 * `canContinue` für die übrigen ab sofort `false`, damit sie keine weiteren Seiten mehr lesen.
 */
export async function summarizeSlices(
  tenantId: string,
  surveyId: string,
  slices: SummarySlice[],
  summary: ExportSummary,
  canContinue: () => boolean,
  options: SummaryOptions = {},
): Promise<SummarySlice[]> {
  let failed = false;
  const keepReading = () => !failed && canContinue();
  return Promise.all(
    slices.map((slice) =>
      summarizeSlice(tenantId, surveyId, slice, summary, keepReading, options).catch((error) => {
        failed = true;
        throw error;
      }),
    ),
  );
}
