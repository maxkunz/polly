<script setup lang="ts">
import { toRef } from "vue";
import Card from "primevue/card";
import Button from "primevue/button";
import type { SurveyQuestion } from "@/domain/survey/surveyTypes";
import { useQuestionTypeOptions } from "@/composables/useQuestionTypeOptions";

import QuestionCardHeader from "./QuestionCardHeader.vue";
import QuestionBasicFields from "./QuestionBasicFields.vue";
import RatingOptionsEditor from "./RatingOptionsEditor.vue";
import ChoiceOptionsEditor from "./ChoiceOptionsEditor.vue";
import QuestionTypeInfoHint from "./QuestionTypeInfoHint.vue";
import SurveyFollowUpEditor from "./SurveyFollowUpEditor.vue";

const props = withDefaults(
	defineProps<{
		question: SurveyQuestion;
		index: number;
		totalQuestions: number;
		canAddQuestion: boolean;
		isSaved?: boolean;
		isQuestionSaved?: (id: string) => boolean;
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
	(e: "move-up"): void;
	(e: "move-down"): void;
	(e: "delete"): void;
	(e: "add-follow-up"): void;
	(e: "remove-follow-up", followUpIndex: number): void;
}>();

const {
	handleTypeChange,
	ratingOptions,
	choiceOptions,
	addChoiceOption,
	removeChoiceOption
} = useQuestionTypeOptions(toRef(() => props.question));
</script>

<template>
	<Card class="border border-[var(--p-content-border-color)] shadow-sm rounded-2xl overflow-hidden mb-6">
		<template #header>
			<QuestionCardHeader
				:question="question"
				:index="index"
				:totalQuestions="totalQuestions"
				:disabled="disabled"
				@move-up="emit('move-up')"
				@move-down="emit('move-down')"
				@delete="emit('delete')"
			/>
		</template>

		<template #content>
			<div class="space-y-4 pt-2">
				<!-- Basic Fields -->
				<QuestionBasicFields
					:question="question"
					:isSaved="isSaved"
					:disabled="disabled"
					:showValidation="showValidation"
					@type-change="handleTypeChange"
				/>

				<!-- Type-Specific Options -->
				<RatingOptionsEditor
					v-if="question.type === 'rating'"
					:ratingOptions="ratingOptions"
					:idPrefix="`q_rating_${question.id}`"
					:disabled="disabled"
				/>

				<ChoiceOptionsEditor
					v-else-if="question.type === 'choice'"
					:choiceOptions="choiceOptions"
					:idPrefix="`opt_${question.id}`"
					:disabled="disabled"
					:showValidation="showValidation"
					@add="addChoiceOption"
					@remove="removeChoiceOption"
				/>

				<QuestionTypeInfoHint v-else :type="question.type" />

				<!-- Follow-Up Section -->
				<div class="pt-4 border-t border-[var(--p-content-border-color)]">
					<div class="flex items-center justify-between mb-3">
						<div>
							<h4 class="text-xs font-bold uppercase tracking-wider text-[var(--p-text-muted-color)]">
								Bedingte Folgefragen ({{ question.follow_ups?.length ?? 0 }})
							</h4>
							<span class="text-[11px] text-[var(--p-text-muted-color)]">
								Wird nur angezeigt, wenn die definierte Antwortbedingung erfüllt ist.
							</span>
						</div>
						<Button
							size="small"
							severity="secondary"
							icon="pi pi-plus"
							label="Folgefrage hinzufügen"
							:disabled="disabled || !canAddQuestion"
							:aria-label="`Folgefrage zu Frage ${index + 1} hinzufügen`"
							@click="emit('add-follow-up')"
						/>
					</div>

					<div v-if="question.follow_ups && question.follow_ups.length > 0" class="space-y-3 pl-2 sm:pl-4 border-l-2 border-[var(--p-primary-200)]">
						<SurveyFollowUpEditor
							v-for="(fu, fuIdx) in question.follow_ups"
							:key="fu.question.id || fuIdx"
							:parentQuestion="question"
							:followUp="fu"
							:index="fuIdx"
							:isSaved="isQuestionSaved ? isQuestionSaved(fu.question.id) : false"
							:disabled="disabled"
							:showValidation="showValidation"
							@remove="emit('remove-follow-up', fuIdx)"
						/>
					</div>
				</div>
			</div>
		</template>
	</Card>
</template>
