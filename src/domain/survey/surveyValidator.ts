import type {
	Survey,
	SurveyQuestion,
	RatingOptions,
	ChoiceOptions,
	ConditionOperator
} from "./surveyTypes";
import { countAllQuestions, isRatingOptions, isChoiceOptions } from "./surveyTypes";
import { i18n } from "@/i18n";

export interface ValidationError {
	field: string;
	message: string;
	questionId?: string;
	fieldId?: string;
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
 * Liefert für jede Auswahloption, die von mehr als einer Folgefrage als
 * Bedingung (equals) verwendet wird, den Index der jeweils ersten Folgefrage
 * mit dieser Option. Gilt nur für choice - hier steht zwar nur der Operator
 * "equals" zur Verfügung, jede Option darf aber trotzdem nur einmal als
 * Folgefragen-Bedingung verwendet werden.
 */
export function findDuplicateChoiceFollowUpValues(
	parentType: SurveyQuestion["type"],
	followUps: Array<{ condition?: { value?: unknown } }>
): Map<number, number> {
	const duplicates = new Map<number, number>();
	if (parentType !== "choice") {
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

export function validateQuestion(
	question: SurveyQuestion,
	prefix = ""
): ValidationError[] {
	const { t } = i18n.global;
	const errors: ValidationError[] = [];
	const qField = prefix ? `${prefix}.${question.id}` : question.id;

	if (!question.title || !question.title.trim()) {
		errors.push({
			field: `${qField}.title`,
			message: t("validation.questionTitleRequired"),
			questionId: question.id,
			fieldId: `q_title_${question.id}`
		});
	}

	if (!question.name || !question.name.trim()) {
		errors.push({
			field: `${qField}.name`,
			message: t("validation.questionNameRequired"),
			questionId: question.id,
			fieldId: `q_name_${question.id}`
		});
	}

	if (question.type === "rating") {
		if (!isRatingOptions(question.options)) {
			errors.push({
				field: `${qField}.options`,
				message: t("validation.ratingOptionsInvalid"),
				questionId: question.id
			});
		} else {
			const { min_value, max_value } = question.options as RatingOptions;
			if (min_value < 0 || min_value > 8) {
				errors.push({
					field: `${qField}.options.min_value`,
					message: t("validation.ratingMinRange"),
					questionId: question.id,
					fieldId: `q_rating_min_${question.id}`
				});
			}
			if (max_value < 0 || max_value > 8) {
				errors.push({
					field: `${qField}.options.max_value`,
					message: t("validation.ratingMaxRange"),
					questionId: question.id,
					fieldId: `q_rating_max_${question.id}`
				});
			}
			if (min_value >= max_value) {
				errors.push({
					field: `${qField}.options.range`,
					message: t("validation.ratingMinLessThanMax"),
					questionId: question.id,
					fieldId: `q_rating_min_${question.id}`
				});
			}
		}
	} else if (question.type === "choice") {
		if (!isChoiceOptions(question.options)) {
			errors.push({
				field: `${qField}.options`,
				message: t("validation.choiceOptionsInvalid"),
				questionId: question.id
			});
		} else {
			const labels = (question.options as ChoiceOptions).labels || [];
			if (labels.length < 2) {
				errors.push({
					field: `${qField}.options.labels`,
					message: t("validation.choiceMinOptions"),
					questionId: question.id
				});
			}
			if (labels.length > 5) {
				errors.push({
					field: `${qField}.options.labels`,
					message: t("validation.choiceMaxOptions"),
					questionId: question.id
				});
			}
			const duplicates = findDuplicateChoiceLabels(labels);
			labels.forEach((opt, idx) => {
				if (!opt.label || !opt.label.trim()) {
					errors.push({
						field: `${qField}.options.labels[${idx}]`,
						message: t("validation.choiceOptionEmpty", { number: idx + 1 }),
						questionId: question.id,
						fieldId: `opt_${question.id}_${idx}`
					});
					return;
				}
				const firstIdx = duplicates.get(idx);
				if (firstIdx !== undefined) {
					errors.push({
						field: `${qField}.options.labels[${idx}]`,
						message: t("validation.choiceOptionDuplicate", { number: idx + 1, otherNumber: firstIdx + 1 }),
						questionId: question.id,
						fieldId: `opt_${question.id}_${idx}`
					});
				}
			});
		}
	}

	if (question.follow_ups && Array.isArray(question.follow_ups)) {
		const duplicateOperators = findDuplicateFollowUpOperators(question.type, question.follow_ups);
		const duplicateChoiceValues = findDuplicateChoiceFollowUpValues(question.type, question.follow_ups);

		question.follow_ups.forEach((fu, fuIdx) => {
			if (!fu.question) {
				errors.push({
					field: `${qField}.follow_ups[${fuIdx}]`,
					message: t("validation.followUpMissing"),
					questionId: question.id
				});
			} else {
				const firstIdx = duplicateOperators.get(fuIdx);
				if (firstIdx !== undefined) {
					errors.push({
						field: `${qField}.follow_ups[${fuIdx}].condition.operator`,
						message: t("validation.followUpOperatorDuplicate", { operator: fu.condition?.operator, number: firstIdx + 1 }),
						questionId: question.id,
						fieldId: `fu_cond_op_${question.id}_${fuIdx}`
					});
				}
				const firstValueIdx = duplicateChoiceValues.get(fuIdx);
				if (firstValueIdx !== undefined) {
					errors.push({
						field: `${qField}.follow_ups[${fuIdx}].condition.value`,
						message: t("validation.followUpChoiceValueDuplicate", { number: firstValueIdx + 1 }),
						questionId: question.id,
						fieldId: `fu_cond_val_${question.id}_${fuIdx}`
					});
				}
				errors.push(
					...validateQuestion(
						fu.question,
						`${qField}.follow_up_${fuIdx}`
					)
				);
			}
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
			fieldId: "survey_title_input"
		});
	}

	if (!survey.name || !survey.name.trim()) {
		errors.push({
			field: "survey.name",
			message: t("validation.surveyNameRequired"),
			fieldId: "survey_name_input"
		});
	}

	const totalQuestions = countAllQuestions(survey.questions || []);

	if (totalQuestions < 1) {
		errors.push({
			field: "survey.questions",
			message: t("validation.surveyMinQuestions")
		});
	}

	if (totalQuestions > 20) {
		errors.push({
			field: "survey.questions",
			message: t("validation.surveyMaxQuestions", { count: totalQuestions })
		});
	}

	for (const q of survey.questions || []) {
		errors.push(...validateQuestion(q));
	}

	return errors;
}
