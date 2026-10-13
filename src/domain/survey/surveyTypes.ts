export type QuestionType = "yes_no" | "choice" | "rating" | "nps" | "comment";

export type ConditionOperator = "equals" | "less_than" | "greater_than";

export interface ChoiceOptionLabel {
	id: string;
	label: string;
	synonyms?: string[];
}

export interface ChoiceOptions {
	labels: ChoiceOptionLabel[];
}

export interface RatingOptions {
	min_value: number;
	max_value: number;
}

export type QuestionOptions = ChoiceOptions | RatingOptions | Record<string, unknown>;

export interface FollowUpCondition {
	operator: ConditionOperator;
	value: boolean | string | number;
}

export interface FollowUpRule {
	condition: FollowUpCondition;
	question: SurveyQuestion;
}

export interface SurveyQuestion {
	id: string;
	name: string;
	type: QuestionType;
	title: string;
	description?: string;
	reprompt_message?: string;
	mandatory?: boolean;
	options?: QuestionOptions;
	follow_ups?: FollowUpRule[];
}

export interface Survey {
	id: string;
	name: string;
	title: string;
	description?: string;
	greeting_message?: string;
	closing_message?: string;
	created_at?: string;
	updated_at?: string;
	version?: number;
	questions: SurveyQuestion[];
}

export function isRatingOptions(options: unknown): options is RatingOptions {
	return (
		typeof options === "object" &&
		options !== null &&
		"min_value" in options &&
		"max_value" in options
	);
}

export function isChoiceOptions(options: unknown): options is ChoiceOptions {
	return (
		typeof options === "object" &&
		options !== null &&
		"labels" in options &&
		Array.isArray((options as ChoiceOptions).labels)
	);
}

/** Erste 8 Zeichen der ID ohne Bindestriche – Bestandteil der technischen Namen. */
export function shortId(id: string): string {
	return (id || "").replace(/-/g, "").slice(0, 8);
}

/** Platzhalter-Name, solange noch kein Titel gespeichert wurde (z. B. "frage_47cc5f41"). */
function placeholderName(defaultSlug: string, id: string): string {
	return `${defaultSlug}_${shortId(id)}`;
}

export function createEmptyChoiceOption(): ChoiceOptionLabel {
	return {
		id: crypto.randomUUID(),
		label: ""
	};
}

export function createDefaultRatingOptions(): RatingOptions {
	return { min_value: 1, max_value: 5 };
}

export function createDefaultChoiceOptions(): ChoiceOptions {
	return {
		labels: [
			{ id: crypto.randomUUID(), label: "Option 1" },
			{ id: crypto.randomUUID(), label: "Option 2" }
		]
	};
}

export function createEmptyQuestion(type: QuestionType = "rating"): SurveyQuestion {
	const id = crypto.randomUUID();
	const question: SurveyQuestion = {
		id,
		name: placeholderName("frage", id),
		type,
		title: "",
		description: "",
		reprompt_message: "",
		mandatory: false
	};

	if (type === "rating") {
		question.options = createDefaultRatingOptions();
	} else if (type === "choice") {
		question.options = createDefaultChoiceOptions();
	}

	return question;
}

export function createEmptyFollowUp(parentType: QuestionType = "yes_no"): FollowUpRule {
	let operator: ConditionOperator = "equals";
	let value: boolean | string | number = false;

	if (parentType === "yes_no") {
		operator = "equals";
		value = false;
	} else if (parentType === "rating") {
		operator = "less_than";
		value = 3;
	} else if (parentType === "nps") {
		operator = "less_than";
		value = 7;
	} else if (parentType === "choice") {
		operator = "equals";
		value = "";
	}

	return {
		condition: {
			operator,
			value
		},
		question: createEmptyQuestion("comment")
	};
}

