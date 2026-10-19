import type { Survey, SurveyQuestion, RatingOptions, ChoiceOptions } from "./surveyTypes";
import { countAllQuestions, isRatingOptions, isChoiceOptions } from "./surveyTypes";
import { SURVEY_LANGUAGES } from "./flowTypes";
import type { ConditionOperator } from "./flowTypes";
import { surveyFieldIds, questionFieldIds } from "./surveyFieldIds";
import { i18n, currentLocaleTag } from "@/i18n";
import {
	TTS_TEXT_MAX_CHARS,
	SURVEY_MAX_QUESTIONS,
	CHOICE_MIN_OPTIONS,
	CHOICE_MAX_OPTIONS,
	RATING_SCALE_MIN,
	RATING_SCALE_MAX,
	SCALE_LABEL_MAX_CHARS,
	BASE_URL_TOKEN_PLACEHOLDER
} from "@/constants/surveyConstants";

export interface ValidationError {
	field: string;
	message: string;
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

/**
 * Prüft die Basis-URL der Einladungslinks: leer ist erlaubt, sonst eine absolute https://-URL
 * mit höchstens einem Platzhalter {token}. Liefert den Fehlerschlüssel unter `validation.*`.
 */
export function baseUrlError(baseUrl: string | null | undefined): "baseUrlTokenCount" | "baseUrlInvalid" | null {
	const value = baseUrl?.trim();
	if (!value) return null;
	if (value.split(BASE_URL_TOKEN_PLACEHOLDER).length - 1 > 1) return "baseUrlTokenCount";
	if (/\s/.test(value)) return "baseUrlInvalid";
	try {
		const url = new URL(value.replace(BASE_URL_TOKEN_PLACEHOLDER, "token"));
		return url.protocol === "https:" && url.hostname ? null : "baseUrlInvalid";
	} catch {
		return "baseUrlInvalid";
	}
}

/** true, wenn ein per TTS gesprochener Text das Genesys-Limit pro TTS-Anfrage überschreitet. */
export function isTtsTextTooLong(text: string | null | undefined): boolean {
	return (text?.length ?? 0) > TTS_TEXT_MAX_CHARS;
}

function ttsTooLongError(
	text: string | null | undefined,
	field: string,
	fieldLabelKey: string,
	fieldId: string,
	questionId?: string
): ValidationError | null {
	if (!isTtsTextTooLong(text)) return null;
	const { t } = i18n.global;
	const format = new Intl.NumberFormat(currentLocaleTag());
	return {
		field,
		message: t("validation.ttsTextTooLong", {
			field: t(fieldLabelKey),
			length: format.format(text!.length),
			max: format.format(TTS_TEXT_MAX_CHARS)
		}),
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

export function validateQuestion(
	question: SurveyQuestion,
	prefix = ""
): ValidationError[] {
	const { t } = i18n.global;
	const errors: ValidationError[] = [];
	const qField = prefix ? `${prefix}.${question.id}` : question.id;
	const ids = questionFieldIds;

	if (!question.title || !question.title.trim()) {
		errors.push({
			field: `${qField}.title`,
			message: t("validation.questionTitleRequired"),
			questionId: question.id,
			fieldId: ids.title(question.id)
		});
	}

	// Fragetitel (prompt) und Reprompt werden im Bot Flow per TTS gesprochen
	for (const error of [
		ttsTooLongError(question.title, `${qField}.title`, "surveyQuestionFields.title", ids.title(question.id), question.id),
		ttsTooLongError(question.reprompt_message, `${qField}.reprompt_message`, "surveyQuestionFields.reprompt", ids.reprompt(question.id), question.id)
	]) {
		if (error) errors.push(error);
	}

	if (!question.name || !question.name.trim()) {
		errors.push({
			field: `${qField}.name`,
			message: t("validation.questionNameRequired"),
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
					message: t("validation.scaleLabelTooLong", { field: t(labelKey), max: SCALE_LABEL_MAX_CHARS }),
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
				message: t("validation.ratingOptionsInvalid"),
				questionId: question.id,
				fieldId: ids.options(question.id)
			});
		} else {
			const { min_value, max_value } = question.options as RatingOptions;
			const range = { min: RATING_SCALE_MIN, max: RATING_SCALE_MAX };
			if (min_value < RATING_SCALE_MIN || min_value > RATING_SCALE_MAX) {
				errors.push({
					field: `${qField}.options.min_value`,
					message: t("validation.ratingMinRange", range),
					questionId: question.id,
					fieldId: ids.ratingMin(question.id)
				});
			}
			if (max_value < RATING_SCALE_MIN || max_value > RATING_SCALE_MAX) {
				errors.push({
					field: `${qField}.options.max_value`,
					message: t("validation.ratingMaxRange", range),
					questionId: question.id,
					fieldId: ids.ratingMax(question.id)
				});
			}
			if (min_value >= max_value) {
				errors.push({
					field: `${qField}.options.range`,
					message: t("validation.ratingMinLessThanMax"),
					questionId: question.id,
					fieldId: ids.ratingMin(question.id)
				});
			}
		}
	} else if (question.type === "choice") {
		if (!isChoiceOptions(question.options)) {
			errors.push({
				field: `${qField}.options`,
				message: t("validation.choiceOptionsInvalid"),
				questionId: question.id,
				fieldId: ids.options(question.id)
			});
		} else {
			const labels = (question.options as ChoiceOptions).labels || [];
			if (labels.length < CHOICE_MIN_OPTIONS) {
				errors.push({
					field: `${qField}.options.labels`,
					message: t("validation.choiceMinOptions", { min: CHOICE_MIN_OPTIONS }),
					questionId: question.id,
					fieldId: ids.options(question.id)
				});
			}
			if (labels.length > CHOICE_MAX_OPTIONS) {
				errors.push({
					field: `${qField}.options.labels`,
					message: t("validation.choiceMaxOptions", { max: CHOICE_MAX_OPTIONS }),
					questionId: question.id,
					fieldId: ids.options(question.id)
				});
			}
			const duplicates = findDuplicateChoiceLabels(labels);
			labels.forEach((opt, idx) => {
				if (!opt.label || !opt.label.trim()) {
					errors.push({
						field: `${qField}.options.labels[${idx}]`,
						message: t("validation.choiceOptionEmpty", { number: idx + 1 }),
						questionId: question.id,
						fieldId: ids.choiceOption(question.id, idx)
					});
					return;
				}
				const firstIdx = duplicates.get(idx);
				if (firstIdx !== undefined) {
					errors.push({
						field: `${qField}.options.labels[${idx}]`,
						message: t("validation.choiceOptionDuplicate", { number: idx + 1, otherNumber: firstIdx + 1 }),
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
				message: t("validation.followUpsNotAllowed"),
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
					message: t("validation.followUpMissing"),
					questionId: question.id,
					fieldId: ids.followUps(question.id)
				});
				return;
			}

			const firstIdx = duplicateOperators.get(fuIdx);
			if (firstIdx !== undefined) {
				errors.push({
					field: `${qField}.follow_ups[${fuIdx}].condition.operator`,
					message: t("validation.followUpOperatorDuplicate", { operator: fu.condition?.operator, number: firstIdx + 1 }),
					questionId: question.id,
					fieldId: ids.conditionOperator(question.id, fuIdx)
				});
			}

			if (question.type !== "comment" && !isFollowUpValueValid(question, fu.condition?.value)) {
				errors.push({
					field: `${qField}.follow_ups[${fuIdx}].condition.value`,
					message: t("validation.followUpValueRequired"),
					questionId: question.id,
					fieldId: ids.conditionValue(question.id, fuIdx)
				});
			} else {
				const firstValueIdx = duplicateValues.get(fuIdx);
				if (firstValueIdx !== undefined) {
					errors.push({
						field: `${qField}.follow_ups[${fuIdx}].condition.value`,
						message: t("validation.followUpValueDuplicate", { number: firstValueIdx + 1 }),
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
					message: t("validation.followUpsTooDeep"),
					questionId: question.id,
					fieldId: ids.followUps(question.id)
				});
			}
			errors.push(...validateQuestion({ ...fu.question, follow_ups: [] }, `${qField}.follow_up_${fuIdx}`));
		});
	}

	return errors;
}

export function validateSurvey(survey: Survey): ValidationError[] {
	const { t } = i18n.global;
	const errors: ValidationError[] = [];

	if (!survey.title || !survey.title.trim()) {
		errors.push({
			field: "survey.title",
			message: t("validation.surveyTitleRequired"),
			fieldId: surveyFieldIds.title
		});
	}

	if (!survey.name || !survey.name.trim()) {
		errors.push({
			field: "survey.name",
			message: t("validation.surveyNameRequired"),
			fieldId: surveyFieldIds.name
		});
	}

	// Begrüßung und Verabschiedung werden im Bot Flow per TTS gesprochen
	for (const error of [
		ttsTooLongError(survey.greeting_message, "survey.greeting_message", "surveyEditor.meta.greeting", surveyFieldIds.greeting),
		ttsTooLongError(survey.closing_message, "survey.closing_message", "surveyEditor.meta.closing", surveyFieldIds.closing)
	]) {
		if (error) errors.push(error);
	}

	const baseUrlKey = baseUrlError(survey.base_url);
	if (baseUrlKey) {
		errors.push({
			field: "survey.base_url",
			message: t(`validation.${baseUrlKey}`, { placeholder: BASE_URL_TOKEN_PLACEHOLDER }),
			fieldId: surveyFieldIds.baseUrl
		});
	}

	if (survey.language !== undefined && !(SURVEY_LANGUAGES as readonly string[]).includes(survey.language)) {
		errors.push({
			field: "survey.language",
			message: t("validation.languageInvalid"),
			fieldId: surveyFieldIds.language
		});
	}

	const totalQuestions = countAllQuestions(survey.questions || []);

	if (totalQuestions < 1) {
		errors.push({
			field: "survey.questions",
			message: t("validation.surveyMinQuestions"),
			fieldId: surveyFieldIds.questions
		});
	}

	if (totalQuestions > SURVEY_MAX_QUESTIONS) {
		errors.push({
			field: "survey.questions",
			message: t("validation.surveyMaxQuestions", { count: totalQuestions, max: SURVEY_MAX_QUESTIONS }),
			fieldId: surveyFieldIds.questions
		});
	}

	for (const q of survey.questions || []) {
		errors.push(...validateQuestion(q));
	}

	return errors;
}
