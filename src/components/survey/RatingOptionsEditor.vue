<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import InputNumber from "primevue/inputnumber";
import type { RatingOptions } from "@/domain/survey/surveyTypes";

const { t } = useI18n();

const props = withDefaults(
	defineProps<{
		ratingOptions: RatingOptions;
		idPrefix: string;
		disabled?: boolean;
	}>(),
	{
		disabled: false
	}
);

const ratingMinId = computed(() => `${props.idPrefix}_min`);
const ratingMaxId = computed(() => `${props.idPrefix}_max`);

const ratingScaleArray = computed<number[]>(() => {
	const min = props.ratingOptions.min_value ?? 1;
	const max = props.ratingOptions.max_value ?? 5;
	if (min > max) return [];
	const arr: number[] = [];
	for (let i = min; i <= max; i++) arr.push(i);
	return arr;
});
</script>

<template>
	<div class="p-4 bg-[var(--p-surface-50)] rounded-xl border border-[var(--p-content-border-color)] space-y-3">
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold text-[var(--p-text-color)]">
				{{ t("ratingOptions.scaleLabel") }}
			</span>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
			<div>
				<label :for="ratingMinId" class="block text-xs font-medium mb-1">
					{{ t("ratingOptions.min") }}
				</label>
				<InputNumber
					:inputId="ratingMinId"
					v-model="ratingOptions.min_value"
					:min="0"
					:max="7"
					:useGrouping="false"
					inputClass="w-full"
					:disabled="disabled"
				/>
			</div>

			<div>
				<label :for="ratingMaxId" class="block text-xs font-medium mb-1">
					{{ t("ratingOptions.max") }}
				</label>
				<InputNumber
					:inputId="ratingMaxId"
					v-model="ratingOptions.max_value"
					:min="1"
					:max="8"
					:useGrouping="false"
					inputClass="w-full"
					:disabled="disabled"
				/>
			</div>
		</div>

		<div class="pt-2">
			<span class="text-xs text-[var(--p-text-muted-color)] block mb-1">{{ t("ratingOptions.previewLabel") }}</span>
			<div class="flex flex-wrap gap-2">
				<span
					v-for="val in ratingScaleArray"
					:key="val"
					class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)] text-xs font-bold shadow-sm"
				>
					{{ val }}
				</span>
			</div>
		</div>
	</div>
</template>
