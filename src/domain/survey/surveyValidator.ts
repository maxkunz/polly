import type {
	Survey,
	SurveyQuestion,
	RatingOptions,
	ChoiceOptions
} from "./surveyTypes";
import { countAllQuestions, isRatingOptions, isChoiceOptions } from "./surveyTypes";

export interface ValidationError {
	field: string;
	message: string;
	questionId?: string;
}

export function validateQuestion(
	question: SurveyQuestion,
	prefix = ""
): ValidationError[] {
	const errors: ValidationError[] = [];
	const qField = prefix ? `${prefix}.${question.id}` : question.id;

	if (!question.title || !question.title.trim()) {
		errors.push({
			field: `${qField}.title`,
			message: "Fragetitel darf nicht leer sein.",
			questionId: question.id
		});
	}

	if (!question.name || !question.name.trim()) {
		errors.push({
			field: `${qField}.name`,
			message: "Name der Frage darf nicht leer sein.",
			questionId: question.id
		});
	}

	if (question.type === "rating") {
		if (!isRatingOptions(question.options)) {
			errors.push({
				field: `${qField}.options`,
				message: "Bewertungsoptionen sind ungültig.",
				questionId: question.id
			});
		} else {
			const { min_value, max_value } = question.options as RatingOptions;
			if (min_value < 0 || min_value > 8) {
				errors.push({
					field: `${qField}.options.min_value`,
					message: "Minimalwert muss zwischen 0 und 8 liegen.",
					questionId: question.id
				});
			}
			if (max_value < 0 || max_value > 8) {
				errors.push({
					field: `${qField}.options.max_value`,
					message: "Maximalwert muss zwischen 0 und 8 liegen.",
					questionId: question.id
				});
			}
			if (min_value >= max_value) {
				errors.push({
					field: `${qField}.options.range`,
					message: "Minimalwert muss kleiner als der Maximalwert sein.",
					questionId: question.id
				});
			}
		}
	} else if (question.type === "choice") {
		if (!isChoiceOptions(question.options)) {
			errors.push({
				field: `${qField}.options`,
				message: "Auswahloptionen sind ungültig.",
				questionId: question.id
			});
		} else {
			const labels = (question.options as ChoiceOptions).labels || [];
			if (labels.length < 2) {
				errors.push({
					field: `${qField}.options.labels`,
					message: "Eine Auswahlabfrage benötigt mindestens 2 Optionen.",
					questionId: question.id
				});
			}
			if (labels.length > 5) {
				errors.push({
					field: `${qField}.options.labels`,
					message: "Eine Auswahlabfrage darf maximal 5 Optionen haben.",
					questionId: question.id
				});
			}
			labels.forEach((opt, idx) => {
				if (!opt.label || !opt.label.trim()) {
					errors.push({
						field: `${qField}.options.labels[${idx}]`,
						message: `Option ${idx + 1} darf nicht leer sein.`,
						questionId: question.id
					});
				}
			});
		}
	}

	if (question.follow_ups && Array.isArray(question.follow_ups)) {
		question.follow_ups.forEach((fu, fuIdx) => {
			if (!fu.question) {
				errors.push({
					field: `${qField}.follow_ups[${fuIdx}]`,
					message: "Folgefrage fehlt.",
					questionId: question.id
				});
			} else {
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
	const errors: ValidationError[] = [];

	if (!survey.title || !survey.title.trim()) {
		errors.push({
			field: "survey.title",
			message: "Der Titel der Umfrage darf nicht leer sein."
		});
	}

	if (!survey.name || !survey.name.trim()) {
		errors.push({
			field: "survey.name",
			message: "Der Name der Umfrage darf nicht leer sein."
		});
	}

	const totalQuestions = countAllQuestions(survey.questions || []);

	if (totalQuestions < 1) {
		errors.push({
			field: "survey.questions",
			message: "Eine Umfrage muss mindestens 1 Frage enthalten."
		});
	}

	if (totalQuestions > 20) {
		errors.push({
			field: "survey.questions",
			message: `Eine Umfrage darf maximal 20 Fragen enthalten (inkl. Folgefragen). Aktuell: ${totalQuestions}.`
		});
	}

	for (const q of survey.questions || []) {
		errors.push(...validateQuestion(q));
	}

	return errors;
}
