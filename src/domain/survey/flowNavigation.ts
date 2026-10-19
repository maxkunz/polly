import { CONDITION_OPERATOR_ORDER, NPS_SCALE_MAX, NPS_SCALE_MIN, WEB_COMMENT_MAX_CHARS } from "./flowTypes";
import type { FlowCondition, FlowQuestion, FlowSurvey } from "./flowTypes";

/**
 * Navigation im Flow-JSON (Prod-Stand) für den Web-Kanal, siehe `documentation/polly_web.md`.
 * Wird von der Umfrageseite (welche Fragen werden angezeigt) und von der Lambda `web_survey`
 * (Prüfung beim Absenden) genutzt.
 *
 * Importiert nur `flowTypes.ts` (aliasfrei, siehe Hinweis dort); `test/flowNavigation.test.ts` prüft das.
 *
 * Regeln wie im Architect-Flow (`documentation/survey_translator_for_flow.md`):
 * - Verweis `null` (keine Folgefrage für diese Antwort) ⇒ weiter mit `default_next_question_id`.
 * - rating/nps: Es gewinnt die erste zutreffende Bedingung in der Reihenfolge `equals`,
 *   `less_than`, `greater_than`; die Vergleiche sind strikt.
 * - Unbeantwortete oder ungültige Antworten ⇒ weiter mit `default_next_question_id`.
 */

/**
 * Antworten der Umfrageseite: Frage-ID → Wert. Die Werte kommen vom Client und sind ungeprüft;
 * die exportierten Funktionen nehmen deshalb `unknown` und prüfen auch den Container selbst.
 */
export type FlowAnswers = Record<string, unknown>;

export type FlowAnswerErrorCode =
	/** Pflichtfrage ist erreichbar, aber nicht beantwortet. */
	| "required"
	/** Wert passt nicht zum Fragetyp (Bereich, Label, Typ, Länge). */
	| "invalid_value"
	/** Frage existiert, ist mit den gegebenen Antworten aber nicht erreichbar. */
	| "not_reachable"
	/** Frage-ID gibt es in der Umfrage nicht. */
	| "unknown_question"
	/** `answers` ist kein einfaches Objekt (z. B. `null`, Array, Text). */
	| "invalid_answers";

export interface FlowAnswerError {
	/** `null` bei `invalid_answers` (betrifft keine einzelne Frage). */
	questionId: string | null;
	code: FlowAnswerErrorCode;
}

