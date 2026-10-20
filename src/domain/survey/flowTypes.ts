/**
 * Typen des Flow-JSON (Stage/Prod, siehe `documentation/survey_translator_for_flow.md`) und die
 * Grundtypen, die Editor- und Flow-Format gemeinsam nutzen.
 *
 * Dieses Modul wird auch von Lambdas gebündelt (über `flowNavigation.ts`). Es darf deshalb nur
 * relative Imports aus Modulen ohne `@/`-Alias haben: `ampx` prüft die Typen vor dem Deploy mit
 * `amplify/tsconfig.json`, das den Alias nicht kennt, und Vue/i18n würden das Lambda-Bundle aufblähen.
 */

export type QuestionType = "yes_no" | "choice" | "rating" | "nps" | "comment";

export type ConditionOperator = "equals" | "less_than" | "greater_than";

/**
 * Feste Reihenfolge der Bedingungen bei rating/nps: So schreibt der Translator sie ins Flow-JSON,
 * und in dieser Reihenfolge wertet die Navigation (Architect und Web-Kanal) sie aus.
 */
export const CONDITION_OPERATOR_ORDER: readonly ConditionOperator[] = ["equals", "less_than", "greater_than"];

/** Feste Skala des Fragetyps nps. */
export const NPS_SCALE_MIN = 0;
export const NPS_SCALE_MAX = 10;

/** Max. Länge einer Kommentar-Antwort im Web-Kanal (Seite und Prüfung beim Absenden). */
export const WEB_COMMENT_MAX_CHARS = 2000;

/** Labels für den minimalen und maximalen Wert einer Skala (nur im Web-Kanal sichtbar). */
export interface ScaleLabels {
	min_label?: string;
	max_label?: string;
}

/** Sprachen der Web-Umfrageseite (feste UI-Texte, `<html lang>`). */
export const SURVEY_LANGUAGES = ["de", "en", "fr"] as const;
export type SurveyLanguage = (typeof SURVEY_LANGUAGES)[number];
export const DEFAULT_SURVEY_LANGUAGE: SurveyLanguage = "de";

export interface FlowCondition {
	operator: ConditionOperator;
	value: number;
	next_question_id: string | null;
}

export interface FlowQuestionBase {
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
	/** Pro Option ein String mit durch "; " getrennten Synonymen, leerer String ohne Synonyme. */
	synonyms: string[];
	next_question_ids: (string | null)[];
}

export interface FlowRatingQuestion extends FlowQuestionBase {
	type: "rating";
	options: {
		values: number[];
		min_value: number;
		max_value: number;
	} & ScaleLabels;
	conditional_next_question: FlowCondition[];
}

export interface FlowNpsQuestion extends FlowQuestionBase {
	type: "nps";
	/** Nur vorhanden, wenn mindestens ein Min/Max-Label gesetzt ist (Web-Kanal). */
	options?: ScaleLabels;
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
	/** Sprache der Web-Umfrageseite; nur gesetzt, wenn der Draft sie enthält. */
	language?: SurveyLanguage;
	/**
	 * Web-Design der Umfrageseite (ID aus `WebSurveyThemesTable`); nur gesetzt, wenn der Draft eines wählt.
	 * Architect ignoriert das Feld, die Lambda `web_survey` wählt damit das Design und gibt es nicht weiter.
	 */
	web_theme_id?: string;
	created_at?: string;
	updated_at?: string;
	start_question_id: string | null;
	version?: number;
	type: "Flow";
	questions: FlowQuestion[];
}
