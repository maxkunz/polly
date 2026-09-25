<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Select from "primevue/select";
import { useConfirm } from "primevue/useconfirm";
import type { FollowUpRule, SurveyQuestion, QuestionType } from "@/domain/survey/surveyTypes";
import { getFollowUpQuestionTypes } from "@/domain/survey/questionTypeCatalog";
import { useQuestionTypeOptions } from "@/composables/useQuestionTypeOptions";

import FollowUpConditionEditor from "./FollowUpConditionEditor.vue";
import RatingOptionsEditor from "./RatingOptionsEditor.vue";
import ChoiceOptionsEditor from "./ChoiceOptionsEditor.vue";
import QuestionTypeInfoHint from "./QuestionTypeInfoHint.vue";

const props = withDefaults(
	defineProps<{
		parentQuestion: SurveyQuestion;
		followUp: FollowUpRule;
		index: number;
		isSaved?: boolean;
		disabled?: boolean;
		showValidation?: boolean;
	}>(),
	{
		isSaved: false,
		disabled: false,
		showValidation: false
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
	addChoiceOption,
	removeChoiceOption
} = useQuestionTypeOptions(toRef(() => props.followUp.question));

const followUpQuestionTypeOptions = computed(() => getFollowUpQuestionTypes());

const titleId = computed(() => `q_title_${props.followUp.question.id}`);
const descId = computed(() => `fu_desc_${props.followUp.question.id}`);
const repromptId = computed(() => `fu_reprompt_${props.followUp.question.id}`);
const typeId = computed(() => `fu_type_${props.followUp.question.id}`);

function confirmDelete() {
	confirm.require({
		header: t("surveyFollowUp.deleteConfirm.header"),
		message: t("surveyFollowUp.deleteConfirm.message"),
		icon: "pi pi-exclamation-triangle",
		acceptLabel: t("surveyFollowUp.deleteConfirm.acceptLabel"),
		rejectLabel: t("surveyFollowUp.deleteConfirm.rejectLabel"),
		acceptClass: "p-button-danger",
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
				ID: <code class="font-mono">{{ followUp.question.name }}</code>
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
			:showValidation="showValidation"
		/>

		<!-- Question Details -->
		<div class="space-y-3">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
				<div class="md:col-span-2">
					<label :for="titleId" class="block text-xs font-medium mb-1">
						{{ t("surveyFollowUp.title") }} <span class="text-red-500" aria-hidden="true">*</span>
					</label>
					<InputText
						:id="titleId"
						v-model="followUp.question.title"
						class="w-full text-sm"
						:placeholder="t('surveyFollowUp.titlePlaceholder')"
						:disabled="disabled"
						:invalid="showValidation && !followUp.question.title?.trim()"
						:aria-invalid="showValidation && !followUp.question.title?.trim()"
					/>
				</div>

				<div>
					<label :for="typeId" class="block text-xs font-medium mb-1">
						{{ t("surveyFollowUp.type") }} <span class="text-red-500" aria-hidden="true">*</span>
						<span v-if="isSaved" class="text-[10px] text-amber-600 block">{{ t("surveyFollowUp.typeSavedHint") }}</span>
					</label>
					<Select
						:inputId="typeId"
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
					<Textarea
						:id="repromptId"
						v-model="followUp.question.reprompt_message"
						class="w-full text-sm"
						rows="2"
						autoResize
						:placeholder="t('surveyFollowUp.repromptPlaceholder')"
						:disabled="disabled"
					/>
				</div>

				<div>
					<label :for="descId" class="block text-xs font-medium mb-1">
						{{ t("surveyFollowUp.description") }}
					</label>
					<Textarea
						:id="descId"
						v-model="followUp.question.description"
						class="w-full text-sm"
						rows="2"
						autoResize
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
			:idPrefix="`fu_rating_${followUp.question.id}`"
			:disabled="disabled"
		/>

		<ChoiceOptionsEditor
			v-else-if="followUp.question.type === 'choice'"
			:choiceOptions="choiceOptions"
			:idPrefix="`fu_opt_${followUp.question.id}`"
			:disabled="disabled"
			:showValidation="showValidation"
			@add="addChoiceOption"
			@remove="removeChoiceOption"
		/>

		<QuestionTypeInfoHint v-else :type="followUp.question.type" />
	</fieldset>
</template>
