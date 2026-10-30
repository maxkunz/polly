import { CONDITION_OPERATOR_ORDER, CONDITION_PLACEHOLDER_VALUES } from "./flowTypes";
import type {
	ConditionOperator,
	FlowCondition,
	FlowQuestion,
	FlowQuestionBase,
	FlowRatingQuestion,
	FlowSurvey,
	FlowYesNoQuestion,
	ScaleLabels
} from "./flowTypes";
import type { FollowUpRule, Survey, SurveyQuestion } from "./surveyTypes";
import { isChoiceOptions, isRatingOptions } from "./surveyTypes";

/**
 * Wandelt den Baum aus Haupt- und Folgefragen des Editor-Formats (siehe
 * `documentation/survey_definition.md`) in die flache, verkettete Struktur um,
 * die der Genesys Architect Flow benötigt (siehe
 * `documentation/survey_translator_for_flow.md`).
 *
 * Aliasfrei und ohne i18n, damit auch die Lambdas (MCP) es nutzen können. Das Frontend
 * verwendet den Adapter `services/surveyFlowTranslator.ts`, der die Fehler übersetzt.
 */

/**
 * Fehler beim Übersetzen. `key` ist ein Schlüssel unter `translator.*` in den Sprachdateien,
 * `question` die betroffene Frage (Name und ID), falls der Fehler an einer Frage hängt.
 */
export class FlowTranslationError extends Error {
	readonly key: string;
	readonly params: Record<string, unknown>;
	readonly question?: { id: string; name: string };

	constructor(key: string, params: Record<string, unknown> = {}, question?: SurveyQuestion) {
		const context = question?.name ?? question?.id;
		super(context ? `${key} (${context})` : key);
		this.name = "FlowTranslationError";
		this.key = key;
		this.params = params;
		if (question) this.question = { id: question.id, name: question.name };
	}
}

const SYNONYM_SEPARATOR = "; ";


function buildBaseQuestion(question: SurveyQuestion, defaultNextQuestionId: string | null): FlowQuestionBase {
	return {
		id: question.id,
		name: question.name,
		type: question.type,
		prompt: question.title,
		description: question.description ?? "",
		reprompt: question.reprompt_message ?? "",
		mandatory: question.mandatory ?? false,
		default_next_question_id: defaultNextQuestionId
	};
}

function toBoolean(value: boolean | string | number, question: SurveyQuestion): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	throw new FlowTranslationError(
		"yesNoInvalidValue",
		{ value: JSON.stringify(value) },
		question
	);
}

function requireEqualsOperator(question: SurveyQuestion, operator: ConditionOperator): void {
	if (operator !== "equals") {
		throw new FlowTranslationError(
			"equalsOnly",
			{ type: question.type },
			question
		);
	}
}

function buildYesNoOptions(
	question: SurveyQuestion,
	followUps: FollowUpRule[]
): FlowYesNoQuestion["options"] {
	let yesNextQuestionId: string | null = null;
	let noNextQuestionId: string | null = null;
	let yesSet = false;
	let noSet = false;

	for (const followUp of followUps) {
		requireEqualsOperator(question, followUp.condition.operator);
		const isYes = toBoolean(followUp.condition.value, question);

		if (isYes) {
			if (yesSet) {
				throw new FlowTranslationError(
					"duplicateYesNo",
					{ value: "true" },
					question
				);
			}
			yesNextQuestionId = followUp.question.id;
			yesSet = true;
		} else {
			if (noSet) {
				throw new FlowTranslationError(
					"duplicateYesNo",
					{ value: "false" },
					question
				);
			}
			noNextQuestionId = followUp.question.id;
			noSet = true;
		}
	}

	return {
		yes_next_question_id: yesNextQuestionId,
		no_next_question_id: noNextQuestionId
	};
}