export function countAllQuestions(questions: SurveyQuestion[]): number {
	let count = 0;
	for (const q of questions) {
		count += 1;
		if (q.follow_ups && Array.isArray(q.follow_ups)) {
			for (const fu of q.follow_ups) {
				if (fu.question) {
					count += countAllQuestions([fu.question]);
				}
			}
		}
	}
	return count;
}

export function generateTechnicalName(title: string, id: string, defaultSlug = "umfrage"): string {
	const first8 = shortId(id);
	let slug = (title || "")
		.toLowerCase()
		.replace(/ä/g, "ae")
		.replace(/ö/g, "oe")
		.replace(/ü/g, "ue")
		.replace(/ß/g, "ss")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

	if (!slug) {
		slug = defaultSlug;
	}

	return first8 ? `${slug}_${first8}` : slug;
}

export function ensureTechnicalName(
	existingName: string | undefined,
	title: string,
	id: string,
	defaultSlug = "umfrage"
): string {
	// Ein einmal vergebener Name bleibt erhalten (Reporting-Schlüssel). Neu erzeugt wird nur,
	// solange der Name leer ist oder exakt dem Platzhalter entspricht. Ein reiner Präfix-Vergleich
	// genügt nicht: Titel wie "Umfrage …" oder "Frage …" ergeben Namen mit demselben Präfix.
	const trimmed = existingName?.trim() ?? "";
	if (trimmed && trimmed.toLowerCase() !== placeholderName(defaultSlug, id)) {
		return trimmed;
	}

	return generateTechnicalName(title, id, defaultSlug);
}

export function ensureQuestionTechnicalNames(question: SurveyQuestion): void {
	question.name = ensureTechnicalName(question.name, question.title, question.id, "frage");
	if (question.follow_ups && Array.isArray(question.follow_ups)) {
		for (const fu of question.follow_ups) {
			if (fu.question) {
				ensureQuestionTechnicalNames(fu.question);
			}
		}
	}
}

export function ensureSurveyTechnicalNames(survey: Survey): void {
	survey.name = ensureTechnicalName(survey.name, survey.title, survey.id, "umfrage");
	if (survey.questions && Array.isArray(survey.questions)) {
		for (const q of survey.questions) {
			ensureQuestionTechnicalNames(q);
		}
	}
}

export function createEmptySurvey(): Survey {
	const id = crypto.randomUUID();
	return {
		id,
		name: placeholderName("umfrage", id),
		title: "",
		description: "",
		greeting_message: "",
		closing_message: "",
		created_at: new Date().toISOString(),
		version: 0,
		questions: []
	};
}

export function cloneSurveyQuestion(source: SurveyQuestion): SurveyQuestion {
	const newId = crypto.randomUUID();
	let clonedOptions: QuestionOptions | undefined;

	if (source.options) {
		if (isChoiceOptions(source.options)) {
			clonedOptions = {
				labels: source.options.labels.map(l => ({
					id: crypto.randomUUID(),
					label: l.label,
					...(l.synonyms && l.synonyms.length > 0 ? { synonyms: [...l.synonyms] } : {})
				}))
			};
		} else {
			clonedOptions = JSON.parse(JSON.stringify(source.options));
		}
	}

	const clonedFollowUps = source.follow_ups?.map(fu => ({
		condition: { ...fu.condition },
		question: cloneSurveyQuestion(fu.question)
	}));

	return {
		id: newId,
		name: placeholderName("frage", newId),
		type: source.type,
		title: source.title,
		description: source.description,
		reprompt_message: source.reprompt_message,
		mandatory: source.mandatory,
		options: clonedOptions,
		follow_ups: clonedFollowUps
	};
}

export function cloneSurvey(source: Survey): Survey {
	const newId = crypto.randomUUID();
	return {
		id: newId,
		name: placeholderName("umfrage", newId),
		title: source.title,
		description: source.description,
		greeting_message: source.greeting_message,
		closing_message: source.closing_message,
		created_at: new Date().toISOString(),
		version: 0,
		questions: (source.questions || []).map(q => cloneSurveyQuestion(q))
	};
}
