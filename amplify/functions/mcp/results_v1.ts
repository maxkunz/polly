import { isChoiceOptions, type ChoiceOptionLabel, type Survey, type SurveyQuestion } from "../../../src/domain/survey/surveyTypes";
import { parseDate, toV1Aggregate } from "../reporting_api/v1";
import {
  compareCodeUnits,
  DEFAULT_CHANNEL,
  sessionToAnswerRecords,
  sessionVersion,
  type AnswerRecord,
  type ExportSession,
} from "../shared/answer_records";
import { pseudonymize, type PseudonymKeys } from "../shared/pseudonym";
import type { ExportSummary } from "../shared/session_summary";
import type { SurveyAggregateItem } from "../shared/survey_results";
import { parseProdSurvey, text } from "../shared/web_survey_format";

/**
 * Auswertungs-Tools von MCP (`get_results_summary`, `get_aggregates`, `get_responses`): Zeitraum, Cursor, Seitenaufbau
 * und feste Feldabbildung. Rein (ohne AWS-SDK), getestet in `test/mcpToolsV1.test.ts`. Die Schemas stehen in
 * `tools_v1.ts`, der Ablauf in `tool_handlers.ts`.
 *
 * Datenschutz (`documentation/polly_mcp.md`, Abschnitt 8):
 * - Einzelantworten kennen nur das Pseudonym `r_…` der Sitzung (pro Mandant und Umfrage). `conversationId`
 *   (= `responseId` bei Kanal `flow`) und `tokenId` erscheinen weder in der Ausgabe noch im Cursor; der Cursor trägt
 *   nur Sitzungsstart und Pseudonym, versiegelt.
 * - Zeitpunkte nur grob: Sitzungsstart auf die volle Stunde, Antworten als Sekunden seit dem Start. Genaue Zeitstempel
 *   ließen sich mit Genesys-Interaktionsdaten verknüpfen und so der Anrufer bestimmen.
 * - Freitext gibt es nur bei Fragetyp `comment` und nur mit `mcpAllowComments`. Was nicht eindeutig strukturiert ist
 *   (unbekannter Typ, falscher Werttyp, Auswahlwert, der kein Label der Umfrage ist), zählt als Freitext und wird wie
 *   ein Kommentar behandelt; in Verteilungen fällt er weg und zählt nur in `otherCount`.
 */

export const RESPONSES_DEFAULT_LIMIT = 50;
export const RESPONSES_MAX_LIMIT = 100;
/** Zeichen pro Kommentar (Code Points). */
export const COMMENT_MAX_CHARS = 2000;
/** Zeichen pro Auswahlwert (Label einer Option). */
const CHOICE_VALUE_MAX_CHARS = 200;
/** Obergrenze für die Größe einer Seite von `get_responses`, damit Kommentare den Kontext der KI nicht sprengen. */
export const RESPONSES_MAX_PAGE_BYTES = 256 * 1024;
/** Lebensdauer eines Cursors. */
export const CURSOR_TTL_MS = 15 * 60 * 1000;
/** Mehr verschiedene Werte pro Frage deuten auf Freitext hin: Die Verteilung wird dann nicht ausgegeben. */
const DISTRIBUTION_MAX_KEYS = 100;
/** Länge von `questionId` in der Ausgabe (technische Namen sind deutlich kürzer). */
const QUESTION_ID_MAX_CHARS = 100;
/** Schlüssel der Aggregate für Antworten ohne Eingabe (`normalizeCountKey` in `survey_results.ts`). */
const EMPTY_COUNT_KEY = "empty";
const HOUR_MS = 60 * 60 * 1000;

const STRUCTURED_TYPES = new Set(["yes_no", "choice", "rating", "nps"]);
const KNOWN_TYPES = new Set([...STRUCTURED_TYPES, "comment"]);

/** Typ aus den gespeicherten Daten (vom Aufrufer des Flows mitgeschickt): nur bekannte Werte, sonst `unknown`. */
function safeType(type: unknown): string {
  return typeof type === "string" && KNOWN_TYPES.has(type) ? type : "unknown";
}

