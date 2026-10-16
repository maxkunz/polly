<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import InputText from "primevue/inputtext";
import { questionFieldIds } from "@/domain/survey/surveyFieldIds";
import { useFieldErrors } from "@/composables/useFieldErrors";
import FieldError from "@/components/ui/FieldError.vue";

// Optionale Labels für Minimal- und Maximalwert einer Skala (rating und nps), nur im Web sichtbar
const props = withDefaults(
	defineProps<{
		questionId: string;
		minLabel?: string;
		maxLabel?: string;
		disabled?: boolean;
	}>(),
	{
		minLabel: "",
		maxLabel: "",
		disabled: false
	}
);

const emit = defineEmits<{
	(e: "update:minLabel", value: string): void;
	(e: "update:maxLabel", value: string): void;
}>();

const { t } = useI18n();
const { hasError, errorId } = useFieldErrors();

const minId = computed(() => questionFieldIds.minLabel(props.questionId));
const maxId = computed(() => questionFieldIds.maxLabel(props.questionId));
const hintId = computed(() => `${minId.value}_hint`);

function describedBy(fieldId: string): string {
	return [hintId.value, errorId(fieldId)].filter(Boolean).join(" ");
}
</script>

<template>
	<div class="space-y-2">
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
			<div>
				<label :for="minId" class="block text-xs font-medium mb-1">
					{{ t("ratingOptions.minLabel") }}
				</label>
				<InputText
					:id="minId"
					:modelValue="minLabel"
					class="w-full text-sm"
					:placeholder="t('ratingOptions.minLabelPlaceholder')"
					:disabled="disabled"
					:invalid="hasError(minId)"
					:aria-describedby="describedBy(minId)"
					@update:modelValue="(value: string | undefined) => emit('update:minLabel', value ?? '')"
				/>
				<FieldError :fieldId="minId" />
			</div>

			<div>
				<label :for="maxId" class="block text-xs font-medium mb-1">
					{{ t("ratingOptions.maxLabel") }}
				</label>
				<InputText
					:id="maxId"
					:modelValue="maxLabel"
					class="w-full text-sm"
					:placeholder="t('ratingOptions.maxLabelPlaceholder')"
					:disabled="disabled"
					:invalid="hasError(maxId)"
					:aria-describedby="describedBy(maxId)"
					@update:modelValue="(value: string | undefined) => emit('update:maxLabel', value ?? '')"
				/>
				<FieldError :fieldId="maxId" />
			</div>
		</div>
		<p :id="hintId" class="text-[11px] text-[var(--p-text-muted-color)]">
			{{ t("ratingOptions.labelsHint") }}
		</p>
	</div>
</template>
