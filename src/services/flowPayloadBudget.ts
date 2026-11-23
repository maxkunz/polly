// Liegt aliasfrei in domain/survey/flowPayload.ts (auch für die Lambdas). measureFlowPayload wirft
// dort FlowTranslationError ohne übersetzte Meldung; die Aufrufer im Frontend fangen den Fehler ab.
export { evaluateFlowPayloadSize, measureFlowPayload } from "@/domain/survey/flowPayload";
export type { FlowPayloadLevel, FlowPayloadSize } from "@/domain/survey/flowPayload";
