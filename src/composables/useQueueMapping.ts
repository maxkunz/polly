import { ref, computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { QueueMappingData, QueueMappingEntry, QueueConflict } from "@/domain/queueMapping/queueMappingTypes";
import { fetchQueueMapping, saveQueueMapping } from "@/services/surveyService";

export interface UseQueueMappingOptions {
	datatableId?: string;
	surveyId: string;
}

export interface UseQueueMappingReturn {
	isLoading: Ref<boolean>;
	isSaving: Ref<boolean>;
	loadError: Ref<string | null>;
	saveError: Ref<string | null>;

	queueNamesText: Ref<string>;
	deliveryRate: Ref<number>;

	allMappings: Ref<QueueMappingData>;
	surveyMappings: ComputedRef<QueueMappingEntry[]>;
	parsedQueues: ComputedRef<string[]>;
	isDirty: ComputedRef<boolean>;
	activeConflicts: ComputedRef<QueueConflict[]>;

	load(): Promise<void>;
	executeSave(): Promise<boolean>;
	resetForm(): void;
}

export function useQueueMapping({
	datatableId,
	surveyId
}: UseQueueMappingOptions): UseQueueMappingReturn {
	const isLoading = ref<boolean>(false);
	const isSaving = ref<boolean>(false);
	const loadError = ref<string | null>(null);
	const saveError = ref<string | null>(null);

	const queueNamesText = ref<string>("");
	const deliveryRate = ref<number>(5);

	const initialQueueNamesText = ref<string>("");
	const initialDeliveryRate = ref<number>(5);

	const rawRow = ref<Record<string, any> | null>(null);
	const allMappings = ref<QueueMappingData>([]);

	const surveyMappings = computed<QueueMappingEntry[]>(() => {
		return allMappings.value.filter(entry => entry.surveyId === surveyId);
	});

	const parsedQueues = computed<string[]>(() => {
		const lines = queueNamesText.value
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.length > 0);
		// Return deduplicated preserve order
		return Array.from(new Set(lines));
	});

	const isDirty = computed<boolean>(() => {
		return (
			queueNamesText.value !== initialQueueNamesText.value ||
			deliveryRate.value !== initialDeliveryRate.value
		);
	});

	const activeConflicts = computed<QueueConflict[]>(() => {
		const currentQueuesLower = new Set(parsedQueues.value.map(q => q.toLowerCase()));
		const conflicts: QueueConflict[] = [];

		for (const entry of allMappings.value) {
			if (entry.surveyId !== surveyId && currentQueuesLower.has((entry.queueName ?? "").toLowerCase())) {
				conflicts.push({
					queueName: entry.queueName,
					surveyId: entry.surveyId,
					deliveryRate: entry.deliveryRate
				});
			}
		}

		return conflicts;
	});

	function resetForm(): void {
		queueNamesText.value = initialQueueNamesText.value;
		deliveryRate.value = initialDeliveryRate.value;
		saveError.value = null;
	}

	async function load(): Promise<void> {
		isLoading.value = true;
		loadError.value = null;
		saveError.value = null;

		try {
			const res = await fetchQueueMapping(datatableId);
			rawRow.value = res.rawRow;
			allMappings.value = res.mapping;

			const forSurvey = res.mapping.filter(entry => entry.surveyId === surveyId);
			if (forSurvey.length > 0) {
				queueNamesText.value = forSurvey.map(e => e.queueName).join("\n");
				deliveryRate.value = forSurvey[0]?.deliveryRate ?? 5;
			} else {
				queueNamesText.value = "";
				deliveryRate.value = 5;
			}

			initialQueueNamesText.value = queueNamesText.value;
			initialDeliveryRate.value = deliveryRate.value;
		} catch (e: any) {
			console.error("Failed to load queue mapping:", e);
			loadError.value = e?.message || "Fehler beim Laden des Queue-Mappings";
		} finally {
			isLoading.value = false;
		}
	}

	async function executeSave(): Promise<boolean> {
		isSaving.value = true;
		saveError.value = null;

		try {
			const updated = await saveQueueMapping(
				datatableId,
				surveyId,
				parsedQueues.value,
				deliveryRate.value,
				rawRow.value
			);

			allMappings.value = updated;
			// Refresh raw row to ensure latest metadata
			const refreshed = await fetchQueueMapping(datatableId);
			rawRow.value = refreshed.rawRow;
			allMappings.value = refreshed.mapping;

			const forSurvey = refreshed.mapping.filter(entry => entry.surveyId === surveyId);
			queueNamesText.value = forSurvey.map(e => e.queueName).join("\n");
			if (forSurvey.length > 0) {
				deliveryRate.value = forSurvey[0]?.deliveryRate ?? deliveryRate.value;
			}

			initialQueueNamesText.value = queueNamesText.value;
			initialDeliveryRate.value = deliveryRate.value;

			return true;
		} catch (e: any) {
			console.error("Failed to save queue mapping:", e);
			saveError.value = e?.message || "Fehler beim Speichern des Queue-Mappings in der Data Table";
			return false;
		} finally {
			isSaving.value = false;
		}
	}

	return {
		isLoading,
		isSaving,
		loadError,
		saveError,
		queueNamesText,
		deliveryRate,
		allMappings,
		surveyMappings,
		parsedQueues,
		isDirty,
		activeConflicts,
		load,
		executeSave,
		resetForm
	};
}