// Steuerzeichen, Formatzeichen (Richtungsumlenkung, unsichtbare Zeichen) und Zeilen-/Absatztrenner
const LINE_BREAKS = /[\r\n\t\p{Zl}\p{Zp}]+/gu;
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/** Text für die Ausgabe: Zeilenumbrüche werden zu Leerzeichen, Steuerzeichen fallen weg, Länge in Code Points begrenzt. */
export function cleanText(value: string, maxChars: number): string {
  const cleaned = value.replace(LINE_BREAKS, " ").replace(INVISIBLE, "");
  const chars = Array.from(cleaned);
  return chars.length > maxChars ? chars.slice(0, maxChars).join("") : cleaned;
}

/**
 * `questionId` aus den gespeicherten Daten (vom Aufrufer des Flows mitgeschickt): technische Namen bestehen nur aus
 * `[a-z0-9_]`, alles andere wird zu `_` und kann so keine Anweisungen oder Zeilenumbrüche transportieren.
 */
export function safeQuestionId(questionId: unknown): string {
  return Array.from(typeof questionId === "string" ? questionId : "")
    .slice(0, QUESTION_ID_MAX_CHARS)
    .map((char) => (/^[A-Za-z0-9_-]$/.test(char) ? char : "_"))
    .join("");
}

/** Zeitpunkt auf die volle Stunde abgerundet (ISO), `null` ohne lesbaren Wert. */
export function toHour(iso: string | undefined): string | null {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(ms) ? null : new Date(Math.floor(ms / HOUR_MS) * HOUR_MS).toISOString();
}

/** Abstand zum Sitzungsstart in ganzen Sekunden, `null` ohne lesbare Werte oder bei Antworten vor dem Start. */
function secondsFromStart(answeredAt: string | undefined, startedAt: string | undefined): number | null {
  const answered = answeredAt ? Date.parse(answeredAt) : Number.NaN;
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (Number.isNaN(answered) || Number.isNaN(started) || answered < started) return null;
  return Math.round((answered - started) / 1000);
}

// ---------------------------------------------------------------------------
// Zeitraum
// ---------------------------------------------------------------------------

export type ResultsRange =
  | { ok: true; fromIso: string; toIso: string }
  | { ok: false; kind: "invalid"; issues: { path: string; message: string }[] }
  | { ok: false; kind: "too_large"; maxMs: number };

/**
 * `from` inklusive, `to` exklusiv (Format `YYYY-MM-DDTHH:mm:ss`, UTC, wie die Kunden-API). `toIso` ist die inklusive
 * Obergrenze für die Abfrage (`to − 1 ms`).
 */
export function parseResultsRange(from: string, to: string, maxRangeMs: number): ResultsRange {
  const parsedFrom = parseDate(from, "from");
  const parsedTo = parseDate(to, "to");
  const issues: { path: string; message: string }[] = [];
  if ("message" in parsedFrom) issues.push({ path: "from", message: parsedFrom.message });
  if ("message" in parsedTo) issues.push({ path: "to", message: parsedTo.message });
  if ("message" in parsedFrom || "message" in parsedTo) return { ok: false, kind: "invalid", issues };
  if (parsedTo.ms <= parsedFrom.ms) return { ok: false, kind: "invalid", issues: [{ path: "to", message: "to must be after from" }] };
  if (parsedTo.ms - parsedFrom.ms > maxRangeMs) return { ok: false, kind: "too_large", maxMs: maxRangeMs };
  return { ok: true, fromIso: new Date(parsedFrom.ms).toISOString(), toIso: new Date(parsedTo.ms - 1).toISOString() };
}

// ---------------------------------------------------------------------------
// Zusammenfassung und Aggregate
// ---------------------------------------------------------------------------

export function toV1ResultsSummary(summary: ExportSummary) {
  return { total: summary.sessions, byStatus: { ...summary.statusCounts }, byVersion: { ...summary.versions }, byChannel: { ...summary.channels } };
}

