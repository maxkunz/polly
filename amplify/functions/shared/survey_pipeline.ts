import { randomUUID } from "node:crypto";
import { evaluateFlowPayloadSize, type FlowPayloadSize } from "../../../src/domain/survey/flowPayload";
import { FlowTranslationError, translateSurveyForFlow } from "../../../src/domain/survey/flowTranslator";
import { surveyRules } from "../../../src/domain/survey/surveyRules";
import {
  collectTechnicalNames,
  ensureSurveyTechnicalNames,
  isChoiceOptions,
  resetWebSettings,
  type Survey,
  type SurveyQuestion,
} from "../../../src/domain/survey/surveyTypes";
import { DEFAULT_SURVEY_LANGUAGE } from "../../../src/domain/survey/flowTypes";
import { isValidSurveyId } from "./survey_id";

/**
 * Validierungs-Pipeline für Umfragen, die das Backend schreibt (MCP, siehe documentation/polly_mcp.md Abschnitt 7).
 * Rein, ohne AWS-SDK und ohne Data-Table-Zugriff; `survey_store.ts` ruft sie mit dem frisch gelesenen Draft auf.
 *
 * Nicht enthalten ist Schritt 1 (Größe, Strukturprüfung, Whitelist-Kopie): Das macht die Schnittstelle (zod in
 * `mcp/tools_v1.ts`). Hier kommt bereits ein Objekt in der Form von `Survey` an; es wird nicht verändert.
 *
 * Fehler und Warnungen sind Codes mit strukturierten `details`, keine Texte.
 */

export type SurveyStoreErrorCode =
  | "not_found"
  | "invalid_id"
  | "validation_failed"
  | "theme_unknown"
  | "survey_locked"
  | "lock_lost"
  | "draft_conflict"
  | "prod_conflict"
  | "already_in_prod"
  | "no_backup"
  | "payload_too_large"
  | "upstream_error";

export interface SurveyStoreError {
  code: SurveyStoreErrorCode;
  details?: Record<string, unknown>;
}

export type SurveyWarningCode =
  | "name_immutable_ignored"
  | "web_settings_reset"
  | "payload_budget_75"
  | "payload_budget_exceeded"
  | "survey_list_not_updated";

export interface SurveyWarning {
  code: SurveyWarningCode;
  details?: Record<string, unknown>;
}

/** Befund der Prüfregeln ohne die nur für den Editor gedachten Felder (`fieldId`, `shownByField`). */
export interface SurveyIssue {
  field: string;
  code: string;
  params: Record<string, unknown>;
  questionId?: string;
}

export interface PrepareDraftOptions {
  /** ID der Umfrage: neu vergeben (`createSurvey`) oder aus der Zeile. */
  surveyId: string;
  /** Gespeicherter Draft (frisch gelesen) oder `null` bei einer neuen Umfrage. */
  saved: Survey | null;
  /** Version, die der neue Draft bekommt. */
  version: number;
  /** Feature Flag `web_survey` der Installation. */
  webSurvey: boolean;
  /** Web-Designs des Mandanten; nur mit `webSurvey` geprüft und nur, wenn angegeben. */
  knownThemeIds?: ReadonlySet<string>;
  /** Zeitstempel (ISO) für `updated_at` und bei neuen Umfragen `created_at`. */
  now: string;
}

export type PrepareDraftResult =
  | { ok: true; survey: Survey; warnings: SurveyWarning[]; payloadSize: FlowPayloadSize }
  | { ok: false; error: SurveyStoreError };

export type DeployCheckResult =
  | { ok: true; flowJson: string; warnings: SurveyWarning[]; payloadSize: FlowPayloadSize }
  | { ok: false; error: SurveyStoreError };

type QuestionVisit = (question: SurveyQuestion, path: string) => void;

function visitQuestion(question: SurveyQuestion, path: string, visit: QuestionVisit): void {
  if (!question || typeof question !== "object") return;
  visit(question, path);
  (Array.isArray(question.follow_ups) ? question.follow_ups : []).forEach((followUp, fuIndex) => {
    if (followUp?.question) visitQuestion(followUp.question, `${path}.follow_ups[${fuIndex}].question`, visit);
  });
}

