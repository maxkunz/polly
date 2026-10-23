import { CONDITION_PLACEHOLDER_VALUES } from "../../../src/domain/survey/flowTypes";
import type { FlowCondition, FlowQuestion, FlowSurvey } from "../../../src/domain/survey/flowTypes";
import type { WebThemeTokens } from "../../../src/domain/webTheme/webTheme";
import { compareCodeUnits } from "../shared/answer_records";
import { surveyLanguageOf, surveyVersionOf, text } from "../shared/web_survey_format";

/**
 * Versionsschicht v1 von `GET /ext/v1/surveys` und `GET /ext/v1/surveys/{surveyId}`: feste Feldabbildung.
 * Rein (ohne AWS-SDK). Das interne Flow-JSON wird nie durchgereicht; jedes Feld steht einzeln in
 * `toV1SurveySummary`, `toV1SurveyDetail` und `toV1Question`.
 */

/**
 * Bedingung, mit der der Translator eine fehlende Verzweigung für Architect auffüllt (unerfüllbar, ohne Folgefrage).
 * Sie ist ein internes Detail und erscheint in v1 nicht.
 */
export function isPlaceholderCondition(condition: FlowCondition): boolean {
  return condition.next_question_id === null && CONDITION_PLACEHOLDER_VALUES[condition.operator] === condition.value;
}

/** Zerlegt den intern mit `"; "` getrennten Synonym-String einer Option. */
export function splitSynonyms(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(";")
    .map((synonym) => synonym.trim())
    .filter(Boolean);
}

function labelOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function toV1Conditions(conditions: readonly FlowCondition[]) {
  return conditions
    .filter((condition) => !isPlaceholderCondition(condition))
    .map((condition) => ({
      operator: condition.operator,
      value: condition.value,
      nextQuestionId: condition.next_question_id,
    }));
}

/** `questionId` ist der technische Name, derselbe Schlüssel wie im Reporting (`buildStoredAnswers`). */
export function toV1Question(question: FlowQuestion) {
  const base = {
    id: question.id,
    questionId: question.name || question.id,
    type: question.type,
    text: text(question.prompt),
    description: text(question.description),
    reprompt: text(question.reprompt),
    mandatory: question.mandatory === true,
    defaultNextQuestionId: question.default_next_question_id ?? null,
  };

  switch (question.type) {
    case "yes_no":
      return {
        ...base,
        yesNextQuestionId: question.options.yes_next_question_id ?? null,
        noNextQuestionId: question.options.no_next_question_id ?? null,
      };
    case "choice":
      return {
        ...base,
        options: question.labels.map((label, index) => ({
          label,
          synonyms: splitSynonyms(question.synonyms?.[index]),
          nextQuestionId: question.next_question_ids[index] ?? null,
        })),
      };
    case "rating":
      return {
        ...base,
        scale: {
          min: question.options.min_value,
          max: question.options.max_value,
          values: Array.isArray(question.options.values) ? [...question.options.values] : [],
          minLabel: labelOrNull(question.options.min_label),
          maxLabel: labelOrNull(question.options.max_label),
        },
        conditions: toV1Conditions(question.conditional_next_question),
      };
    case "nps":
      return {
        ...base,
        scale: {
          min: 0,
          max: 10,
          minLabel: labelOrNull(question.options?.min_label),
          maxLabel: labelOrNull(question.options?.max_label),
        },
        conditions: toV1Conditions(question.conditional_next_question),
      };
    default:
      return base;
  }
}

export function toV1SurveySummary(survey: FlowSurvey) {
  return {
    surveyId: survey.id,
    name: text(survey.name),
    title: text(survey.title),
    description: text(survey.description),
    version: surveyVersionOf(survey),
    updatedAt: survey.updated_at ?? null,
    language: surveyLanguageOf(survey),
  };
}

/** `baseUrl` aus dem Draft und `webTheme` (Tokens aus `pickTheme`) sind `null`, wenn es sie nicht gibt. */
export function toV1SurveyDetail(survey: FlowSurvey, baseUrl: string | undefined, webTheme: WebThemeTokens | undefined) {
  return {
    ...toV1SurveySummary(survey),
    greeting: text(survey.greeting_prompt),
    closing: text(survey.closing_prompt),
    startQuestionId: survey.start_question_id ?? null,
    baseUrl: baseUrl ?? null,
    webTheme: webTheme ?? null,
    questions: survey.questions.map(toV1Question),
  };
}

/**
 * Liste nach Titel und ID sortiert, damit die Reihenfolge nicht vom Zeilenabruf aus Genesys abhängt.
 * Code Units statt Collation, damit sie auch nicht von der Laufzeitumgebung abhängt.
 */
export function buildV1ListResponse(surveys: readonly FlowSurvey[]) {
  const sorted = [...surveys].sort((a, b) => compareCodeUnits(text(a.title), text(b.title)) || compareCodeUnits(a.id, b.id));
  return { surveys: sorted.map(toV1SurveySummary) };
}
