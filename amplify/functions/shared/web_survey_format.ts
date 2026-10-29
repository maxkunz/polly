import { DEFAULT_SURVEY_LANGUAGE, SURVEY_LANGUAGES } from "../../../src/domain/survey/flowTypes";
import type { FlowQuestion, FlowSurvey, SurveyLanguage } from "../../../src/domain/survey/flowTypes";
import type { FlowAnswers } from "../../../src/domain/survey/flowNavigation";
import type { WebQuestion, WebSurvey } from "../../../src/domain/survey/webSurveyTypes";

/**
 * Reine Funktionen des Web-Kanals ohne AWS-Abhängigkeiten (testbar, siehe `test/webSurveyBackend.test.ts`):
 * Prod-Zelle der Data Table lesen, Flow-JSON für die öffentliche Seite bereinigen und das
 * Antwort-Item im Format von `SurveyResponsesTable` aufbauen.
 */

const QUESTION_TYPES = new Set(["yes_no", "choice", "rating", "nps", "comment"]);

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function hasConditions(question: Record<string, any>): boolean {
  return Array.isArray(question.conditional_next_question)
    && question.conditional_next_question.every((condition: unknown) =>
      isRecord(condition)
      && typeof condition.operator === "string"
      && typeof condition.value === "number"
      && isNullableString(condition.next_question_id));
}

/**
 * Prüft die Felder, auf die Navigation und Seite zugreifen. Die Zelle kommt aus einer Data Table, die
 * auch in Genesys direkt bearbeitet werden kann; eine kaputte Frage soll nicht zu einem Absturz führen.
 */
function isFlowQuestionShape(question: unknown): question is FlowQuestion {
  if (!isRecord(question)) return false;
  if (typeof question.id !== "string" || !QUESTION_TYPES.has(question.type)) return false;
  if (!isNullableString(question.default_next_question_id)) return false;

  switch (question.type) {
    case "yes_no":
      return isRecord(question.options)
        && isNullableString(question.options.yes_next_question_id ?? null)
        && isNullableString(question.options.no_next_question_id ?? null);
    case "choice":
      return Array.isArray(question.labels)
        && question.labels.every((label: unknown) => typeof label === "string")
        && Array.isArray(question.next_question_ids);
    case "rating":
      return isRecord(question.options)
        && typeof question.options.min_value === "number"
        && typeof question.options.max_value === "number"
        && hasConditions(question);
    case "nps":
      return (question.options === undefined || isRecord(question.options)) && hasConditions(question);
    default:
      return true;
  }
}

/**
 * Liest den Prod-Stand aus der Zelle `Prod` der Zeile `survey_<id>`. `null`, wenn kein Prod-Stand
 * vorhanden ist (leere Zelle, `"{}"`), das JSON kaputt ist oder die ID nicht zur Einladung passt.
 */
export function parseProdSurvey(raw: unknown, surveyId: string): FlowSurvey | null {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed)) return null;
  if (parsed.id !== surveyId || !Array.isArray(parsed.questions) || parsed.questions.length === 0) return null;
  if (!isNullableString(parsed.start_question_id)) return null;
  if (!parsed.questions.every(isFlowQuestionShape)) return null;
  return parsed as unknown as FlowSurvey;
}

/** Version des Prod-Stands; ältere Stände ohne Zahl gelten als Version 0. */
export function surveyVersionOf(survey: FlowSurvey): number {
  return Number.isInteger(survey.version) ? (survey.version as number) : 0;
}

/** `language` des Prod-Stands; fehlt sie (ältere Stände) oder ist sie unbekannt, gilt ausdrücklich `de`. */
export function surveyLanguageOf(survey: FlowSurvey): SurveyLanguage {
  const language = survey.language;
  return (SURVEY_LANGUAGES as readonly string[]).includes(language ?? "")
    ? (language as SurveyLanguage)
    : DEFAULT_SURVEY_LANGUAGE;
}

/** Text eines optionalen Felds, `""` bei fehlendem oder falschem Typ. */
export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toWebQuestion(question: FlowQuestion): WebQuestion {
  const base = {
    id: question.id,
    prompt: text(question.prompt),
    description: text(question.description),
    mandatory: question.mandatory === true,
    default_next_question_id: question.default_next_question_id ?? null,
  };

  switch (question.type) {
    case "yes_no":
      return {
        ...base,
        type: "yes_no",
        options: {
          yes_next_question_id: question.options.yes_next_question_id ?? null,
          no_next_question_id: question.options.no_next_question_id ?? null,
        },
      };
    case "choice":
      return { ...base, type: "choice", labels: [...question.labels], next_question_ids: [...question.next_question_ids] };
    case "rating": {
      const { values, min_value, max_value, min_label, max_label } = question.options;
      return {
        ...base,
        type: "rating",
        options: {
          values: Array.isArray(values) ? [...values] : [],
          min_value,
          max_value,
          ...(min_label ? { min_label } : {}),
          ...(max_label ? { max_label } : {}),
        },
        conditional_next_question: question.conditional_next_question.map((condition) => ({ ...condition })),
      };
    }
    case "nps": {
      const minLabel = question.options?.min_label;
      const maxLabel = question.options?.max_label;
      return {
        ...base,
        type: "nps",
        ...(minLabel || maxLabel
          ? { options: { ...(minLabel ? { min_label: minLabel } : {}), ...(maxLabel ? { max_label: maxLabel } : {}) } }
          : {}),
        conditional_next_question: question.conditional_next_question.map((condition) => ({ ...condition })),
      };
    }
    default:
      return { ...base, type: "comment" };
  }
}

/**
 * Flow-JSON für die öffentliche Seite: nur die Felder, die die Seite anzeigt oder zur Navigation braucht
 * (Whitelist). `name`, `reprompt`, `synonyms` und Zeitstempel bleiben im Backend.
 */
export function toWebSurvey(survey: FlowSurvey): WebSurvey {
  return {
    id: survey.id,
    title: text(survey.title),
    description: text(survey.description),
    greeting_prompt: text(survey.greeting_prompt),
    closing_prompt: text(survey.closing_prompt),
    language: surveyLanguageOf(survey),
    start_question_id: survey.start_question_id ?? null,
    version: surveyVersionOf(survey),
    questions: survey.questions.map(toWebQuestion),
  };
}

export interface StoredAnswer {
  type: string;
  value: unknown;
  answeredAt: string;
}

/**
 * Antworten im Format der Architect-Sitzungen: Schlüssel ist der technische Fragename (`name`,
 * Reporting-Schlüssel), nicht die Frage-ID. Erwartet bereits geprüfte und bereinigte Antworten
 * (`pruneFlowAnswers`); Antworten auf unbekannte Fragen werden ignoriert.
 */
export function buildStoredAnswers(survey: FlowSurvey, answers: FlowAnswers, now: string): Record<string, StoredAnswer> {
  const stored: Record<string, StoredAnswer> = {};
  for (const question of survey.questions) {
    if (!Object.hasOwn(answers, question.id)) continue;
    const key = question.name || question.id;
    stored[key] = { type: question.type, value: answers[question.id], answeredAt: now };
  }
  return stored;
}