/** Fragen der Umfrage je `questionId` (technischer Name, derselbe Schlüssel wie im Reporting). */
export interface QuestionIndex {
  /** Fragetitel in der Reihenfolge der Umfrage. */
  titles: Map<string, string>;
  /** Labels der Auswahlfragen über alle Stände: nur diese Werte gelten bei `choice` als strukturiert. */
  choiceLabels: Map<string, Set<string>>;
}

function addChoiceLabels(index: QuestionIndex, key: string, labels: readonly unknown[]): void {
  const known = index.choiceLabels.get(key) ?? new Set<string>();
  for (const label of labels) {
    const value = text(label);
    if (value) known.add(value);
  }
  index.choiceLabels.set(key, known);
}

function collectDraftQuestions(questions: readonly SurveyQuestion[] | undefined, index: QuestionIndex): void {
  for (const question of Array.isArray(questions) ? questions : []) {
    if (!question) continue;
    const key = text(question.name) || text(question.id);
    const title = text(question.title);
    if (key && title && !index.titles.has(key)) index.titles.set(key, title);
    if (key && question.type === "choice" && isChoiceOptions(question.options)) {
      addChoiceLabels(index, key, question.options.labels.map((option: ChoiceOptionLabel) => option?.label));
    }
    for (const followUp of Array.isArray(question.follow_ups) ? question.follow_ups : []) {
      collectDraftQuestions(followUp?.question ? [followUp.question] : [], index);
    }
  }
}

/**
 * Fragetitel und Auswahl-Labels aus Draft und deployten Ständen. Bei den Titeln gilt der Draft zuerst; Fragen, die dort
 * nicht mehr stehen, kommen aus den deployten Ständen. Labels werden über alle Stände gesammelt (Antworten älterer
 * Versionen); Labels von Versionen, die in keinem Stand mehr stehen, kennt der Index nicht, solche Werte gelten als Freitext.
 */
export function collectQuestionIndex(draft: Survey | null, deployed: readonly unknown[], surveyId: string): QuestionIndex {
  const index: QuestionIndex = { titles: new Map(), choiceLabels: new Map() };
  if (draft) collectDraftQuestions(draft.questions, index);
  for (const raw of deployed) {
    const flow = parseProdSurvey(raw, surveyId);
    for (const question of flow?.questions ?? []) {
      const key = text(question.name) || text(question.id);
      const title = text(question.prompt);
      if (key && title && !index.titles.has(key)) index.titles.set(key, title);
      if (key && question.type === "choice") addChoiceLabels(index, key, question.labels);
    }
  }
  return index;
}

/** Passt der Schlüssel einer Verteilung zum Typ? Alles andere (z. B. Freitext unter falschem Typ) fällt weg. */
function isStructuredCountKey(type: string, key: string, labels: ReadonlySet<string> | undefined): boolean {
  if (key === EMPTY_COUNT_KEY) return true;
  if (type === "rating" || type === "nps") return key.trim() !== "" && Number.isFinite(Number(key));
  if (type === "yes_no") return key === "true" || key === "false";
  if (type === "choice") return labels?.has(key) ?? false;
  return false;
}

/**
 * Verteilung nur für strukturierte Typen und nur mit Werten, die zum Typ passen. Unpassende Werte zählen in
 * `otherCount`; bei mehr als `DISTRIBUTION_MAX_KEYS` Werten entfällt die Verteilung ganz (Hinweis auf Freitext).
 */
function toDistribution(
  type: string,
  counts: Record<string, number>,
  labels: ReadonlySet<string> | undefined
): { distribution?: Record<string, number>; otherCount?: number } {
  const merged = new Map<string, number>();
  let other = 0;
  for (const [key, raw] of Object.entries(counts)) {
    const count = Number(raw) || 0;
    if (!isStructuredCountKey(type, key, labels)) {
      other += count;
      continue;
    }
    const clean = cleanText(key, CHOICE_VALUE_MAX_CHARS);
    merged.set(clean, (merged.get(clean) ?? 0) + count);
  }
  const otherCount = other > 0 ? { otherCount: other } : {};
  if (merged.size > DISTRIBUTION_MAX_KEYS) return otherCount;
  const entries = [...merged].sort(([keyA, a], [keyB, b]) => b - a || compareCodeUnits(keyA, keyB));
  return { distribution: Object.fromEntries(entries), ...otherCount };
}

