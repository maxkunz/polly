import { randomUUID } from "node:crypto";
import { SURVEY_LOCK_TTL_MINUTES } from "../../../src/constants/surveyConstants";
import {
  checkSurveyLockConflict,
  isSurveyLockOwnedBy,
  parseSurveyLock,
  surveyLockExpiresAtMs,
  type SurveyLockData,
  type SurveyLockVia,
} from "../../../src/domain/survey/surveyLock";
import {
  EMPTY_SURVEY_LOCK,
  SURVEY_LIST_ROW_KEY,
  buildSurveyListPayload,
  buildSurveyRowPayload,
  parseSurveyDraft,
  readFieldVersion,
  surveyRowKey,
  withSurveyListItem,
  type SurveyListItem,
  type SurveyRowPatch,
} from "../../../src/domain/survey/surveyRow";
import type { Survey } from "../../../src/domain/survey/surveyTypes";
import { DataTableWriteError, addRow, getRow, putRow } from "./genesys_datatable";
import { GENESYS_REQUEST_TIMEOUT_MS } from "./http";
import { isValidSurveyId } from "./survey_id";
import {
  checkDeployable,
  prepareDraft,
  type SurveyStoreError,
  type SurveyStoreErrorCode,
  type SurveyWarning,
} from "./survey_pipeline";
import { isSurveyBeingDeleted } from "./survey_results";
import type { TenantCredentials } from "./tenant_auth";

/**
 * Server-Spiegel von `src/services/surveyService.ts` für MCP: Umfragen anlegen, Draft speichern, deployen,
 * zurückrollen und das Umfrage-Lock nehmen bzw. freigeben (Regeln siehe documentation/polly_mcp.md Abschnitte 5 und 7).
 *
 * Gelesen und geschrieben wird mit dem Genesys-Token der Person (Genesys-Rechte und -Audit gelten), geschrieben
 * nur in die Umfrage-Data-Table des Mandanten (Allow-List in `genesys_datatable.ts`). Jede Änderung liest die Zeile
 * frisch und schreibt sie ganz (`updateSurveyRow`). Die Data Table kennt kein Compare-and-Swap: Zwischen Lesen und
 * Schreiben bleibt ein kurzes Zeitfenster; die Versionsprüfungen verhindern, dass Änderungen unbemerkt verloren gehen.
 *
 * Alle Funktionen liefern `StoreResult`, Fehler als Codes (`SurveyStoreErrorCode`), nie als Text.
 */

export interface SurveyStoreContext {
  tenantId: string;
  /** Region und Umfrage-Data-Table des Mandanten (aus `TenantsTable`, nie aus der Eingabe). */
  credentials: Pick<TenantCredentials, "region" | "surveyDataTableId">;
  /** Genesys-Token der Person. */
  token: string;
  /** Genesys-Name der Person, steht im Lock (wie in der App). */
  userName: string;
  /** Standard `isSurveyBeingDeleted` (DynamoDB); in Tests ersetzbar. */
  isBeingDeleted?: (tenantId: string, surveyId: string) => Promise<boolean>;
  /** Standard `new Date()`; in Tests ersetzbar. Gilt für Zeitstempel und Lock-Ablauf. */
  now?: () => Date;
  /**
   * Ende des Zeitbudgets (ms seit Epoch, echte Uhr): Danach startet keine Wiederholung nach 429 und keine
   * Index-Pflege mehr. Standard: Beginn der Operation + `OPERATION_BUDGET_MS`.
   */
  deadline?: number;
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: SurveyStoreError };

/** Optionen der Validierungs-Pipeline, die die Schnittstelle aus `__meta` bzw. den Web-Designs ermittelt. */
export interface SurveyWriteOptions {
  webSurvey: boolean;
  knownThemeIds?: ReadonlySet<string>;
}

export type DeployTarget = "Stage" | "Prod";

export type { SurveyListItem };

/**
 * Zeitbudget einer Operation. Lesen und der erste Schreibversuch dauern je höchstens `GENESYS_REQUEST_TIMEOUT_MS`;
 * Wiederholungen und Index-Pflege nur, solange sie vor Ablauf fertig werden. So bleibt alles unter dem 30-s-Limit
 * von API Gateway, und die KI erhält kein 504 für einen schon geschriebenen Draft.
 */
const OPERATION_BUDGET_MS = 24_000;

