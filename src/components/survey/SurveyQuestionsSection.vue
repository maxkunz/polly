<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";
import type { SurveyQuestion, QuestionType } from "@/domain/survey/surveyTypes";
import SurveyQuestionCard from "./SurveyQuestionCard.vue";

const props = withDefaults(
	defineProps<{
		questions: SurveyQuestion[];
		totalQuestionsCount: number;
		canAddQuestion: boolean;
		isQuestionSaved: (id: string) => boolean;
		disabled?: boolean;
		showValidation?: boolean;
	}>(),
	{
		disabled: false,
		showValidation: false
	}
);

const emit = defineEmits<{
	(e: "add-question", type?: QuestionType): void;
	(e: "move-question", index: number, direction: "up" | "down"): void;
	(e: "remove-question", id: string): void;
	(e: "add-follow-up", questionId: string): void;
	(e: "remove-follow-up", questionId: string, followUpIndex: number): void;
}>();

const toast = useToast();
const { t } = useI18n();

function handleAddNewQuestion(type: QuestionType = "yes_no") {
	if (!props.canAddQuestion) {
		toast.add({
			severity: "warn",
			summary: t("surveyQuestions.limitToast.summary"),
			detail: t("surveyQuestions.limitToast.detail"),
			life: 4000
		});
		return;
	}
	emit("add-question", type);
}
</script>

<template>
	<section aria-labelledby="questions-heading" class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<h3 id="questions-heading" class="text-base font-semibold text-[var(--p-text-color)]">
					{{ t("surveyQuestions.title") }}
				</h3>
				<div
					role="status"
					aria-live="polite"
					class="text-xs flex items-center gap-2 mt-0.5"
					:class="totalQuestionsCount >= 20 ? 'text-red-500 font-bold' : 'text-[var(--p-text-muted-color)]'"
				>
					<span>{{ t("surveyQuestions.countStatus", { count: totalQuestionsCount }) }}</span>
					<span v-if="totalQuestionsCount >= 20" class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
						{{ t("surveyQuestions.maxReached") }}
					</span>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<Button
					size="small"
					severity="primary"
					icon="pi pi-plus"
					:label="t('surveyQuestions.addQuestion')"
					:disabled="disabled || !canAddQuestion"
					:aria-label="t('surveyQuestions.addQuestionAriaLabel')"
					@click="handleAddNewQuestion()"
				/>
			</div>
		</div>

		<!-- Empty Questions State -->
		<div
			v-if="!questions || questions.length === 0"
			class="p-8 text-center bg-[var(--p-surface-0)] border border-dashed border-[var(--p-content-border-color)] rounded-2xl space-y-3"
		>
			<i class="pi pi-question-circle text-3xl text-[var(--p-text-muted-color)]" aria-hidden="true" />
			<div class="text-sm font-medium text-[var(--p-text-color)]">
				{{ t("surveyQuestions.empty.title") }}
			</div>
			<p class="text-xs text-[var(--p-text-muted-color)] max-w-sm mx-auto">
				{{ t("surveyQuestions.empty.description") }}
			</p>
			<Button
				size="small"
				severity="primary"
				icon="pi pi-plus"
				:label="t('surveyQuestions.empty.cta')"
				:disabled="disabled"
				@click="handleAddNewQuestion()"
			/>
		</div>

		<!-- Questions List -->
		<div v-else class="space-y-4" role="list">
			<SurveyQuestionCard
				v-for="(question, qIndex) in questions"
				:key="question.id"
				:question="question"
				:index="qIndex"
				:totalQuestions="questions.length"
				:canAddQuestion="canAddQuestion"
				:isSaved="isQuestionSaved(question.id)"
				:isQuestionSaved="isQuestionSaved"
				:disabled="disabled"
				:showValidation="showValidation"
				@move-up="emit('move-question', qIndex, 'up')"
				@move-down="emit('move-question', qIndex, 'down')"
				@delete="emit('remove-question', question.id)"
				@add-follow-up="emit('add-follow-up', question.id)"
				@remove-follow-up="(fuIdx) => emit('remove-follow-up', question.id, fuIdx)"
			/>

			<div class="flex items-center justify-end pt-2">
				<Button
					size="small"
					severity="primary"
					icon="pi pi-plus"
					:label="t('surveyQuestions.addQuestion')"
					:disabled="disabled || !canAddQuestion"
					:aria-label="t('surveyQuestions.addAnotherAriaLabel')"
					@click="handleAddNewQuestion()"
				/>
			</div>
		</div>
	</section>
</template>
