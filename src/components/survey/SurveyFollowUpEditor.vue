<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import PromptTextarea from "@/components/ui/PromptTextarea.vue";
import Select from "primevue/select";
import { useConfirm } from "primevue/useconfirm";
import type { FollowUpRule, SurveyQuestion, QuestionType } from "@/domain/survey/surveyTypes";
import { getFollowUpQuestionTypes } from "@/domain/survey/questionTypeCatalog";
import { displayTechnicalName } from "@/domain/survey/surveyTypes";
import { useQuestionTypeOptions } from "@/composables/useQuestionTypeOptions";
import { useFieldErrors } from "@/composables/useFieldErrors";
import { questionFieldIds } from "@/domain/survey/surveyFieldIds";
import FieldError from "@/components/ui/FieldError.vue";

import FollowUpConditionEditor from "./FollowUpConditionEditor.vue";
import RatingOptionsEditor from "./RatingOptionsEditor.vue";
import ScaleLabelsEditor from "./ScaleLabelsEditor.vue";
import ChoiceOptionsEditor from "./ChoiceOptionsEditor.vue";
import QuestionTypeInfoHint from "./QuestionTypeInfoHint.vue";

const props = withDefaults(
	defineProps<{
		parentQuestion: SurveyQuestion;
		followUp: FollowUpRule;
		index: number;
		isSaved?: boolean;
		disabled?: boolean;
	}>(),
	{
		isSaved: false,
		disabled: false
	}
);

const emit = defineEmits<{
	(e: "remove"): void;
}>();

const confirm = useConfirm();
const { t } = useI18n();

const {
	handleTypeChange,
	ratingOptions,
	choiceOptions,
	scaleLabels,
	setScaleLabel,
	addChoiceOption,
	removeChoiceOption
} = useQuestionTypeOptions(toRef(() => props.followUp.question));

const followUpQuestionTypeOptions = computed(() => getFollowUpQuestionTypes());

const { hasError, errorId } = useFieldErrors();

// Wie bei Hauptfragen: gespeicherter Name unverändert, bei neuen Folgefragen Vorschau aus dem Titel
const displayName = computed(() => displayTechnicalName(props.followUp.question, props.isSaved, "frage"));

const titleId = computed(() => questionFieldIds.title(props.followUp.question.id));
const descId = computed(() => questionFieldIds.description(props.followUp.question.id));
const repromptId = computed(() => questionFieldIds.reprompt(props.followUp.question.id));
const typeId = computed(() => questionFieldIds.type(props.followUp.question.id));

function confirmDelete() {
	confirm.require({
		header: t("surveyFollowUp.deleteConfirm.header"),
		message: t("surveyFollowUp.deleteConfirm.message"),
		icon: "pi pi-exclamation-triangle",
		acceptLabel: t("surveyFollowUp.deleteConfirm.acceptLabel"),
		rejectLabel: t("surveyFollowUp.deleteConfirm.rejectLabel"),
		acceptClass: "p-button-danger",
		// Fokus auf "Abbrechen", damit Enter nicht versehentlich bestätigt (Barrierefreiheit)
		defaultFocus: "reject",
		accept: () => {
			emit("remove");
		}
	});
}
</script>