/** Abbruch innerhalb einer Änderung; `run` macht daraus das Ergebnis. */
class SurveyStoreFailure extends Error {
  constructor(readonly error: SurveyStoreError) {
    super(error.code);
    this.name = "SurveyStoreFailure";
  }
}

function fail(code: SurveyStoreErrorCode, details?: Record<string, unknown>): never {
  throw new SurveyStoreFailure(details ? { code, details } : { code });
}

function upstreamError(status?: number): SurveyStoreError {
  if (status === undefined) return { code: "upstream_error" };
  return { code: "upstream_error", details: { status, ...(status === 429 ? { throttled: true } : {}) } };
}

function upstream(status?: number): never {
  throw new SurveyStoreFailure(upstreamError(status));
}

/** Führt eine Operation aus; `body` erhält das Ende des Zeitbudgets für die Schreibzugriffe. */
async function run<T>(ctx: SurveyStoreContext, operation: string, body: (deadline: number) => Promise<T>): Promise<StoreResult<T>> {
  const deadline = ctx.deadline ?? Date.now() + OPERATION_BUDGET_MS;
  try {
    return { ok: true, value: await body(deadline) };
  } catch (err: any) {
    if (err instanceof SurveyStoreFailure) return { ok: false, error: err.error };
    // Nur Code und Status loggen, keine Inhalte der Umfrage
    console.error("[survey_store] operation failed", {
      tenantId: ctx.tenantId,
      operation,
      error: err instanceof DataTableWriteError ? err.code : err?.name,
      status: err?.status,
    });
    return { ok: false, error: upstreamError(typeof err?.status === "number" ? err.status : undefined) };
  }
}

function now(ctx: SurveyStoreContext): Date {
  return ctx.now?.() ?? new Date();
}

function nowIso(ctx: SurveyStoreContext): string {
  return now(ctx).toISOString();
}

async function readRow(ctx: SurveyStoreContext, rowKey: string): Promise<{ status: number; body?: any }> {
  return getRow(ctx.credentials.region, ctx.token, ctx.credentials.surveyDataTableId, rowKey);
}

async function assertNotDeleting(ctx: SurveyStoreContext, surveyId: string): Promise<void> {
  if (!isValidSurveyId(surveyId)) fail("not_found");
  if (await (ctx.isBeingDeleted ?? isSurveyBeingDeleted)(ctx.tenantId, surveyId)) fail("not_found");
}

// ---------------------------------------------------------------------------
// Lock-Entscheidungen
// ---------------------------------------------------------------------------

/** Ablauf des Locks (ISO) oder `undefined`, wenn `locked_since` fehlt bzw. unlesbar ist. */
export function lockExpiresAt(lock: SurveyLockData): string | undefined {
  const expiresAt = surveyLockExpiresAtMs(lock);
  return expiresAt === null ? undefined : new Date(expiresAt).toISOString();
}

/** Details zu einem fremden Lock; `via` fehlt bei älteren Locks und gilt dann als App. */
export function lockDetails(lock: SurveyLockData): Record<string, unknown> {
  const expiresAt = lockExpiresAt(lock);
  return { lockedBy: lock.locked_by, since: lock.locked_since, ...(expiresAt ? { expiresAt } : {}), via: lock.via ?? "ui" };
}

/** Fremdes, gültiges Lock → `survey_locked` (begin_edit, deploy, rollback). */
function assertNoForeignLock(ctx: SurveyStoreContext, row: Record<string, any>): SurveyLockData {
  const lock = parseSurveyLock(row.lock);
  if (checkSurveyLockConflict(lock, ctx.userName, SURVEY_LOCK_TTL_MINUTES, now(ctx).getTime()).hasConflict) {
    fail("survey_locked", lockDetails(lock));
  }
  return lock;
}

/**
 * Speichern nur mit eigenem Lock. Ein abgelaufenes eigenes Lock zählt noch: Hätte jemand anderes die Umfrage
 * seitdem geöffnet, stünde dessen Name im Lock. Fehlt das Lock oder gehört es anderen → `lock_lost`.
 */
function assertOwnLock(row: Record<string, any>, userName: string): void {
  const lock = parseSurveyLock(row.lock);
  if (isSurveyLockOwnedBy(lock, userName)) return;
  fail("lock_lost", lock.locked_by ? lockDetails(lock) : {});
}

function mcpLock(ctx: SurveyStoreContext, since: string): SurveyLockData & { via: SurveyLockVia } {
  return { locked_by: ctx.userName.trim(), locked_since: since, via: "mcp" };
}

