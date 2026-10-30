import type { Survey, SurveyQuestion } from "./surveyTypes";
import { questionRules, surveyRules } from "./surveyRules";
import type { SurveyRuleIssue, SurveyRulesOptions } from "./surveyRules";
import { i18n, currentLocaleTag } from "@/i18n";

/**
 * Frontend-Adapter der Prüfregeln (surveyRules.ts): macht aus Code und Parametern die
 * übersetzte Meldung. Die Regeln selbst liegen aliasfrei in surveyRules.ts.
 */

export {
	findDuplicateChoiceLabels,
	findDuplicateFollowUpOperators,
	findDuplicateFollowUpValues,
	isTtsTextTooLong
} from "./surveyRules";

export interface ValidationError {
	field: string;
	message: string;
	questionId?: string;
	/** DOM-ID des Feldes bzw. Bereichs im Editor (siehe surveyFieldIds) – Ziel für Markierung und Sprung */
	fieldId?: string;
	/** Das Feld zeigt die Meldung bereits selbst an (TTS-Limit in PromptTextarea) und wird nur markiert */
	shownByField?: boolean;
}

export type ValidateSurveyOptions = SurveyRulesOptions;

function ruleMessage(code: SurveyRuleIssue["code"], ruleParams: SurveyRuleIssue["params"]): string {
	const { t } = i18n.global;
	const { labelKey, ...params } = ruleParams;
	if (typeof labelKey === "string") {
		params.field = t(labelKey);
	}
	// Nur beim TTS-Limit werden die Zahlen mit Tausendertrennzeichen ausgegeben
	if (code === "ttsTextTooLong") {
		const format = new Intl.NumberFormat(currentLocaleTag());
		params.length = format.format(params.length as number);
		params.max = format.format(params.max as number);
	}
	return t(`validation.${code}`, params);
}

function toValidationErrors(issues: SurveyRuleIssue[]): ValidationError[] {
	return issues.map(({ code, params, ...rest }) => ({ ...rest, message: ruleMessage(code, params) }));
}

export function validateQuestion(
	question: SurveyQuestion,
	prefix = ""
): ValidationError[] {
	return toValidationErrors(questionRules(question, prefix));
}

export function validateSurvey(survey: Survey, options: ValidateSurveyOptions = {}): ValidationError[] {
	return toValidationErrors(surveyRules(survey, options));
}