/** Haupt- und Folgefragen mit Pfad (`questions[0].follow_ups[1].question`). */
function visitQuestions(questions: SurveyQuestion[] | undefined, path: string, visit: QuestionVisit): void {
  (Array.isArray(questions) ? questions : []).forEach((question, index) => visitQuestion(question, `${path}[${index}]`, visit));
}

/** Alle IDs (Fragen, Folgefragen, Auswahloptionen) einer gespeicherten Fassung. */
function collectIds(survey: Survey | null): Set<string> {
  const ids = new Set<string>();
  if (!survey) return ids;
  visitQuestions(survey.questions, "questions", (question) => {
    if (typeof question.id === "string") ids.add(question.id);
    if (isChoiceOptions(question.options)) {
      for (const label of question.options.labels) if (typeof label?.id === "string") ids.add(label.id);
    }
  });
  return ids;
}

/**
 * Schritt 3: IDs von Fragen und Auswahloptionen. Fehlende vergibt der Server. Vorhandene müssen UUIDs sein
 * (ältere Fassungen dürfen ihre gespeicherten IDs behalten) und über die ganze Umfrage eindeutig, auch gegenüber
 * der Umfrage-ID (Umfrage und Fragen teilen sich die Zuordnung der technischen Namen).
 * Ändert `survey`; liefert bei Verstoß den Pfad.
 */
function assignIds(survey: Survey, savedIds: ReadonlySet<string>): SurveyStoreError | undefined {
  const seen = new Set<string>([survey.id]);
  let error: SurveyStoreError | undefined;
  const check = (target: { id?: unknown }, path: string) => {
    if (error) return;
    if (target.id === undefined || target.id === null || target.id === "") {
      target.id = randomUUID();
    } else if (typeof target.id !== "string" || !(isValidSurveyId(target.id) || savedIds.has(target.id))) {
      error = { code: "invalid_id", details: { path: `${path}.id`, reason: "not_uuid" } };
      return;
    }
    const id = target.id as string;
    if (seen.has(id)) {
      error = { code: "invalid_id", details: { path: `${path}.id`, reason: "duplicate" } };
      return;
    }
    seen.add(id);
  };
  visitQuestions(survey.questions, "questions", (question, path) => {
    check(question, path);
    if (isChoiceOptions(question.options)) {
      question.options.labels.forEach((label, index) => {
        if (label && typeof label === "object") check(label, `${path}.options.labels[${index}]`);
      });
    }
  });
  return error;
}

/**
 * Schritt 4: Gespeicherte technische Namen bleiben (Reporting-Schlüssel), neue entstehen aus Titel und ID –
 * auch wenn die Eingabe einen Namen vorgibt. Jede Abweichung der Eingabe ergibt `name_immutable_ignored`.
 */
function applyTechnicalNames(survey: Survey, saved: Survey | null): SurveyWarning[] {
  const savedNames = collectTechnicalNames(saved);
  const requested = new Map<string, { path: string; name: string }>();
  const take = (element: { id: string; name?: unknown }, path: string) => {
    const name = typeof element.name === "string" ? element.name.trim() : "";
    if (name) requested.set(element.id, { path, name });
    if (!savedNames.has(element.id)) element.name = "";
  };
  take(survey, "survey");
  visitQuestions(survey.questions, "questions", take);

  ensureSurveyTechnicalNames(survey, savedNames);

  const warnings: SurveyWarning[] = [];
  const compare = (element: { id: string; name: string }) => {
    const wanted = requested.get(element.id);
    if (wanted && wanted.name !== element.name) {
      warnings.push({ code: "name_immutable_ignored", details: { path: `${wanted.path}.name`, id: element.id, name: element.name } });
    }
  };
  compare(survey);
  visitQuestions(survey.questions, "questions", compare);
  return warnings;
}

/** Schritt 5: Web-Felder. Ohne `web_survey` Standardwerte (Warnung nur, wenn sich etwas ändert). */
function applyWebSettings(survey: Survey, options: PrepareDraftOptions): { warning?: SurveyWarning; error?: SurveyStoreError } {
  if (!options.webSurvey) {
    const changed =
      (typeof survey.base_url === "string" && survey.base_url !== "") ||
      (survey.language !== undefined && survey.language !== DEFAULT_SURVEY_LANGUAGE) ||
      survey.web_theme_id !== undefined;
    resetWebSettings(survey);
    return changed ? { warning: { code: "web_settings_reset" } } : {};
  }
  const themeId = survey.web_theme_id;
  if (options.knownThemeIds && typeof themeId === "string" && themeId !== "" && !options.knownThemeIds.has(themeId)) {
    return { error: { code: "theme_unknown", details: { themeId } } };
  }
  return {};
}