// ---------------------------------------------------------------------------
// Zeilen lesen und schreiben
// ---------------------------------------------------------------------------

async function fetchSurveyRow(ctx: SurveyStoreContext, surveyId: string): Promise<Record<string, any>> {
  const res = await readRow(ctx, surveyRowKey(surveyId));
  if (res.status === 404) fail("not_found");
  if (res.status !== 200) upstream(res.status);
  return res.body ?? {};
}

/**
 * Ändert die Zeile `survey_<id>` auf Basis ihres aktuellen Stands: frisch lesen, `change` anwenden, ganze Zeile
 * schreiben. `change` liefert die Felder, `null` für „nichts schreiben“, oder bricht über `fail` ab.
 */
async function updateSurveyRow(
  ctx: SurveyStoreContext,
  surveyId: string,
  deadline: number,
  change: (currentRow: Record<string, any>) => SurveyRowPatch | null
): Promise<Record<string, any>> {
  const currentRow = await fetchSurveyRow(ctx, surveyId);
  const patch = change(currentRow);
  if (!patch) return currentRow;
  const payload = buildSurveyRowPayload(surveyId, currentRow, patch);
  await putRow(ctx.credentials, ctx.token, surveyRowKey(surveyId), payload, { deadline });
  return { ...currentRow, ...payload };
}

/**
 * Umfrage-Index (Zeile `survey_list`, Liste im Feld `Draft`). Nur eine fehlende Zeile gilt als leere Liste;
 * jeder andere Fehler wird geworfen, sonst würde eine unvollständige Liste zurückgeschrieben.
 */
async function fetchSurveyList(ctx: SurveyStoreContext): Promise<{ items: SurveyListItem[]; row: Record<string, any> | null }> {
  const res = await readRow(ctx, SURVEY_LIST_ROW_KEY);
  if (res.status === 404) return { items: [], row: null };
  if (res.status !== 200) upstream(res.status);
  const row = res.body ?? {};
  if (!row.Draft) return { items: [], row };
  let items: unknown;
  try {
    items = typeof row.Draft === "string" ? JSON.parse(row.Draft) : row.Draft;
  } catch {
    upstream();
  }
  if (!Array.isArray(items)) upstream();
  return { items: items as SurveyListItem[], row };
}

/** Trägt die Umfrage mit ihrem Titel in `survey_list` ein bzw. aktualisiert ihn (wie `syncSurveyInList` der App). */
async function syncSurveyInList(ctx: SurveyStoreContext, survey: Survey, deadline: number): Promise<void> {
  const { items, row } = await fetchSurveyList(ctx);
  const title = survey.title?.trim() || survey.name?.trim() || survey.id;
  const updated = withSurveyListItem(items, { id: survey.id, title });
  if (!updated) return;

  const payload = buildSurveyListPayload(updated, row);
  if (row) await putRow(ctx.credentials, ctx.token, SURVEY_LIST_ROW_KEY, payload, { deadline });
  else await addRow(ctx.credentials, ctx.token, payload, { deadline });
}

/**
 * Der Draft ist schon geschrieben, wenn der Index scheitert. Kein Fehler, damit die KI nicht erneut anlegt;
 * die Warnung sagt, dass die Umfrage in der App-Übersicht erst nach dem nächsten Speichern erscheint.
 * Reicht das Zeitbudget nicht mehr für Lesen und Schreiben des Index, wird er gar nicht erst angefasst.
 */