/** Ausgabe von `get_aggregates`: Reihenfolge der Umfrage, danach unbekannte Fragen nach `questionId`. */
export function toV1AggregatesResult(items: readonly SurveyAggregateItem[], index: QuestionIndex) {
  const order = new Map([...index.titles.keys()].map((key, position) => [key, position]));
  const questions = items.map((item) => {
    const aggregate = toV1Aggregate(item);
    const type = safeType(aggregate.questionType);
    const rawId = typeof aggregate.questionId === "string" ? aggregate.questionId : "";
    return {
      questionId: safeQuestionId(rawId),
      title: index.titles.get(rawId) ?? null,
      type,
      count: aggregate.totalResponses,
      ...(aggregate.average !== null ? { average: aggregate.average } : {}),
      ...(aggregate.counts !== null && STRUCTURED_TYPES.has(type) ? toDistribution(type, aggregate.counts, index.choiceLabels.get(rawId)) : {}),
      ...(aggregate.npsScore !== null ? { nps: aggregate.npsScore } : {}),
      sortKey: order.get(rawId) ?? Infinity,
    };
  });
  questions.sort((a, b) => a.sortKey - b.sortKey || compareCodeUnits(a.questionId, b.questionId));
  return { questions: questions.map(({ sortKey: _sortKey, ...question }) => question) };
}

// ---------------------------------------------------------------------------
// Einzelantworten
// ---------------------------------------------------------------------------

export interface ResponseAnswerView {
  questionId: string;
  type: string;
  /** Sekunden seit dem Sitzungsstart statt des genauen Zeitpunkts. */
  secondsFromStart: number | null;
  value?: string | number | boolean | null;
  redacted?: boolean;
  hasText?: boolean;
}

export interface ResponseView {
  responseId: string;
  channel: string;
  status: string | null;
  version: number;
  /** Sitzungsstart, auf die volle Stunde abgerundet. */
  startedHour: string | null;
  answers: ResponseAnswerView[];
}

