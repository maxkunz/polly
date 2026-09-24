import type {
	ConditionOperator,
	FollowUpRule,
	QuestionType,
	Survey,
	SurveyQuestion
} from "@/domain/survey/surveyTypes";
import { isChoiceOptions, isRatingOptions } from "@/domain/survey/surveyTypes";

/**
 * Wandelt den Baum aus Haupt- und Folgefragen des Editor-Formats (siehe
 * `documentation/survey_definition.md`) in die flache, verkettete Struktur um,
 * die der Genesys Architect Flow benötigt (siehe
 * `documentation/survey_translator_for_flow.md`).
 */

export class SurveyFlowTranslationError extends Error {
	constructor(message: string, questionId?: string, questionName?: string) {
		const context = questionName ?? questionId;
		super(context ? `${message} (Frage: ${context})` : message);
		this.name = "SurveyFlowTranslationError";
	}
}

export interface FlowCondition {
	operator: ConditionOperator;
	value: number;
	next_question_id: string | null;
}

interface FlowQuestionBase {
	id: string;
	name: string;
	type: QuestionType;
	prompt: string;
	description: string;
	reprompt: string;
	mandatory: boolean;
	default_next_question_id: string | null;
}

export interface FlowCommentQuestion extends FlowQuestionBase {
	type: "comment";
}

export interface FlowYesNoQuestion extends FlowQuestionBase {
	type: "yes_no";
	options: {
		yes_next_question_id: string | null;
		no_next_question_id: string | null;
	};
}

export interface FlowChoiceQuestion extends FlowQuestionBase {
	type: "choice";
	labels: string[];
	next_question_ids: (string | null)[];
}

export interface FlowRatingQuestion extends FlowQuestionBase {
	type: "rating";
	options: {
		values: number[];
		min_value: number;
		max_value: number;
	};
	conditional_next_question: FlowCondition[];
}

export interface FlowNpsQuestion extends FlowQuestionBase {
	type: "nps";
	conditional_next_question: FlowCondition[];
}

export type FlowQuestion =
	| FlowCommentQuestion
	| FlowYesNoQuestion
	| FlowChoiceQuestion
	| FlowRatingQuestion
	| FlowNpsQuestion;

export interface FlowSurvey {
	id: string;
	name: string;
	title: string;
	description: string;
	greeting_prompt: string;
	closing_prompt: string;
	created_at?: string;
	updated_at?: string;
	start_question_id: string | null;
	version?: number;
	type: "Flow";
	questions: FlowQuestion[];
}

const CONDITIONAL_OPERATOR_ORDER: ConditionOperator[] = ["equals", "less_than", "greater_than"];

const CONDITIONAL_PLACEHOLDER_VALUE: Record<ConditionOperator, number> = {
	equals: -1,
	less_than: -1000,
	greater_than: 1000
};

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
	throw new SurveyFlowTranslationError(
		`Ungültiger Bedingungswert für Fragetyp yes_no: ${JSON.stringify(value)}`,
		question.id,
		question.name
	);
}