async function syncSurveyInListWithWarning(ctx: SurveyStoreContext, survey: Survey, deadline: number): Promise<SurveyWarning[]> {
  if (Date.now() + 2 * GENESYS_REQUEST_TIMEOUT_MS > deadline) {
    console.error("[survey_store] survey_list not updated", { tenantId: ctx.tenantId, surveyId: survey.id, error: "time_budget" });
    return [{ code: "survey_list_not_updated" }];
  }
  try {
    await syncSurveyInList(ctx, survey, deadline);
    return [];
  } catch (err: any) {
    console.error("[survey_store] survey_list not updated", {
      tenantId: ctx.tenantId,
      surveyId: survey.id,
      error: err instanceof SurveyStoreFailure ? err.error.code : err?.name,
      status: err?.status,
    });
    return [{ code: "survey_list_not_updated" }];
  }
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export interface SurveyRowView {
  surveyId: string;
  /** Rohe Zellen (JSON-Strings) wie in der Data Table. */
  row: Record<string, any>;
  draft: Survey | null;
  lock: SurveyLockData;
  versions: { draft: number | null; stage: number | null; prod: number | null; backup: number | null };
}

/** Zeile `survey_<id>` mit geparstem Draft, Lock und Versionen. */
export function readSurveyRow(ctx: SurveyStoreContext, surveyId: string): Promise<StoreResult<SurveyRowView>> {
  return run(ctx, "read", async () => {
    await assertNotDeleting(ctx, surveyId);
    const row = await fetchSurveyRow(ctx, surveyId);
    return {
      surveyId,
      row,
      draft: parseSurveyDraft(row.Draft),
      lock: parseSurveyLock(row.lock),
      versions: {
        draft: readFieldVersion(row.Draft),
        stage: readFieldVersion(row.Stage),
        prod: readFieldVersion(row.Prod),
        backup: readFieldVersion(row.Backup),
      },
    };
  });
}

/** Umfrage-Index aus `survey_list`. */
export function readSurveyList(ctx: SurveyStoreContext): Promise<StoreResult<SurveyListItem[]>> {
  return run(ctx, "list", async () => (await fetchSurveyList(ctx)).items);
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/** Neue Umfrage: ID und technische Namen vergibt der Server, geschrieben wird nur eine fehlerfreie Umfrage (ohne Lock). */
export function createSurvey(
  ctx: SurveyStoreContext,
  input: Survey,
  options: SurveyWriteOptions
): Promise<StoreResult<{ surveyId: string; version: number; warnings: SurveyWarning[] }>> {
  return run(ctx, "create", async (deadline) => {
    const surveyId = randomUUID();
    const prepared = prepareDraft(input, { ...options, surveyId, saved: null, version: 1, now: nowIso(ctx) });
    if (!prepared.ok) fail(prepared.error.code, prepared.error.details);
    const payload = buildSurveyRowPayload(surveyId, null, { Draft: JSON.stringify(prepared.survey), lock: EMPTY_SURVEY_LOCK });
    await addRow(ctx.credentials, ctx.token, payload, { deadline });
    const listWarnings = await syncSurveyInListWithWarning(ctx, prepared.survey, deadline);
    return { surveyId, version: 1, warnings: [...prepared.warnings, ...listWarnings] };
  });
}

/** Lock nehmen bzw. ein eigenes verlängern; ein fremdes, gültiges Lock ergibt `survey_locked`. */
export function beginEdit(
  ctx: SurveyStoreContext,
  surveyId: string
): Promise<StoreResult<{ surveyId: string; draftVersion: number | null; expiresAt: string }>> {
  return run(ctx, "begin_edit", async (deadline) => {
    await assertNotDeleting(ctx, surveyId);
    const lock = mcpLock(ctx, nowIso(ctx));
    const row = await updateSurveyRow(ctx, surveyId, deadline, (currentRow) => {
      assertNoForeignLock(ctx, currentRow);
      return { lock: JSON.stringify(lock) };
    });
    return { surveyId, draftVersion: readFieldVersion(row.Draft), expiresAt: lockExpiresAt(lock)! };
  });
}

/**
 * Draft speichern: eigenes Lock und `expectedDraftVersion` nötig, dann die Pipeline. Das Lock wird verlängert,
 * bei `release` freigegeben. Die neue Version zählt von der gespeicherten aus weiter.
 */
export function saveDraft(
  ctx: SurveyStoreContext,
  surveyId: string,
  input: Survey,
  expectedDraftVersion: number | null,
  options: SurveyWriteOptions & { release?: boolean }
): Promise<StoreResult<{ surveyId: string; version: number; warnings: SurveyWarning[]; lockExpiresAt?: string }>> {
  return run(ctx, "save_draft", async (deadline) => {
    await assertNotDeleting(ctx, surveyId);
    const now = nowIso(ctx);
    const lock = mcpLock(ctx, now);
    let saved: { survey: Survey; warnings: SurveyWarning[] } | undefined;
    await updateSurveyRow(ctx, surveyId, deadline, (currentRow) => {
      assertOwnLock(currentRow, ctx.userName);
      const currentVersion = readFieldVersion(currentRow.Draft);
      if (currentVersion !== expectedDraftVersion) fail("draft_conflict", { current: currentVersion });
      const prepared = prepareDraft(input, {
        webSurvey: options.webSurvey,
        knownThemeIds: options.knownThemeIds,
        surveyId,
        saved: parseSurveyDraft(currentRow.Draft),
        version: (currentVersion ?? 0) + 1,
        now,
      });
      if (!prepared.ok) fail(prepared.error.code, prepared.error.details);
      saved = { survey: prepared.survey, warnings: prepared.warnings };
      return { Draft: JSON.stringify(prepared.survey), lock: options.release ? EMPTY_SURVEY_LOCK : JSON.stringify(lock) };
    });
    const { survey, warnings } = saved!;
    const listWarnings = await syncSurveyInListWithWarning(ctx, survey, deadline);
    return {
      surveyId,
      version: survey.version!,
      warnings: [...warnings, ...listWarnings],
      ...(options.release ? {} : { lockExpiresAt: lockExpiresAt(lock)! }),
    };
  });
}

/** Gibt nur das eigene Lock frei; `released: false`, wenn es keines gab oder es anderen gehört. */
export function endEdit(ctx: SurveyStoreContext, surveyId: string): Promise<StoreResult<{ surveyId: string; released: boolean }>> {
  return run(ctx, "end_edit", async (deadline) => {
    if (!isValidSurveyId(surveyId)) fail("not_found");
    let released = false;
    await updateSurveyRow(ctx, surveyId, deadline, (currentRow) => {
      if (!isSurveyLockOwnedBy(parseSurveyLock(currentRow.lock), ctx.userName)) return null;
      released = true;
      return { lock: EMPTY_SURVEY_LOCK };
    });
    return { surveyId, released };
  });
}

/**
 * Deployt den gespeicherten Draft nach Stage oder Prod (Prod sichert vorher Prod → Backup). Abbruch bei fremdem
 * Lock, abweichender Draft-Version, gleicher Version in Prod, Prüffehlern oder zu großem Flow-JSON.
 * Das Lock bleibt unverändert.
 */
export function deploySurvey(
  ctx: SurveyStoreContext,
  surveyId: string,
  target: DeployTarget,
  expectedDraftVersion: number,
  options: { webSurvey: boolean }
): Promise<StoreResult<{ surveyId: string; target: DeployTarget; deployedVersion: number; warnings: SurveyWarning[] }>> {
  return run(ctx, "deploy", async (deadline) => {
    await assertNotDeleting(ctx, surveyId);
    let warnings: SurveyWarning[] = [];
    await updateSurveyRow(ctx, surveyId, deadline, (currentRow) => {
      assertNoForeignLock(ctx, currentRow);
      const draftVersion = readFieldVersion(currentRow.Draft);
      if (draftVersion !== expectedDraftVersion) fail("draft_conflict", { current: draftVersion });
      // Gleiche Version nicht erneut nach Prod, sonst überschriebe das Backup die Vorgängerversion
      if (target === "Prod" && draftVersion === readFieldVersion(currentRow.Prod)) fail("already_in_prod", { version: draftVersion });

      const draft = parseSurveyDraft(currentRow.Draft);
      if (!draft) fail("draft_conflict", { current: null });
      const checked = checkDeployable(draft, options);
      if (!checked.ok) fail(checked.error.code, checked.error.details);
      warnings = checked.warnings;
      return target === "Stage" ? { Stage: checked.flowJson } : { Backup: currentRow.Prod ?? "{}", Prod: checked.flowJson };
    });
    return { surveyId, target, deployedVersion: expectedDraftVersion, warnings };
  });
}

/** Stellt Backup auf Prod wieder her. Abbruch bei fremdem Lock, abweichender Prod-Version oder ohne Backup. */
export function rollbackSurvey(
  ctx: SurveyStoreContext,
  surveyId: string,
  expectedProdVersion: number | null
): Promise<StoreResult<{ surveyId: string; prodVersion: number }>> {
  return run(ctx, "rollback", async (deadline) => {
    await assertNotDeleting(ctx, surveyId);
    let prodVersion = 0;
    await updateSurveyRow(ctx, surveyId, deadline, (currentRow) => {
      assertNoForeignLock(ctx, currentRow);
      const currentProd = readFieldVersion(currentRow.Prod);
      if (currentProd !== expectedProdVersion) fail("prod_conflict", { current: currentProd });
      const backupVersion = readFieldVersion(currentRow.Backup);
      if (backupVersion === null) fail("no_backup");
      prodVersion = backupVersion;
      return { Prod: currentRow.Backup };
    });
    return { surveyId, prodVersion };
  });
}