function freeText(value: unknown): string {
  if (typeof value === "string") return value;
  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

export interface ResponseAnswerOptions {
  allowComments: boolean;
  /** Labels je `questionId` (`collectQuestionIndex`). */
  choiceLabels: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Eine Antwort. Nur strukturierte Typen mit passendem Wert erscheinen unverändert (Zahlen, Wahrheitswerte, bekannte
 * Auswahllabel bereinigt und gekürzt); alles andere ist Freitext: ohne `allowComments` nur `redacted` und `hasText`.
 */
export function toV1ResponseAnswer(record: AnswerRecord, options: ResponseAnswerOptions): ResponseAnswerView {
  const type = safeType(record.questionType);
  const base = {
    questionId: safeQuestionId(record.questionId),
    type,
    secondsFromStart: secondsFromStart(record.answeredAt, record.sessionStartedAt),
  };
  const value = record.value;
  if (STRUCTURED_TYPES.has(type)) {
    if ((type === "rating" || type === "nps") && typeof value === "number" && Number.isFinite(value)) return { ...base, value };
    if (type === "yes_no" && typeof value === "boolean") return { ...base, value };
    // Gleiche Normalisierung wie die Zählung der Aggregate (`normalizeCountKey`)
    if (type === "choice" && typeof value === "string" && options.choiceLabels.get(record.questionId)?.has(value.trim())) {
      return { ...base, value: cleanText(value.trim(), CHOICE_VALUE_MAX_CHARS) };
    }
    if (value === undefined || value === null) return { ...base, value: null };
  }
  const content = freeText(value);
  const hasText = content.trim() !== "";
  if (!options.allowComments) return { ...base, redacted: true, hasText };
  return { ...base, value: cleanText(content, COMMENT_MAX_CHARS), hasText };
}

export interface CursorPosition {
  /** Sitzungsstart (ISO) der letzten ausgegebenen Sitzung, leer ohne Angabe. */
  t: string;
  /** Pseudonym der letzten ausgegebenen Sitzung. */
  p: string;
}

export interface ResponsesFilter {
  fromIso: string;
  toIso: string;
  channel?: string;
  status?: string;
  version?: number;
}

/** Bindet den Cursor an die Abfrage: Mit anderen Filtern oder Zeitraum ist er ungültig. */
export function queryFingerprint(filter: ResponsesFilter): string {
  return JSON.stringify([filter.fromIso, filter.toIso, filter.channel ?? null, filter.status ?? null, filter.version ?? null]);
}

/** Inhalt des Cursors (aus `openCursor`) als Position; `undefined`, wenn die Form nicht stimmt oder die Abfrage abweicht. */
export function readCursorPosition(payload: unknown, fingerprint: string): CursorPosition | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const { t, p, q } = payload as Record<string, unknown>;
  return typeof t === "string" && typeof p === "string" && q === fingerprint ? { t, p } : undefined;
}

export function cursorPayload(position: CursorPosition, fingerprint: string): { t: string; p: string; q: string } {
  return { t: position.t, p: position.p, q: fingerprint };
}

export interface ResponsesPageOptions extends ResponseAnswerOptions {
  keys: PseudonymKeys;
  tenantId: string;
  surveyId: string;
  filter: ResponsesFilter;
  after?: CursorPosition;
  limit: number;
  maxBytes?: number;
}

export interface ResponsesPage {
  responses: ResponseView[];
  /** Position der letzten Sitzung, wenn weitere folgen. */
  next?: CursorPosition;
}

interface Entry {
  pseudonym: string;
  startedAt: string;
  session: ExportSession;
}

function compareEntries(a: Entry, b: Entry): number {
  return compareCodeUnits(a.startedAt, b.startedAt) || compareCodeUnits(a.pseudonym, b.pseudonym);
}

/**
 * Eine Seite Sitzungen: gefiltert nach Kanal und Status, sortiert nach Sitzungsstart und Pseudonym (die Klar-ID
 * bestimmt die Reihenfolge nicht, damit sie nicht in den Cursor muss), nach dem Cursor abgeschnitten.
 * Die Seite endet nach `limit` Sitzungen oder wenn `maxBytes` erreicht wäre (mindestens eine Sitzung).
 */
export function buildResponsesPage(sessions: readonly ExportSession[], options: ResponsesPageOptions): ResponsesPage {
  const { keys, tenantId, surveyId, filter, after, limit } = options;
  const maxBytes = options.maxBytes ?? RESPONSES_MAX_PAGE_BYTES;

  const entries: Entry[] = [];
  for (const session of sessions) {
    if (!session || typeof session.responseId !== "string") continue;
    if (filter.channel !== undefined && (session.channel || DEFAULT_CHANNEL) !== filter.channel) continue;
    if (filter.status !== undefined && (session.status ?? "unknown") !== filter.status) continue;
    entries.push({ pseudonym: pseudonymize(keys, tenantId, surveyId, session.responseId), startedAt: session.startedAt ?? "", session });
  }
  entries.sort(compareEntries);

  const afterEntry = after ? ({ pseudonym: after.p, startedAt: after.t } as Entry) : undefined;
  const start = afterEntry ? entries.findIndex((entry) => compareEntries(entry, afterEntry) > 0) : 0;
  const rest = start < 0 ? [] : entries.slice(start);

  const responses: ResponseView[] = [];
  let bytes = 0;
  let taken = 0;
  for (const entry of rest) {
    if (taken >= limit) break;
    const { session } = entry;
    const view: ResponseView = {
      responseId: entry.pseudonym,
      channel: session.channel || DEFAULT_CHANNEL,
      status: session.status ?? null,
      version: sessionVersion(session),
      startedHour: toHour(session.startedAt),
      answers: sessionToAnswerRecords(session).map((record) => toV1ResponseAnswer(record, options)),
    };
    const size = Buffer.byteLength(JSON.stringify(view), "utf8");
    if (taken > 0 && bytes + size > maxBytes) break;
    responses.push(view);
    bytes += size;
    taken += 1;
  }

  const last = rest[taken - 1];
  return taken < rest.length && last ? { responses, next: { t: last.startedAt, p: last.pseudonym } } : { responses };
}
