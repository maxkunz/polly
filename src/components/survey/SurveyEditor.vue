<script setup lang="ts">
import { watch } from "vue";
import ConfirmDialog from "primevue/confirmdialog";

import type { Survey } from "@/domain/survey/surveyTypes";
import { useSurveyEditor } from "@/composables/useSurveyEditor";
import { useSurveySaveActions } from "@/composables/useSurveySaveActions";
import { DEFAULT_SURVEY_DATATABLE_ID } from "@/services/surveyService";

import SurveyEditorToolbar from "./SurveyEditorToolbar.vue";
import SurveyValidationSummary from "./SurveyValidationSummary.vue";
import SurveyMetaForm from "./SurveyMetaForm.vue";
import SurveyQuestionsSection from "./SurveyQuestionsSection.vue";
import SurveyStickySaveBar from "./SurveyStickySaveBar.vue";

const props = withDefaults(
	defineProps<{
		survey: Survey;
		datatableId?: string;
		surveyId: string;
		existingRow?: Record<string, any>;
		disabled?: boolean;
	}>(),
	{
		datatableId: DEFAULT_SURVEY_DATATABLE_ID,
		disabled: false
	}
);

const emit = defineEmits<{
	(e: "saved", updated: Survey): void;
	(e: "back"): void;
}>();

const {
	survey: draftSurvey,
	isDirty,
	isValid,
	validationErrors,
	totalQuestionsCount,
	canAddQuestion,
	isQuestionSaved,
	setSurvey,
	addQuestion,
	removeQuestion,
	moveQuestion,
	addFollowUp,
	removeFollowUp,
	reset,
	markClean
} = useSurveyEditor(props.survey);

watch(
	() => props.survey,
	newVal => {
		if (newVal) {
			setSurvey(newVal);
		}
	},
	{ deep: true }
);

const {
	isSaving,
	saveAttempted,
	handleSave,
	handleDiscard,
	handleBack
} = useSurveySaveActions({
	draftSurvey,
	isDirty,
	isValid,
	validationErrors,
	reset,
	markClean,
	datatableId: props.datatableId,
	surveyId: props.surveyId,
	existingRow: props.existingRow,
	emit
});
</script>

<template>
	<div v-if="draftSurvey" class="space-y-6">
		<ConfirmDialog />

		<!-- Top Action Header & Breadcrumb -->
		<SurveyEditorToolbar
			:isDirty="isDirty"
			:isSaving="isSaving"
			:version="draftSurvey.version"
			:disabled="disabled"
			@back="handleBack"
			@discard="handleDiscard"
			@save="handleSave"
		/>

		<!-- Validation Errors Summary -->
		<SurveyValidationSummary
			:show="saveAttempted && !isValid"
			:errors="validationErrors"
		/>

		<!-- Meta Section Card -->
		<SurveyMetaForm
			:survey="draftSurvey"
			:disabled="disabled"
			:saveAttempted="saveAttempted"
			@save="handleSave"
		/>

		<!-- Questions Section -->
		<SurveyQuestionsSection
			:questions="draftSurvey.questions"
			:totalQuestionsCount="totalQuestionsCount"
			:canAddQuestion="canAddQuestion"
			:isQuestionSaved="isQuestionSaved"
			:disabled="disabled"
			:showValidation="saveAttempted"
			@add-question="(type) => addQuestion(type)"
			@move-question="(qIdx, dir) => moveQuestion(qIdx, dir)"
			@remove-question="(id) => removeQuestion(id)"
			@add-follow-up="(id) => addFollowUp(id)"
			@remove-follow-up="(id, fuIdx) => removeFollowUp(id, fuIdx)"
		/>

		<!-- Bottom Sticky Save Bar -->
		<SurveyStickySaveBar
			:isDirty="isDirty"
			:isSaving="isSaving"
			:disabled="disabled"
			@back="handleBack"
			@save="handleSave"
		/>
	</div>
</template>
