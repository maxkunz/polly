import { onScopeDispose, ref, watch } from "vue";
import type { Ref } from "vue";
import type { Survey } from "@/domain/survey/surveyTypes";
import { measureFlowPayload, type FlowPayloadSize } from "@/services/flowPayloadBudget";

/** Wartezeit nach der letzten Änderung, bevor neu gemessen wird */
const MEASURE_DEBOUNCE_MS = 600;

/**
 * Misst die Größe des Flow-JSON für den Editor-Entwurf.
 * Der Translator läuft erst, wenn die Eingabe kurz ruht, nicht bei jedem Tastendruck.
 */
export function useFlowPayloadSize(survey: Ref<Survey | null>): Ref<FlowPayloadSize | null> {
	const size = ref<FlowPayloadSize | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function measure(): void {
		timer = undefined;
		if (!survey.value) {
			size.value = null;
			return;
		}
		try {
			size.value = measureFlowPayload(survey.value);
		} catch {
			// Unfertige Entwürfe (z. B. Folgefrage ohne Bedingung) sind nicht übersetzbar –
			// dann den letzten Messwert stehen lassen, statt den Hinweis flackern zu lassen.
		}
	}

	watch(
		survey,
		() => {
			if (timer !== undefined) clearTimeout(timer);
			timer = setTimeout(measure, MEASURE_DEBOUNCE_MS);
		},
		{ deep: true }
	);

	onScopeDispose(() => {
		if (timer !== undefined) clearTimeout(timer);
	});

	// Erstmessung beim Öffnen ohne Verzögerung
	measure();

	return size;
}
