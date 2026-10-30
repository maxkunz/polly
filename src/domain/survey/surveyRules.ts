import type { Survey, SurveyQuestion, RatingOptions, ChoiceOptions } from "./surveyTypes";
import { countAllQuestions, isRatingOptions, isChoiceOptions } from "./surveyTypes";
import { SURVEY_LANGUAGES } from "./flowTypes";
import { isWebThemeId } from "../webTheme/webTheme";
import type { ConditionOperator } from "./flowTypes";
import { surveyFieldIds, questionFieldIds } from "./surveyFieldIds";
import { baseUrlError, BASE_URL_MAX_CHARS } from "./invitationLinks";
import {
	TTS_TEXT_MAX_CHARS,
	SURVEY_MAX_QUESTIONS,
	CHOICE_MIN_OPTIONS,
	CHOICE_MAX_OPTIONS,
	RATING_SCALE_MIN,
	RATING_SCALE_MAX,
	SCALE_LABEL_MAX_CHARS,
	BASE_URL_TOKEN_PLACEHOLDER
} from "../../constants/surveyConstants";

/**
 * Prüfregeln für den Draft ohne Vue und i18n, gemeinsam für den Editor (Adapter surveyValidator.ts
 * macht daraus Meldungen) und die Lambdas (MCP). Liefert Codes mit rohen Parametern statt Texten.
 */

/** Schlüssel unter `validation.*` in den Sprachdateien. */
export type SurveyRuleCode =
	| "surveyTitleRequired"
	| "surveyNameRequired"
	| "ttsTextTooLong"
	| "baseUrlTokenCount"
	| "baseUrlInvalid"
	| "baseUrlTooLong"
	| "languageInvalid"
	| "webThemeInvalid"
	| "surveyMinQuestions"
	| "surveyMaxQuestions"
	| "questionTitleRequired"
	| "questionNameRequired"
	| "scaleLabelTooLong"
	| "ratingOptionsInvalid"
	| "ratingMinRange"
	| "ratingMaxRange"
	| "ratingMinLessThanMax"
	| "choiceOptionsInvalid"
	| "choiceMinOptions"
	| "choiceMaxOptions"
	| "choiceOptionEmpty"
	| "choiceOptionDuplicate"
	| "followUpsNotAllowed"
	| "followUpMissing"
	| "followUpOperatorDuplicate"
	| "followUpValueRequired"
	| "followUpValueDuplicate"
	| "followUpsTooDeep";

export interface SurveyRuleIssue {
	field: string;
	code: SurveyRuleCode;
	/**
	 * Parameter der Meldung, Zahlen unformatiert. `labelKey` ist der i18n-Schlüssel der
	 * Feldbezeichnung; der Adapter setzt daraus den Parameter `field`.
	 */
	params: Record<string, unknown>;
	questionId?: string;
	/** DOM-ID des Feldes bzw. Bereichs im Editor (siehe surveyFieldIds) – Ziel für Markierung und Sprung */
	fieldId?: string;
	/** Das Feld zeigt die Meldung bereits selbst an (TTS-Limit in PromptTextarea) und wird nur markiert */
	shownByField?: boolean;
}

/**
 * Liefert für jede Option (Index), deren Label oder eines ihrer Synonyme bereits
 * von einer vorherigen Option verwendet wird, den Index dieser ersten Option.
 * So bleibt jede Bezeichnung (Label oder Synonym) über alle Optionen hinweg
 * eindeutig - sonst wäre eine genannte Antwort nicht mehr eindeutig zuordenbar.
 * Vergleich erfolgt getrimmt und ohne Beachtung der Groß-/Kleinschreibung.
 */
export function findDuplicateChoiceLabels(
	labels: Array<{ label: string; synonyms?: string[] }>
): Map<number, number> {
	const seen = new Map<string, number>();
	const duplicates = new Map<number, number>();
	labels.forEach((opt, idx) => {
		const terms = [opt.label, ...(opt.synonyms ?? [])];
		for (const term of terms) {
			const normalized = term?.trim().toLowerCase();
			if (!normalized) continue;
			const firstIdx = seen.get(normalized);
			if (firstIdx !== undefined) {
				if (firstIdx !== idx && !duplicates.has(idx)) {
					duplicates.set(idx, firstIdx);
				}
			} else {
				seen.set(normalized, idx);
			}
		}
	});
	return duplicates;
}

/**
 * Liefert für jeden Operator, der von mehr als einer Folgefrage verwendet wird,
 * den Index der jeweils ersten Folgefrage mit diesem Operator.
 * Gilt nur für Fragetypen mit mehreren wählbaren Operatoren (rating, nps) -
 * bei yes_no und choice steht ohnehin nur "equals" zur Verfügung.
 */