function requireEqualsOperator(question: SurveyQuestion, operator: ConditionOperator): void {
	if (operator !== "equals") {
		throw new SurveyFlowTranslationError(
			`Fragetyp ${question.type} erlaubt nur den Operator "equals"`,
			question.id,
			question.name
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
				throw new SurveyFlowTranslationError(
					`Mehrfache Folgefrage für die Bedingung "true"`,
					question.id,
					question.name
				);
			}
			yesNextQuestionId = followUp.question.id;
			yesSet = true;
		} else {
			if (noSet) {
				throw new SurveyFlowTranslationError(
					`Mehrfache Folgefrage für die Bedingung "false"`,
					question.id,
					question.name
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
): { labels: string[]; next_question_ids: (string | null)[] } {
	if (!isChoiceOptions(question.options)) {
		throw new SurveyFlowTranslationError(
			`Fragetyp choice benötigt options.labels`,
			question.id,
			question.name
		);
	}

	const labelIds = question.options.labels.map(label => label.id);
	const labels = question.options.labels.map(label => label.label);
	const nextQuestionIds: (string | null)[] = new Array(labelIds.length).fill(null);
	const usedLabelIds = new Set<string>();

	for (const followUp of followUps) {
		requireEqualsOperator(question, followUp.condition.operator);
		const labelId = String(followUp.condition.value);
		const index = labelIds.indexOf(labelId);

		if (index === -1) {
			throw new SurveyFlowTranslationError(
				`Unbekannte Label-ID "${labelId}" in einer Folgefrage-Bedingung`,
				question.id,
				question.name
			);
		}
		if (usedLabelIds.has(labelId)) {
			throw new SurveyFlowTranslationError(
				`Mehrfache Folgefrage für dieselbe Auswahlmöglichkeit "${labelId}"`,
				question.id,
				question.name
			);
		}
		usedLabelIds.add(labelId);
		nextQuestionIds[index] = followUp.question.id;
	}

	return { labels, next_question_ids: nextQuestionIds };
}

function buildRatingOptions(question: SurveyQuestion): FlowRatingQuestion["options"] {
	if (!isRatingOptions(question.options)) {
		throw new SurveyFlowTranslationError(
			`Fragetyp rating benötigt options.min_value/max_value`,
			question.id,
			question.name
		);
	}

	const { min_value, max_value } = question.options;
	const values: number[] = [];
	for (let value = min_value; value <= max_value; value++) {
		values.push(value);
	}

	return { values, min_value, max_value };
}

function buildConditionalNextQuestion(
	question: SurveyQuestion,
	followUps: FollowUpRule[]
): FlowCondition[] {
	const byOperator = new Map<ConditionOperator, FlowCondition>();

	for (const followUp of followUps) {
		const operator = followUp.condition.operator;
		if (byOperator.has(operator)) {
			throw new SurveyFlowTranslationError(
				`Operator "${operator}" ist bei den Folgefragen mehrfach vorhanden`,
				question.id,
				question.name
			);
		}

		const numericValue = Number(followUp.condition.value);
		if (Number.isNaN(numericValue)) {
			throw new SurveyFlowTranslationError(
				`Bedingungswert "${followUp.condition.value}" ist nicht numerisch`,
				question.id,
				question.name
			);
		}

		byOperator.set(operator, {
			operator,
			value: numericValue,
			next_question_id: followUp.question.id
		});
	}

	return CONDITIONAL_OPERATOR_ORDER.map(operator => {
		const existing = byOperator.get(operator);
		if (existing) {
			return existing;
		}
		return {
			operator,
			value: CONDITIONAL_PLACEHOLDER_VALUE[operator],
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
				throw new SurveyFlowTranslationError(
					`Fragetyp comment darf keine Folgefragen haben`,
					question.id,
					question.name
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
			const { labels, next_question_ids } = buildChoiceFields(question, followUps);
			out.push({ ...base, type: "choice", labels, next_question_ids });
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
			out.push({ ...base, type: "nps", conditional_next_question });
			break;
		}
		default: {
			throw new SurveyFlowTranslationError(
				`Unbekannter Fragetyp "${question.type}"`,
				question.id,
				question.name
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
		throw new SurveyFlowTranslationError("Survey enthält keine Fragen");
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
 * Wirft `SurveyFlowTranslationError`, falls der Draft leer, syntaktisch ungültig
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
		throw new SurveyFlowTranslationError("Survey-Entwurf ist leer, Deployment abgebrochen");
	}

	let surveyObj: Survey;
	if (typeof draft === "string") {
		try {
			surveyObj = JSON.parse(draft);
		} catch (error) {
			throw new SurveyFlowTranslationError(
				`Survey-Entwurf konnte nicht als JSON gelesen werden: ${(error as Error).message}`
			);
		}
	} else {
		surveyObj = draft as Survey;
	}

	const translated = translateSurveyObject(surveyObj);
	return JSON.stringify(translated);
}
