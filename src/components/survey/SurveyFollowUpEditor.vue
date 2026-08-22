<script setup lang="ts">
import { computed, toRef } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Select from "primevue/select";
import { useConfirm } from "primevue/useconfirm";
import type { FollowUpRule, SurveyQuestion, QuestionType } from "@/domain/survey/surveyTypes";
import { followUpQuestionTypes } from "@/domain/survey/questionTypeCatalog";
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

const {
	handleTypeChange,
	ratingOptions,
	choiceOptions,
	addChoiceOption,
	removeChoiceOption
} = useQuestionTypeOptions(toRef(() => props.followUp.question));

const titleId = computed(() => `q_title_${props.followUp.question.id}`);
const descId = computed(() => `fu_desc_${props.followUp.question.id}`);
const typeId = computed(() => `fu_type_${props.followUp.question.id}`);

function confirmDelete() {
	confirm.require({
		header: "Folgefrage löschen",
		message: "Möchten Sie diese Folgefrage wirklich entfernen?",
		icon: "pi pi-exclamation-triangle",
		acceptLabel: "Löschen",
		rejectLabel: "Abbrechen",
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
		:aria-label="`Folgefrage ${index + 1}`"
	>
		<legend class="text-xs font-semibold px-2 py-0.5 rounded-md bg-[var(--p-primary-50)] text-[var(--p-primary-700)] border border-[var(--p-primary-200)]">
			<i class="pi pi-arrow-elbow-down-right mr-1 text-[10px]" aria-hidden="true" />
			Folgefrage #{{ index + 1 }}
		</legend>

		<div class="flex items-center justify-between gap-2">
			<div class="text-xs text-[var(--p-text-muted-color)]">
				ID: <code class="font-mono">{{ followUp.question.id.slice(0, 8) }}...</code>
			</div>
			<Button
				size="small"
				severity="danger"
				variant="text"
				icon="pi pi-trash"
				label="Entfernen"
				:aria-label="`Folgefrage ${index + 1} löschen`"
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
						Titel der Folgefrage <span class="text-red-500" aria-hidden="true">*</span>
					</label>
					<InputText
						:id="titleId"
						v-model="followUp.question.title"
						class="w-full text-sm"
						placeholder="z. B. Was war der Grund für Ihre Bewertung?"
						:disabled="disabled"
						:invalid="showValidation && !followUp.question.title?.trim()"
						:aria-invalid="showValidation && !followUp.question.title?.trim()"
					/>
				</div>

				<div>
					<label :for="typeId" class="block text-xs font-medium mb-1">
						Fragetyp <span class="text-red-500" aria-hidden="true">*</span>
						<span v-if="isSaved" class="text-[10px] text-amber-600 block">(Gespeichert - Typ unveränderbar)</span>
					</label>
					<Select
						:inputId="typeId"
						:modelValue="followUp.question.type"
						:options="followUpQuestionTypes"
						optionLabel="label"
						optionValue="value"
						class="w-full text-sm"
						:disabled="disabled || isSaved"
						@update:modelValue="(val: QuestionType) => handleTypeChange(val)"
					/>
				</div>
			</div>

			<div>
				<label :for="descId" class="block text-xs font-medium mb-1">
					Beschreibung / Erläuterung
				</label>
				<Textarea
					:id="descId"
					v-model="followUp.question.description"
					class="w-full text-sm"
					rows="2"
					autoResize
					placeholder="Zusätzliche Erklärung für den Teilnehmer..."
					:disabled="disabled"
				/>
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