export function findDuplicateFollowUpOperators(
	parentType: SurveyQuestion["type"],
	followUps: Array<{ condition?: { operator?: ConditionOperator } }>
): Map<number, number> {
	const duplicates = new Map<number, number>();
	if (parentType === "yes_no" || parentType === "choice") {
		return duplicates;
	}
	const seen = new Map<ConditionOperator, number>();
	followUps.forEach((fu, idx) => {
		const operator = fu.condition?.operator;
		if (!operator) return;
		const firstIdx = seen.get(operator);
		if (firstIdx !== undefined) {
			duplicates.set(idx, firstIdx);
		} else {
			seen.set(operator, idx);
		}
	});
	return duplicates;
}

/**
 * Liefert für jeden möglichen Antwortwert, der von mehr als einer Folgefrage als
 * Bedingung (equals) verwendet wird, den Index der jeweils ersten Folgefrage
 * mit diesem Wert. Gilt für choice und yes_no - hier steht zwar nur der Operator
 * "equals" zur Verfügung, jeder mögliche Wert (Option bzw. ja/nein) darf aber
 * trotzdem nur einmal als Folgefragen-Bedingung verwendet werden.
 */
export function findDuplicateFollowUpValues(
	parentType: SurveyQuestion["type"],
	followUps: Array<{ condition?: { value?: unknown } }>
): Map<number, number> {
	const duplicates = new Map<number, number>();
	if (parentType !== "choice" && parentType !== "yes_no") {
		return duplicates;
	}
	const seen = new Map<unknown, number>();
	followUps.forEach((fu, idx) => {
		const value = fu.condition?.value;
		if (value === undefined || value === null || value === "") return;
		const firstIdx = seen.get(value);
		if (firstIdx !== undefined) {
			duplicates.set(idx, firstIdx);
		} else {
			seen.set(value, idx);
		}
	});
	return duplicates;
}

/** true, wenn ein per TTS gesprochener Text das Genesys-Limit pro TTS-Anfrage überschreitet. */
export function isTtsTextTooLong(text: string | null | undefined): boolean {
	return (text?.length ?? 0) > TTS_TEXT_MAX_CHARS;
}

function ttsTooLongIssue(
	text: string | null | undefined,
	field: string,
	labelKey: string,
	fieldId: string,
	questionId?: string
): SurveyRuleIssue | null {
	if (!isTtsTextTooLong(text)) return null;
	return {
		field,
		code: "ttsTextTooLong",
		params: { labelKey, length: text!.length, max: TTS_TEXT_MAX_CHARS },
		questionId,
		fieldId,
		shownByField: true
	};
}

/**
 * Prüft, ob der Bedingungswert einer Folgefrage zum Typ der Elternfrage passt.
 * Sonst scheitert erst der Deploy im Translator (z. B. Option gelöscht, Zahl geleert).
 */
function isFollowUpValueValid(parent: SurveyQuestion, value: unknown): boolean {
	switch (parent.type) {
		case "yes_no":
			return typeof value === "boolean" || value === "true" || value === "false";
		case "choice":
			return isChoiceOptions(parent.options) && parent.options.labels.some(label => label.id === value);
		case "rating":
		case "nps":
			return (
				(typeof value === "number" || (typeof value === "string" && value.trim() !== "")) &&
				Number.isFinite(Number(value))
			);
		default:
			return true;
	}
}