<template>
	<fieldset
		class="border border-[var(--p-primary-200)] bg-[var(--p-surface-0)] rounded-xl p-4 shadow-sm relative space-y-4"
		:aria-label="t('surveyFollowUp.fieldsetAriaLabel', { number: index + 1 })"
	>
		<legend class="text-xs font-semibold px-2 py-0.5 rounded-md bg-[var(--p-primary-50)] text-[var(--p-primary-700)] border border-[var(--p-primary-200)]">
			<i class="pi pi-arrow-elbow-down-right mr-1 text-[10px]" aria-hidden="true" />
			{{ t("surveyFollowUp.legend", { number: index + 1 }) }}
		</legend>

		<div class="flex items-center justify-between gap-2">
			<div class="text-xs text-[var(--p-text-muted-color)]">
				ID: <code class="font-mono">{{ displayName }}</code>
			</div>
			<Button
				size="small"
				severity="danger"
				variant="text"
				icon="pi pi-trash"
				:label="t('surveyFollowUp.delete')"
				:aria-label="t('surveyFollowUp.deleteAriaLabel', { number: index + 1 })"
				:disabled="disabled"
				@click="confirmDelete"
			/>
		</div>

		<!-- Condition Block -->
		<FollowUpConditionEditor
			:parentQuestion="parentQuestion"
			:followUp="followUp"
			:index="index"
			:disabled="disabled"
		/>

		<!-- Question Details -->
		<div class="space-y-3">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
				<div class="md:col-span-2">
					<label :for="titleId" class="block text-xs font-medium mb-1">
						{{ t("surveyFollowUp.title") }} <span class="text-red-700" aria-hidden="true">*</span>
					</label>
					<PromptTextarea
						:id="titleId"
						aria-required="true"
						v-model="followUp.question.title"
						ttsLimit
						class="text-sm"
						:placeholder="t('surveyFollowUp.titlePlaceholder')"
						:disabled="disabled"
						:invalid="hasError(titleId)"
						:aria-describedby="errorId(titleId)"
					/>
					<FieldError :fieldId="titleId" />
				</div>

				<div>
					<!-- Kein <label for>: Select rendert kein Formularelement, Verknüpfung über aria-labelledby -->
					<div :id="`${typeId}_label`" class="block text-xs font-medium mb-1">
						{{ t("surveyFollowUp.type") }} <span class="text-red-700" aria-hidden="true">*</span>
						<span v-if="isSaved" class="text-[11px] text-amber-700 block">{{ t("surveyFollowUp.typeSavedHint") }}</span>
					</div>
					<Select
						:inputId="typeId"
						:ariaLabelledby="`${typeId}_label`"
						:pt="{ label: { 'aria-required': 'true' } }"
						:modelValue="followUp.question.type"
						:options="followUpQuestionTypeOptions"
						optionLabel="label"
						optionValue="value"
						class="w-full text-sm"
						:disabled="disabled || isSaved"
						@update:modelValue="(val: QuestionType) => handleTypeChange(val)"
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div>
					<label :for="repromptId" class="block text-xs font-medium mb-1">
						{{ t("surveyFollowUp.reprompt") }}
					</label>
					<PromptTextarea
						:id="repromptId"
						v-model="followUp.question.reprompt_message"
						ttsLimit
						class="text-sm"
						:placeholder="t('surveyFollowUp.repromptPlaceholder')"
						:disabled="disabled"
						:invalid="hasError(repromptId)"
						:aria-describedby="errorId(repromptId)"
					/>
					<FieldError :fieldId="repromptId" />
				</div>

				<div>
					<label :for="descId" class="block text-xs font-medium mb-1">
						{{ t("surveyFollowUp.description") }}
					</label>
					<PromptTextarea
						:id="descId"
						v-model="followUp.question.description"
						class="text-sm"
						:placeholder="t('surveyFollowUp.descriptionPlaceholder')"
						:disabled="disabled"
					/>
				</div>
			</div>
		</div>

		<!-- Type-Specific Options -->
		<RatingOptionsEditor
			v-if="followUp.question.type === 'rating'"
			:ratingOptions="ratingOptions"
			:questionId="followUp.question.id"
			:disabled="disabled"
		/>

		<ChoiceOptionsEditor
			v-else-if="followUp.question.type === 'choice'"
			:choiceOptions="choiceOptions"
			:questionId="followUp.question.id"
			:disabled="disabled"
			@add="addChoiceOption"
			@remove="removeChoiceOption"
		/>

		<QuestionTypeInfoHint v-else :type="followUp.question.type" />

		<ScaleLabelsEditor
			v-if="followUp.question.type === 'rating' || followUp.question.type === 'nps'"
			:questionId="followUp.question.id"
			:minLabel="scaleLabels.min_label"
			:maxLabel="scaleLabels.max_label"
			:disabled="disabled"
			@update:minLabel="setScaleLabel('min_label', $event)"
			@update:maxLabel="setScaleLabel('max_label', $event)"
		/>
	</fieldset>
</template>
