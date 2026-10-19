import type {
	FlowChoiceQuestion,
	FlowCondition,
	FlowNpsQuestion,
	FlowQuestionBase,
	FlowRatingQuestion,
	FlowYesNoQuestion,
	SurveyLanguage
} from "./flowTypes";

/**
 * Bereinigtes Flow-JSON, das `GET /web-survey` an die öffentliche Umfrageseite liefert
 * (siehe `documentation/polly_web.md`). Erzeugt in der Lambda `web_survey` als Whitelist aus dem
 * Prod-Stand: ohne `name`, `reprompt`, `synonyms` und Zeitstempel; `language` immer gesetzt
 * (Default `de`), `version` immer eine Zahl.
 *
 * Aliasfrei, weil Lambda und Umfrageseite die Typen gemeinsam nutzen (siehe Hinweis in `flowTypes.ts`).
 */

type WebQuestionBase = Pick<
	FlowQuestionBase,
	"id" | "type" | "prompt" | "description" | "mandatory" | "default_next_question_id"
>;

export interface WebCommentQuestion extends WebQuestionBase {
	type: "comment";
}

export interface WebYesNoQuestion extends WebQuestionBase {
	type: "yes_no";
	options: FlowYesNoQuestion["options"];
}

export interface WebChoiceQuestion extends WebQuestionBase {
	type: "choice";
	labels: FlowChoiceQuestion["labels"];
	next_question_ids: FlowChoiceQuestion["next_question_ids"];
}

export interface WebRatingQuestion extends WebQuestionBase {
	type: "rating";
	options: FlowRatingQuestion["options"];
	conditional_next_question: FlowCondition[];
}

export interface WebNpsQuestion extends WebQuestionBase {
	type: "nps";
	options?: FlowNpsQuestion["options"];
	conditional_next_question: FlowCondition[];
}

export type WebQuestion =
	| WebCommentQuestion
	| WebYesNoQuestion
	| WebChoiceQuestion
	| WebRatingQuestion
	| WebNpsQuestion;

export interface WebSurvey {
	id: string;
	title: string;
	description: string;
	greeting_prompt: string;
	closing_prompt: string;
	language: SurveyLanguage;
	start_question_id: string | null;
	version: number;
	questions: WebQuestion[];
}

/** Statuswerte von `GET /web-survey` und `POST /web-survey/submit` (Feld `status` der Antwort). */
export type WebSurveyLoadStatus = "ok" | "invalid" | "expired" | "used" | "unavailable";

export type WebSurveySubmitStatus =
	| "ok"
	| "invalid"
	| "expired"
	| "used"
	| "unavailable"
	| "survey_changed"
	| "invalid_request"
	| "invalid_answers"
	| "payload_too_large"
	| "throttled"
	| "error";