export function questionRules(
	question: SurveyQuestion,
	prefix = ""
): SurveyRuleIssue[] {
	const errors: SurveyRuleIssue[] = [];
	const qField = prefix ? `${prefix}.${question.id}` : question.id;
	const ids = questionFieldIds;

	if (!question.title || !question.title.trim()) {
		errors.push({
			field: `${qField}.title`,
			code: "questionTitleRequired",
			params: {},
			questionId: question.id,
			fieldId: ids.title(question.id)
		});
	}

	// Fragetitel (prompt) und Reprompt werden im Bot Flow per TTS gesprochen
	for (const error of [
		ttsTooLongIssue(question.title, `${qField}.title`, "surveyQuestionFields.title", ids.title(question.id), question.id),
		ttsTooLongIssue(question.reprompt_message, `${qField}.reprompt_message`, "surveyQuestionFields.reprompt", ids.reprompt(question.id), question.id)
	]) {
		if (error) errors.push(error);
	}

	if (!question.name || !question.name.trim()) {
		errors.push({
			field: `${qField}.name`,
			code: "questionNameRequired",
			params: {},
			questionId: question.id,
			fieldId: ids.name(question.id)
		});
	}

	if (question.type === "rating" || question.type === "nps") {
		// Min/Max-Labels werden nur im Web angezeigt (kein TTS), daher nur die Länge begrenzen
		const labels = (question.options ?? {}) as { min_label?: unknown; max_label?: unknown };
		const labelFields = [
			{ key: "min_label", value: labels.min_label, labelKey: "ratingOptions.minLabel", fieldId: ids.minLabel(question.id) },
			{ key: "max_label", value: labels.max_label, labelKey: "ratingOptions.maxLabel", fieldId: ids.maxLabel(question.id) }
		];
		for (const { key, value, labelKey, fieldId } of labelFields) {
			if (typeof value === "string" && value.length > SCALE_LABEL_MAX_CHARS) {
				errors.push({
					field: `${qField}.options.${key}`,
					code: "scaleLabelTooLong",
					params: { labelKey, max: SCALE_LABEL_MAX_CHARS },
					questionId: question.id,
					fieldId
				});
			}
		}
	}

	if (question.type === "rating") {
		if (!isRatingOptions(question.options)) {
			errors.push({
				field: `${qField}.options`,
				code: "ratingOptionsInvalid",
				params: {},
				questionId: question.id,
				fieldId: ids.options(question.id)
			});
		} else {
			const { min_value, max_value } = question.options as RatingOptions;
			const range = { min: RATING_SCALE_MIN, max: RATING_SCALE_MAX };
			if (min_value < RATING_SCALE_MIN || min_value > RATING_SCALE_MAX) {
				errors.push({
					field: `${qField}.options.min_value`,
					code: "ratingMinRange",
					params: range,
					questionId: question.id,
					fieldId: ids.ratingMin(question.id)
				});
			}
			if (max_value < RATING_SCALE_MIN || max_value > RATING_SCALE_MAX) {
				errors.push({
					field: `${qField}.options.max_value`,
					code: "ratingMaxRange",
					params: range,
					questionId: question.id,
					fieldId: ids.ratingMax(question.id)
				});
			}
			if (min_value >= max_value) {
				errors.push({
					field: `${qField}.options.range`,
					code: "ratingMinLessThanMax",
					params: {},
					questionId: question.id,
					fieldId: ids.ratingMin(question.id)
				});
			}
		}
	} else if (question.type === "choice") {
		if (!isChoiceOptions(question.options)) {
			errors.push({
				field: `${qField}.options`,
				code: "choiceOptionsInvalid",
				params: {},
				questionId: question.id,
				fieldId: ids.options(question.id)
			});
		} else {
			const labels = (question.options as ChoiceOptions).labels || [];
			if (labels.length < CHOICE_MIN_OPTIONS) {
				errors.push({
					field: `${qField}.options.labels`,
					code: "choiceMinOptions",
					params: { min: CHOICE_MIN_OPTIONS },
					questionId: question.id,
					fieldId: ids.options(question.id)
				});
			}
			if (labels.length > CHOICE_MAX_OPTIONS) {
				errors.push({
					field: `${qField}.options.labels`,
					code: "choiceMaxOptions",
					params: { max: CHOICE_MAX_OPTIONS },
					questionId: question.id,
					fieldId: ids.options(question.id)
				});
			}
			const duplicates = findDuplicateChoiceLabels(labels);
			labels.forEach((opt, idx) => {
				if (!opt.label || !opt.label.trim()) {
					errors.push({
						field: `${qField}.options.labels[${idx}]`,
						code: "choiceOptionEmpty",
						params: { number: idx + 1 },
						questionId: question.id,
						fieldId: ids.choiceOption(question.id, idx)
					});
					return;
				}
				const firstIdx = duplicates.get(idx);
				if (firstIdx !== undefined) {
					errors.push({
						field: `${qField}.options.labels[${idx}]`,
						code: "choiceOptionDuplicate",
						params: { number: idx + 1, otherNumber: firstIdx + 1 },
						questionId: question.id,
						fieldId: ids.choiceOption(question.id, idx)
					});
				}
			});
		}
	}

	if (question.follow_ups && Array.isArray(question.follow_ups)) {
		// Der Flow kennt bei Kommentarfragen keine Verzweigung; entsteht durch nachträglichen Typwechsel
		if (question.type === "comment" && question.follow_ups.length > 0) {
			errors.push({
				field: `${qField}.follow_ups`,
				code: "followUpsNotAllowed",
				params: {},
				questionId: question.id,
				fieldId: ids.followUps(question.id)
			});
		}

		const duplicateOperators = findDuplicateFollowUpOperators(question.type, question.follow_ups);
		const duplicateValues = findDuplicateFollowUpValues(question.type, question.follow_ups);

		question.follow_ups.forEach((fu, fuIdx) => {
			if (!fu.question) {
				errors.push({
					field: `${qField}.follow_ups[${fuIdx}]`,
					code: "followUpMissing",
					params: {},
					questionId: question.id,
					fieldId: ids.followUps(question.id)
				});
				return;
			}

			const firstIdx = duplicateOperators.get(fuIdx);
			if (firstIdx !== undefined) {
				errors.push({
					field: `${qField}.follow_ups[${fuIdx}].condition.operator`,
					code: "followUpOperatorDuplicate",
					params: { operator: fu.condition?.operator, number: firstIdx + 1 },
					questionId: question.id,
					fieldId: ids.conditionOperator(question.id, fuIdx)
				});
			}

			if (question.type !== "comment" && !isFollowUpValueValid(question, fu.condition?.value)) {
				errors.push({
					field: `${qField}.follow_ups[${fuIdx}].condition.value`,
					code: "followUpValueRequired",
					params: {},
					questionId: question.id,
					fieldId: ids.conditionValue(question.id, fuIdx)
				});
			} else {
				const firstValueIdx = duplicateValues.get(fuIdx);
				if (firstValueIdx !== undefined) {
					errors.push({
						field: `${qField}.follow_ups[${fuIdx}].condition.value`,
						code: "followUpValueDuplicate",
						params: { number: firstValueIdx + 1 },
						questionId: question.id,
						fieldId: ids.conditionValue(question.id, fuIdx)
					});
				}
			}

			// Nur eine Ebene: Folgefragen dürfen keine eigenen Folgefragen haben. Der Editor legt keine an,
			// die Prüfung sichert nur gegen Fehler ab; darunter wird nicht weiter geprüft.
			if (fu.question.follow_ups?.length) {
				errors.push({
					field: `${qField}.follow_up_${fuIdx}.follow_ups`,
					code: "followUpsTooDeep",
					params: {},
					questionId: question.id,
					fieldId: ids.followUps(question.id)
				});
			}
			errors.push(...questionRules({ ...fu.question, follow_ups: [] }, `${qField}.follow_up_${fuIdx}`));
		});
	}

	return errors;
}