function toIssue(issue: ReturnType<typeof surveyRules>[number]): SurveyIssue {
  return { field: issue.field, code: issue.code, params: issue.params, ...(issue.questionId ? { questionId: issue.questionId } : {}) };
}

/**
 * Schritte 6–8: Prüfregeln, Translator-Trockenlauf, Payload-Budget. `deploy`: Budget überschritten ist ein Fehler
 * (`payload_too_large`), sonst nur eine Warnung: `payload_budget_75` ab 75 %, `payload_budget_exceeded` darüber
 * (Speichern geht, Deploy wird gesperrt).
 */
function checkRulesAndPayload(
  survey: Survey,
  webSurvey: boolean,
  deploy: boolean
): { ok: true; flowJson: string; warnings: SurveyWarning[]; payloadSize: FlowPayloadSize } | { ok: false; error: SurveyStoreError } {
  const issues = surveyRules(survey, { webSurvey });
  if (issues.length > 0) return { ok: false, error: { code: "validation_failed", details: { errors: issues.map(toIssue) } } };

  let flowJson: string;
  try {
    flowJson = translateSurveyForFlow(survey);
  } catch (err) {
    if (!(err instanceof FlowTranslationError)) throw err;
    const translation = { key: err.key, params: err.params, ...(err.question ? { questionId: err.question.id } : {}) };
    return { ok: false, error: { code: "validation_failed", details: { errors: [], translation } } };
  }

  const payloadSize = evaluateFlowPayloadSize(flowJson.length);
  if (deploy && payloadSize.level === "exceeded") {
    return { ok: false, error: { code: "payload_too_large", details: { size: payloadSize.length, limit: payloadSize.max } } };
  }
  const details = { size: payloadSize.length, limit: payloadSize.max, percent: payloadSize.percent };
  const warnings: SurveyWarning[] =
    payloadSize.level === "ok"
      ? []
      : [{ code: payloadSize.level === "exceeded" ? "payload_budget_exceeded" : "payload_budget_75", details }];
  return { ok: true, flowJson, warnings, payloadSize };
}

/**
 * Schritte 2–8 für `create_survey`, `save_draft` und `validate_survey`. Liefert eine Kopie mit servergeführten
 * Feldern (`id`, `version`, `created_at`, `updated_at`), IDs und technischen Namen; die Eingabe bleibt unverändert.
 */
export function prepareDraft(input: Survey, options: PrepareDraftOptions): PrepareDraftResult {
  const survey: Survey = JSON.parse(JSON.stringify(input ?? {}));
  if (!Array.isArray(survey.questions)) survey.questions = [];

  // Schritt 2: servergeführte Felder
  survey.id = options.surveyId;
  survey.version = options.version;
  survey.created_at = options.saved?.created_at ?? options.now;
  survey.updated_at = options.now;

  const idError = assignIds(survey, collectIds(options.saved));
  if (idError) return { ok: false, error: idError };

  const warnings = applyTechnicalNames(survey, options.saved);

  const web = applyWebSettings(survey, options);
  if (web.error) return { ok: false, error: web.error };
  if (web.warning) warnings.push(web.warning);

  const checked = checkRulesAndPayload(survey, options.webSurvey, false);
  if (!checked.ok) return checked;
  return { ok: true, survey, warnings: [...warnings, ...checked.warnings], payloadSize: checked.payloadSize };
}

/**
 * Schritte 6–8 auf einem gespeicherten Draft, ohne zu schreiben (`get_survey`): Prüffehler wie beim Speichern,
 * ein zu großes Flow-JSON nur als Warnung.
 */
export function checkDraft(draft: Survey, options: { webSurvey: boolean }): DeployCheckResult {
  return checkRulesAndPayload(draft, options.webSurvey, false);
}

/** Schritte 6–8 auf dem gespeicherten Draft vor dem Deploy; liefert das Flow-JSON für Stage bzw. Prod. */
export function checkDeployable(draft: Survey, options: { webSurvey: boolean }): DeployCheckResult {
  return checkRulesAndPayload(draft, options.webSurvey, true);
}