function buildChoiceFields(
	question: SurveyQuestion,
	followUps: FollowUpRule[]
): { labels: string[]; synonyms: string[]; next_question_ids: (string | null)[] } {
	if (!isChoiceOptions(question.options)) {
		throw new FlowTranslationError(
			"choiceOptionsMissing",
			{},
			question
		);
	}

	const labelIds = question.options.labels.map(label => label.id);
	const labels = question.options.labels.map(label => label.label);
	const synonyms = question.options.labels.map(label => (label.synonyms ?? []).join(SYNONYM_SEPARATOR));
	const nextQuestionIds: (string | null)[] = new Array(labelIds.length).fill(null);
	const usedLabelIds = new Set<string>();

	for (const followUp of followUps) {
		requireEqualsOperator(question, followUp.condition.operator);
		const labelId = String(followUp.condition.value);
		const index = labelIds.indexOf(labelId);

		if (index === -1) {
			throw new FlowTranslationError(
				"unknownLabelId",
				{ labelId },
				question
			);
		}
		if (usedLabelIds.has(labelId)) {
			throw new FlowTranslationError(
				"duplicateChoice",
				{ labelId },
				question
			);
		}
		usedLabelIds.add(labelId);
		nextQuestionIds[index] = followUp.question.id;
	}

	return { labels, synonyms, next_question_ids: nextQuestionIds };
}

function buildRatingOptions(question: SurveyQuestion): FlowRatingQuestion["options"] {
	if (!isRatingOptions(question.options)) {
		throw new FlowTranslationError(
			"ratingOptionsMissing",
			{},
			question
		);
	}

	const { min_value, max_value } = question.options;
	const values: number[] = [];
	for (let value = min_value; value <= max_value; value++) {
		values.push(value);
	}

	return { values, min_value, max_value, ...buildScaleLabels(question.options) };
}

/** Min/Max-Labels für das Flow-JSON: nur gesetzte (nicht leere) Labels werden übernommen. */
function buildScaleLabels(options: unknown): ScaleLabels {
	const { min_label, max_label } = (options ?? {}) as ScaleLabels;
	return {
		...(min_label?.trim() ? { min_label } : {}),
		...(max_label?.trim() ? { max_label } : {})
	};
}

function buildConditionalNextQuestion(
	question: SurveyQuestion,
	followUps: FollowUpRule[]
): FlowCondition[] {
	const byOperator = new Map<ConditionOperator, FlowCondition>();

	for (const followUp of followUps) {
		const operator = followUp.condition.operator;
		if (byOperator.has(operator)) {
			throw new FlowTranslationError(
				"duplicateOperator",
				{ operator },
				question
			);
		}

		const numericValue = Number(followUp.condition.value);
		if (Number.isNaN(numericValue)) {
			throw new FlowTranslationError(
				"valueNotNumeric",
				{ value: String(followUp.condition.value) },
				question
			);
		}

		byOperator.set(operator, {
			operator,
			value: numericValue,
			next_question_id: followUp.question.id
		});
	}

	return CONDITION_OPERATOR_ORDER.map(operator => {
		const existing = byOperator.get(operator);
		if (existing) {
			return existing;
		}
		return {
			operator,
			value: CONDITION_PLACEHOLDER_VALUES[operator],
			next_question_id: null
		};
	});
}

/**
 * Flacht eine Frage (und rekursiv alle ihre Folgefragen) in `out` ab.
 *
 * `continuationId` ist die Frage, die im Flow-Ablauf kommt, nachdem `question`
 * und alle ihre Folgefragen abgearbeitet sind. Sie wird als
 * `default_next_question_id` gesetzt und an jede Folgefrage weitergereicht,
 * damit der Ablauf nach einer Folgefrage dort weitergeht, wo die Elternfrage
 * ohne Folgefrage weitergemacht hätte.
 */