export interface SurveyRulesOptions {
	/** Feature Flag web_survey; ohne Flag sind die Web-Felder ausgeblendet und werden nicht geprüft */
	webSurvey?: boolean;
}

export function surveyRules(survey: Survey, { webSurvey = true }: SurveyRulesOptions = {}): SurveyRuleIssue[] {
	const errors: SurveyRuleIssue[] = [];

	if (!survey.title || !survey.title.trim()) {
		errors.push({
			field: "survey.title",
			code: "surveyTitleRequired",
			params: {},
			fieldId: surveyFieldIds.title
		});
	}

	if (!survey.name || !survey.name.trim()) {
		errors.push({
			field: "survey.name",
			code: "surveyNameRequired",
			params: {},
			fieldId: surveyFieldIds.name
		});
	}

	// Begrüßung und Verabschiedung werden im Bot Flow per TTS gesprochen
	for (const error of [
		ttsTooLongIssue(survey.greeting_message, "survey.greeting_message", "surveyEditor.meta.greeting", surveyFieldIds.greeting),
		ttsTooLongIssue(survey.closing_message, "survey.closing_message", "surveyEditor.meta.closing", surveyFieldIds.closing)
	]) {
		if (error) errors.push(error);
	}

	if (webSurvey) {
		const baseUrlCode = baseUrlError(survey.base_url);
		if (baseUrlCode) {
			errors.push({
				field: "survey.base_url",
				code: baseUrlCode,
				params: { placeholder: BASE_URL_TOKEN_PLACEHOLDER, max: BASE_URL_MAX_CHARS },
				fieldId: surveyFieldIds.baseUrl
			});
		}

		if (survey.language !== undefined && !(SURVEY_LANGUAGES as readonly string[]).includes(survey.language)) {
			errors.push({
				field: "survey.language",
				code: "languageInvalid",
				params: {},
				fieldId: surveyFieldIds.language
			});
		}

		if (survey.web_theme_id !== undefined && !isWebThemeId(survey.web_theme_id)) {
			errors.push({
				field: "survey.web_theme_id",
				code: "webThemeInvalid",
				params: {},
				fieldId: surveyFieldIds.webTheme
			});
		}
	}

	const totalQuestions = countAllQuestions(survey.questions || []);

	if (totalQuestions < 1) {
		errors.push({
			field: "survey.questions",
			code: "surveyMinQuestions",
			params: {},
			fieldId: surveyFieldIds.questions
		});
	}

	if (totalQuestions > SURVEY_MAX_QUESTIONS) {
		errors.push({
			field: "survey.questions",
			code: "surveyMaxQuestions",
			params: { count: totalQuestions, max: SURVEY_MAX_QUESTIONS },
			fieldId: surveyFieldIds.questions
		});
	}

	for (const q of survey.questions || []) {
		errors.push(...questionRules(q));
	}

	return errors;
}
