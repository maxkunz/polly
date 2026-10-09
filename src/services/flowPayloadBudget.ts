import type { Survey } from "@/domain/survey/surveyTypes";
import { FLOW_PAYLOAD_MAX_CHARS, FLOW_PAYLOAD_WARN_RATIO } from "@/constants/surveyConstants";
import { translateSurveyForFlow } from "./surveyFlowTranslator";

export type FlowPayloadLevel = "ok" | "warn" | "exceeded";

export interface FlowPayloadSize {
	/** Länge des übersetzten Flow-JSON in Zeichen */
	length: number;
	max: number;
	/** Abgerundeter Anteil am Budget in Prozent */
	percent: number;
	level: FlowPayloadLevel;
}

/**
 * Bewertet die Länge eines Flow-JSON gegen das Architect-Budget.
 * Genau am Limit ist noch zulässig, erst darüber wird gesperrt.
 */
export function evaluateFlowPayloadSize(length: number): FlowPayloadSize {
	const max = FLOW_PAYLOAD_MAX_CHARS;
	let level: FlowPayloadLevel = "ok";
	if (length > max) {
		level = "exceeded";
	} else if (length >= max * FLOW_PAYLOAD_WARN_RATIO) {
		level = "warn";
	}
	return { length, max, percent: Math.floor((length / max) * 100), level };
}

/**
 * Übersetzt den Draft wie beim Deploy und misst das Ergebnis. Gemessen wird
 * bewusst das fertige Flow-JSON, damit Struktur und JSON-Escapes mitzählen.
 * Wirft wie der Translator, wenn der Draft nicht übersetzbar ist.
 */
export function measureFlowPayload(draft: Survey | string | Record<string, any>): FlowPayloadSize {
	return evaluateFlowPayloadSize(translateSurveyForFlow(draft).length);
}