/** Nur einfache Objekte gelten als Antworten; `null`, Arrays und Primitive nicht. */
export function isFlowAnswers(value: unknown): value is FlowAnswers {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function answerOf(answers: FlowAnswers, questionId: string): unknown {
	return Object.hasOwn(answers, questionId) ? answers[questionId] : undefined;
}

/** `undefined`, `null` und leere bzw. nur aus Leerzeichen bestehende Texte gelten als nicht beantwortet. */
export function isAnswered(value: unknown): boolean {
	if (value === undefined || value === null) {
		return false;
	}
	return typeof value !== "string" || value.trim() !== "";
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** Prüft einen (beantworteten) Wert gegen den Fragetyp. */
export function isAnswerValueValid(question: FlowQuestion, value: unknown): boolean {
	switch (question.type) {
		case "rating":
			return isIntegerInRange(value, question.options.min_value, question.options.max_value);
		case "nps":
			return isIntegerInRange(value, NPS_SCALE_MIN, NPS_SCALE_MAX);
		case "choice":
			return typeof value === "string" && question.labels.includes(value);
		case "yes_no":
			return typeof value === "boolean";
		case "comment":
			return typeof value === "string" && value.length <= WEB_COMMENT_MAX_CHARS;
		default:
			return false;
	}
}

function conditionMatches(condition: FlowCondition, value: number): boolean {
	switch (condition.operator) {
		case "equals":
			return value === condition.value;
		case "less_than":
			return value < condition.value;
		case "greater_than":
			return value > condition.value;
		default:
			return false;
	}
}

function findMatchingCondition(conditions: FlowCondition[], value: number): FlowCondition | undefined {
	for (const operator of CONDITION_OPERATOR_ORDER) {
		const match = conditions.find(condition => condition.operator === operator && conditionMatches(condition, value));
		if (match) {
			return match;
		}
	}
	return undefined;
}

/** ID der Frage, die nach `question` mit der Antwort `value` folgt; `null` = Ende der Umfrage. */
export function getNextQuestionId(question: FlowQuestion, value: unknown): string | null {
	const fallback = question.default_next_question_id;
	if (!isAnswered(value) || !isAnswerValueValid(question, value)) {
		return fallback;
	}

	switch (question.type) {
		case "yes_no":
			return (value ? question.options.yes_next_question_id : question.options.no_next_question_id) ?? fallback;
		case "choice":
			return question.next_question_ids[question.labels.indexOf(value as string)] ?? fallback;
		case "rating":
		case "nps":
			return findMatchingCondition(question.conditional_next_question, value as number)?.next_question_id ?? fallback;
		default:
			return fallback;
	}
}

/**
 * Erreichbare Fragen in Ablaufreihenfolge (= Anzeigereihenfolge: Folgefragen direkt nach ihrer
 * Elternfrage). Bei einem defekten Flow-JSON (unbekannte ID, Zyklus) endet die Liste dort.
 * Sind `answers` kein Objekt, zählen alle Fragen als unbeantwortet.
 */
export function getReachableQuestions(survey: FlowSurvey, answers: unknown): FlowQuestion[] {
	const given: FlowAnswers = isFlowAnswers(answers) ? answers : {};
	const byId = new Map(survey.questions.map(question => [question.id, question]));
	const reachable: FlowQuestion[] = [];
	const visited = new Set<string>();
	let currentId = survey.start_question_id;

	while (currentId !== null) {
		const question = byId.get(currentId);
		if (!question || visited.has(currentId)) {
			break;
		}
		visited.add(currentId);
		reachable.push(question);
		currentId = getNextQuestionId(question, answerOf(given, question.id));
	}

	return reachable;
}

/**
 * Prüft die Antworten gegen das Flow-JSON: Pflichtangaben und Werte der erreichbaren Fragen
 * (in Anzeigereihenfolge), danach Antworten auf nicht erreichbare oder unbekannte Fragen.
 * Leere Antworten (`null`, `""`) auf nicht erreichbare Fragen werden toleriert.
 * Ist `answers` kein einfaches Objekt, gibt es nur den Fehler `invalid_answers`.
 */
export function validateFlowAnswers(survey: FlowSurvey, answers: unknown): FlowAnswerError[] {
	if (!isFlowAnswers(answers)) {
		return [{ questionId: null, code: "invalid_answers" }];
	}
	const errors: FlowAnswerError[] = [];
	const reachable = getReachableQuestions(survey, answers);
	const reachableIds = new Set(reachable.map(question => question.id));
	const knownIds = new Set(survey.questions.map(question => question.id));

	for (const question of reachable) {
		const value = answerOf(answers, question.id);
		if (!isAnswered(value)) {
			if (question.mandatory) {
				errors.push({ questionId: question.id, code: "required" });
			}
		} else if (!isAnswerValueValid(question, value)) {
			errors.push({ questionId: question.id, code: "invalid_value" });
		}
	}

	for (const [questionId, value] of Object.entries(answers)) {
		if (reachableIds.has(questionId) || !isAnswered(value)) {
			continue;
		}
		errors.push({ questionId, code: knownIds.has(questionId) ? "not_reachable" : "unknown_question" });
	}

	return errors;
}

/**
 * Behält nur beantwortete, gültige Antworten auf erreichbare Fragen. Der Ablauf ändert sich
 * dadurch nicht, weil ungültige Antworten bei der Navigation ohnehin als unbeantwortet zählen.
 *
 * Genutzt, um Antworten weggefallener Folgefragen zu verwerfen, Antworten nach einer
 * zwischenzeitlich geänderten Umfrage (`409 survey_changed`) zu übernehmen und die zu
 * speichernden Antworten im Backend zu bestimmen. Sind `answers` kein Objekt, ist das Ergebnis leer.
 */
export function pruneFlowAnswers(survey: FlowSurvey, answers: unknown): FlowAnswers {
	const pruned: FlowAnswers = {};
	if (!isFlowAnswers(answers)) {
		return pruned;
	}
	for (const question of getReachableQuestions(survey, answers)) {
		const value = answerOf(answers, question.id);
		if (isAnswered(value) && isAnswerValueValid(question, value)) {
			pruned[question.id] = value;
		}
	}
	return pruned;
}
