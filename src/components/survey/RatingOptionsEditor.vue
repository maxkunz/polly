<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import InputNumber from "primevue/inputnumber";
import type { RatingOptions } from "@/domain/survey/surveyTypes";
import { RATING_SCALE_MIN, RATING_SCALE_MAX } from "@/constants/surveyConstants";
import { questionFieldIds } from "@/domain/survey/surveyFieldIds";
import { useFieldErrors } from "@/composables/useFieldErrors";
import FieldError from "@/components/ui/FieldError.vue";

const { t } = useI18n();

const props = withDefaults(
	defineProps<{
		ratingOptions: RatingOptions;
		questionId: string;
		disabled?: boolean;
	}>(),
	{
		disabled: false
	}
);

const { hasError, errorId } = useFieldErrors();

const optionsId = computed(() => questionFieldIds.options(props.questionId));
const ratingMinId = computed(() => questionFieldIds.ratingMin(props.questionId));
const ratingMaxId = computed(() => questionFieldIds.ratingMax(props.questionId));

// Das Minimum muss unter, das Maximum über dem jeweils anderen Wert liegen können
const minRange = { min: RATING_SCALE_MIN, max: RATING_SCALE_MAX - 1 };
const maxRange = { min: RATING_SCALE_MIN + 1, max: RATING_SCALE_MAX };

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
	<!-- Fokussierbarer Bereich: Ziel für Fehler, die die ganze Skala betreffen -->
	<div
		:id="optionsId"
		tabindex="-1"
		role="group"
		:aria-labelledby="`${optionsId}_label`"
		:aria-describedby="errorId(optionsId)"
		class="p-4 bg-[var(--p-surface-50)] rounded-xl border border-[var(--p-content-border-color)] space-y-3"
	>
		<div class="flex items-center justify-between">
			<span :id="`${optionsId}_label`" class="text-xs font-semibold text-[var(--p-text-color)]">
				{{ t("ratingOptions.scaleLabel", { min: RATING_SCALE_MIN, max: RATING_SCALE_MAX }) }}
			</span>
		</div>
		<FieldError :fieldId="optionsId" />

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
			<div>
				<label :for="ratingMinId" class="block text-xs font-medium mb-1">
					{{ t("ratingOptions.min", minRange) }}
				</label>
				<InputNumber
					:inputId="ratingMinId"
					v-model="ratingOptions.min_value"
					:min="minRange.min"
					:max="minRange.max"
					:useGrouping="false"
					inputClass="w-full"
					:disabled="disabled"
					:invalid="hasError(ratingMinId)"
					:pt="{ pcInputText: { root: { 'aria-describedby': errorId(ratingMinId) } } }"
				/>
				<FieldError :fieldId="ratingMinId" />
			</div>

			<div>
				<label :for="ratingMaxId" class="block text-xs font-medium mb-1">
					{{ t("ratingOptions.max", maxRange) }}
				</label>
				<InputNumber
					:inputId="ratingMaxId"
					v-model="ratingOptions.max_value"
					:min="maxRange.min"
					:max="maxRange.max"
					:useGrouping="false"
					inputClass="w-full"
					:disabled="disabled"
					:invalid="hasError(ratingMaxId)"
					:pt="{ pcInputText: { root: { 'aria-describedby': errorId(ratingMaxId) } } }"
				/>
				<FieldError :fieldId="ratingMaxId" />
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
			<!-- Labels der Skalenenden (nur im Web sichtbar) -->
			<div
				v-if="ratingOptions.min_label || ratingOptions.max_label"
				class="flex justify-between gap-4 mt-1 text-xs text-[var(--p-text-muted-color)]"
			>
				<span>{{ ratingOptions.min_label }}</span>
				<span class="text-right">{{ ratingOptions.max_label }}</span>
			</div>
		</div>
	</div>
</template>