function flattenQuestion(
	question: SurveyQuestion,
	continuationId: string | null,
	out: FlowQuestion[]
): void {
	const followUps = question.follow_ups ?? [];
	const base = buildBaseQuestion(question, continuationId);

	switch (question.type) {
		case "comment": {
			if (followUps.length > 0) {
				throw new FlowTranslationError(
					"commentNoFollowUps",
					{},
					question
				);
			}
			out.push({ ...base, type: "comment" });
			break;
		}
		case "yes_no": {
			const options = buildYesNoOptions(question, followUps);
			out.push({ ...base, type: "yes_no", options });
			break;
		}
		case "choice": {
			const { labels, synonyms, next_question_ids } = buildChoiceFields(question, followUps);
			out.push({ ...base, type: "choice", labels, synonyms, next_question_ids });
			break;
		}
		case "rating": {
			const options = buildRatingOptions(question);
			const conditional_next_question = buildConditionalNextQuestion(question, followUps);
			out.push({ ...base, type: "rating", options, conditional_next_question });
			break;
		}
		case "nps": {
			const conditional_next_question = buildConditionalNextQuestion(question, followUps);
			const labels = buildScaleLabels(question.options);
			const options = Object.keys(labels).length > 0 ? { options: labels } : {};
			out.push({ ...base, type: "nps", ...options, conditional_next_question });
			break;
		}
		default: {
			throw new FlowTranslationError(
				"unknownType",
				{ type: question.type },
				question
			);
		}
	}

	for (const followUp of followUps) {
		flattenQuestion(followUp.question, continuationId, out);
	}
}

/**
 * Wandelt ein Survey-Objekt (Baum-Struktur des Editors) in das für den Genesys
 * Survey Flow optimierte Format (flache, verkettete Struktur) um.
 */
export function translateSurveyObject(survey: Survey): FlowSurvey {
	if (!survey || !Array.isArray(survey.questions) || survey.questions.length === 0) {
		throw new FlowTranslationError("noQuestions");
	}

	const mainQuestions = survey.questions;
	const questions: FlowQuestion[] = [];

	for (let i = 0; i < mainQuestions.length; i++) {
		const continuationId = i + 1 < mainQuestions.length ? mainQuestions[i + 1].id : null;
		flattenQuestion(mainQuestions[i], continuationId, questions);
	}

	return {
		id: survey.id,
		name: survey.name,
		title: survey.title,
		description: survey.description ?? "",
		greeting_prompt: survey.greeting_message ?? "",
		closing_prompt: survey.closing_message ?? "",
		...(survey.language ? { language: survey.language } : {}),
		// Nur für die Lambda web_survey (Wahl des Designs); Architect ignoriert das Feld
		...(survey.web_theme_id ? { web_theme_id: survey.web_theme_id } : {}),
		created_at: survey.created_at,
		updated_at: survey.updated_at,
		start_question_id: mainQuestions[0].id,
		version: survey.version,
		type: "Flow",
		questions
	};
}

/**
 * Übersetzt den Draft-Inhalt (als JSON-String oder Objekt) in den Flow-optimierten JSON-Payload
 * für das Deployment nach Stage und Prod.
 *
 * Wirft `FlowTranslationError`, falls der Draft leer, syntaktisch ungültig
 * oder inhaltlich nicht in die Flow-Struktur übersetzbar ist. Der Aufruf soll
 * das Deployment in diesem Fall abbrechen, statt einen unvollständigen oder
 * rohen Payload zu speichern.
 *
 * @param draft JSON-String oder Survey-Objekt aus dem Draft-Feld
 * @returns Serialisierter JSON-String für Data Table Stage / Prod
 */
export function translateSurveyForFlow(
	draft: Survey | string | Record<string, any>
): string {
	if (!draft) {
		throw new FlowTranslationError("emptyDraft");
	}

	let surveyObj: Survey;
	if (typeof draft === "string") {
		try {
			surveyObj = JSON.parse(draft);
		} catch (error) {
			throw new FlowTranslationError("invalidJson", { error: (error as Error).message });
		}
	} else {
		surveyObj = draft as Survey;
	}

	const translated = translateSurveyObject(surveyObj);
	return JSON.stringify(translated);
}
