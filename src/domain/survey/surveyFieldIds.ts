/**
 * DOM-IDs der Editor-Felder. Der Validator setzt sie als fieldId der Fehler, die Komponenten
 * als id der Felder – nur so kann der Editor zu jedem Fehler das passende Feld markieren und
 * anspringen. Fragen-IDs sind UUIDs, daher gelten dieselben IDs für Haupt- und Folgefragen.
 */
export const surveyFieldIds = {
	title: "survey_title_input",
	name: "survey_name_input",
	description: "survey_desc_input",
	greeting: "survey_greeting_input",
	closing: "survey_closing_input",
	baseUrl: "survey_base_url_input",
	language: "survey_language_select",
	/** Fragenbereich: Anker für Fehler zur Anzahl der Fragen */
	questions: "survey_questions",
	/** Fehlerübersicht: Sprungziel, wenn kein Fehler einem Feld zugeordnet ist */
	validationSummary: "survey_validation_summary"
};

export const questionFieldIds = {
	name: (questionId: string) => `q_name_${questionId}`,
	type: (questionId: string) => `q_type_${questionId}`,
	mandatory: (questionId: string) => `q_mandatory_${questionId}`,
	title: (questionId: string) => `q_title_${questionId}`,
	description: (questionId: string) => `q_desc_${questionId}`,
	reprompt: (questionId: string) => `q_reprompt_${questionId}`,
	/** Optionsbereich (Rating-Skala bzw. Auswahloptionen): Anker für Fehler zur gesamten Konfiguration */
	options: (questionId: string) => `q_options_${questionId}`,
	ratingMin: (questionId: string) => `q_rating_min_${questionId}`,
	ratingMax: (questionId: string) => `q_rating_max_${questionId}`,
	minLabel: (questionId: string) => `q_min_label_${questionId}`,
	maxLabel: (questionId: string) => `q_max_label_${questionId}`,
	choiceOption: (questionId: string, index: number) => `q_option_${questionId}_${index}`,
	/** Folgefragenbereich einer Frage: Anker für Fehler, die keinem einzelnen Feld zugeordnet sind */
	followUps: (questionId: string) => `q_followups_${questionId}`,
	conditionOperator: (parentQuestionId: string, index: number) => `fu_cond_op_${parentQuestionId}_${index}`,
	conditionValue: (parentQuestionId: string, index: number) => `fu_cond_val_${parentQuestionId}_${index}`
};
