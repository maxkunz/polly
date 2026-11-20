import type { FlowSurvey } from "@/domain/survey/flowTypes";
import type { Survey } from "@/domain/survey/surveyTypes";
import {
	FlowTranslationError,
	translateSurveyForFlow as translateFlow,
	translateSurveyObject as translateObject
} from "@/domain/survey/flowTranslator";
import { i18n } from "@/i18n";

/**
 * Frontend-Adapter des Translators (`domain/survey/flowTranslator.ts`): gleiche Funktionen,
 * Fehler aber als SurveyFlowTranslationError mit übersetzter Meldung.
 */

/**
 * Fehler beim Übersetzen; die Meldung erscheint im UI (Deploy-Ansicht). `key` ist ein Schlüssel
 * unter `translator.*` in den Sprachdateien; mit `question` wird die betroffene Frage angehängt.
 */
export class SurveyFlowTranslationError extends Error {
	constructor(key: string, params: Record<string, unknown> = {}, question?: { id?: string; name?: string }) {
		const { t } = i18n.global;
		const message = t(`translator.${key}`, params);
		const context = question?.name ?? question?.id;
		super(context ? t("translator.questionContext", { message, question: context }) : message);
		this.name = "SurveyFlowTranslationError";
	}
}

function withTranslatedErrors<T>(fn: () => T): T {
	try {
		return fn();
	} catch (error) {
		if (error instanceof FlowTranslationError) {
			throw new SurveyFlowTranslationError(error.key, error.params, error.question);
		}
		throw error;
	}
}

/** Siehe `translateSurveyObject` in `domain/survey/flowTranslator.ts`. */
export function translateSurveyObject(survey: Survey): FlowSurvey {
	return withTranslatedErrors(() => translateObject(survey));
}

/**
 * Übersetzt den Draft-Inhalt (als JSON-String oder Objekt) in den Flow-optimierten JSON-Payload
 * für das Deployment nach Stage und Prod. Wirft `SurveyFlowTranslationError`, wenn der Draft
 * nicht übersetzbar ist; das Deployment soll dann abbrechen.
 */
export function translateSurveyForFlow(
	draft: Survey | string | Record<string, any>
): string {
	return withTranslatedErrors(() => translateFlow(draft));
}
