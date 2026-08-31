<script setup lang="ts">
import { ref, watch } from "vue";
import ConfirmDialog from "primevue/confirmdialog";

import type { Survey } from "@/domain/survey/surveyTypes";
import { cloneSurvey } from "@/domain/survey/surveyTypes";
import { useSurveyEditor } from "@/composables/useSurveyEditor";
import { useSurveySaveActions } from "@/composables/useSurveySaveActions";
import { useSurveyLock } from "@/composables/useSurveyLock";

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
		isNew?: boolean;
	}>(),
	{
		datatableId: undefined,
		disabled: false,
		isNew: false
	}
);

const emit = defineEmits<{
	(e: "saved", updated: Survey, freshRow?: Record<string, any>): void;
	(e: "back"): void;
	(e: "deploy"): void;
	(e: "deleted"): void;
	(e: "clone", clonedSurvey: Survey): void;
}>();

const existingRowRef = ref<Record<string, any> | null>(props.existingRow ?? null);

watch(
	() => props.existingRow,
	newVal => {
		existingRowRef.value = newVal ?? null;
	},
	{ deep: true }
);

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

const {
	isLockedByMe,
	markLockReleased,
	releaseLock
} = useSurveyLock({
	datatableId: props.datatableId,
	surveyId: props.surveyId,
	existingRow: existingRowRef,
	isDirty,
	isNew: props.isNew,
	onRowRefreshed: freshRow => {
		existingRowRef.value = freshRow;
	},
	onBack: () => {
		emit("back");
	}
});

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
	isDeleting,
	saveAttempted,
	handleSave,
	handleDiscard,
	handleDelete,
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
	existingRow: existingRowRef,
	isNew: props.isNew,
	onRowRefreshed: freshRow => {
		existingRowRef.value = freshRow;
	},
	onSaved: () => {
		markLockReleased();
	},
	onDiscarded: () => {
		releaseLock();
	},
	emit
});

function handleClone() {
	if (!draftSurvey.value) return;
	const cloned = cloneSurvey(draftSurvey.value);
	emit("clone", cloned);
}
</script>

<template>
	<div v-if="draftSurvey" class="space-y-6">
		<ConfirmDialog />

		<!-- Top Action Header & Breadcrumb -->
		<SurveyEditorToolbar
			:isDirty="isDirty"
			:isSaving="isSaving"
			:isDeleting="isDeleting"
			:version="draftSurvey.version"
			:disabled="disabled"
			:isNew="isNew"
			@back="handleBack"
			@discard="handleDiscard"
			@save="handleSave"
			@deploy="emit('deploy')"
			@delete="handleDelete"
			@clone="handleClone"
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
