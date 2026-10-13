<script setup lang="ts">
import { computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import type { ChoiceOptionLabel, ChoiceOptions } from "@/domain/survey/surveyTypes";
import { CHOICE_MIN_OPTIONS, CHOICE_MAX_OPTIONS } from "@/constants/surveyConstants";
import { questionFieldIds } from "@/domain/survey/surveyFieldIds";
import { useFieldErrors } from "@/composables/useFieldErrors";
import FieldError from "@/components/ui/FieldError.vue";

const { t } = useI18n();

const props = withDefaults(
	defineProps<{
		choiceOptions: ChoiceOptions;
		questionId: string;
		disabled?: boolean;
	}>(),
	{
		disabled: false
	}
);

const emit = defineEmits<{
	(e: "add"): void;
	(e: "remove", index: number): void;
}>();

const { hasError, errorId } = useFieldErrors();

const optionsId = computed(() => questionFieldIds.options(props.questionId));

function optionId(index: number): string {
	return questionFieldIds.choiceOption(props.questionId, index);
}

// Rohtext je Option (nach id), damit während der Eingabe nichts (z. B. ein
// trennendes Komma am Ende) durch das Neuformatieren aus opt.label/opt.synonyms
// überschrieben wird.
const rawInputByOptionId = reactive<Record<string, string>>({});

function formatOptionInput(opt: ChoiceOptionLabel): string {
	return [opt.label, ...(opt.synonyms ?? [])].join(", ");
}

function getOptionInput(opt: ChoiceOptionLabel): string {
	return rawInputByOptionId[opt.id] ?? formatOptionInput(opt);
}

function updateOptionInput(opt: ChoiceOptionLabel, value: string | undefined): void {
	const text = value ?? "";
	rawInputByOptionId[opt.id] = text;
	const parts = text.split(",").map(part => part.trim());
	opt.label = parts[0] ?? "";
	const synonyms = parts.slice(1).filter(part => part.length > 0);
	if (synonyms.length > 0) {
		opt.synonyms = synonyms;
	} else {
		delete opt.synonyms;
	}
}
</script>

<template>
	<!-- Fokussierbarer Bereich: Ziel für Fehler, die alle Optionen betreffen (z. B. deren Anzahl) -->
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
				{{ t("choiceOptions.label", { min: CHOICE_MIN_OPTIONS, max: CHOICE_MAX_OPTIONS }) }}
			</span>
			<Button
				size="small"
				severity="secondary"
				icon="pi pi-plus"
				:label="t('choiceOptions.add')"
				:disabled="disabled || choiceOptions.labels.length >= CHOICE_MAX_OPTIONS"
				@click="emit('add')"
			/>
		</div>
		<FieldError :fieldId="optionsId" />
		<p class="text-xs text-[var(--p-text-muted-color)]">
			{{ t("choiceOptions.hint") }}
		</p>

		<ul class="space-y-2" role="list">
			<li
				v-for="(opt, optIdx) in choiceOptions.labels"
				:key="opt.id"
				class="space-y-1"
			>
				<div class="flex items-center gap-2">
					<span class="w-6 text-xs text-[var(--p-text-muted-color)] font-medium text-right">
						{{ optIdx + 1 }}.
					</span>
					<label :for="optionId(optIdx)" class="sr-only">
						{{ t("choiceOptions.optionSrLabel", { number: optIdx + 1 }) }}
					</label>
					<InputText
						:id="optionId(optIdx)"
						:model-value="getOptionInput(opt)"
						@update:model-value="value => updateOptionInput(opt, value)"
						class="flex-1 text-sm"
						:placeholder="t('choiceOptions.optionPlaceholder', { number: optIdx + 1 })"
						:disabled="disabled"
						:invalid="hasError(optionId(optIdx))"
						:aria-describedby="errorId(optionId(optIdx))"
					/>
					<Button
						size="small"
						severity="danger"
						variant="text"
						icon="pi pi-times"
						:aria-label="t('choiceOptions.removeAriaLabel', { number: optIdx + 1 })"
						:disabled="disabled || choiceOptions.labels.length <= CHOICE_MIN_OPTIONS"
						@click="emit('remove', optIdx)"
					/>
				</div>
				<FieldError :fieldId="optionId(optIdx)" class="ml-8" />
			</li>
		</ul>
	</div>
</template>
