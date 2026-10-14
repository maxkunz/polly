<script setup lang="ts">
import { watch, onBeforeUnmount, toRef } from "vue";
import { useI18n } from "vue-i18n";
import Message from "primevue/message";

import type { Survey } from "@/domain/survey/surveyTypes";
import { cloneSurvey } from "@/domain/survey/surveyTypes";
import { useSurveyEditor } from "@/composables/useSurveyEditor";
import { useSurveySaveActions } from "@/composables/useSurveySaveActions";
import { useSurveyLock } from "@/composables/useSurveyLock";
import { useFlowPayloadSize } from "@/composables/useFlowPayloadSize";
import { provideFieldErrors } from "@/composables/useFieldErrors";

import SurveyEditorToolbar from "./SurveyEditorToolbar.vue";
import SurveyValidationSummary from "./SurveyValidationSummary.vue";
import SurveyFlowSizeHint from "./SurveyFlowSizeHint.vue";
import SurveyMetaForm from "./SurveyMetaForm.vue";
import SurveyQuestionsSection from "./SurveyQuestionsSection.vue";
import SurveyStickySaveBar from "./SurveyStickySaveBar.vue";

const props = withDefaults(
	defineProps<{
		survey: Survey;
		surveyId: string;
		disabled?: boolean;
		isNew?: boolean;
	}>(),
	{
		disabled: false,
		isNew: false
	}
);

/**
 * Rohzeile der Umfrage (Draft/Stage/Prod/Backup/lock). Lock und Speichern aktualisieren sie;
 * per v-model:existingRow bleibt die Seite auf demselben Stand. Bei neuen Umfragen ohne Bindung lokal.
 */
const existingRow = defineModel<Record<string, any> | null>("existingRow", { default: null });

const emit = defineEmits<{
	(e: "saved", updated: Survey): void;
	(e: "back"): void;
	(e: "deploy"): void;
	(e: "report"): void;
	(e: "deleted"): void;
	(e: "clone", clonedSurvey: Survey): void;
	(e: "update:isDirty", isDirty: boolean): void;
}>();

const { t } = useI18n();

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

const flowPayloadSize = useFlowPayloadSize(draftSurvey);

const { markLockReleased, releaseLock } = useSurveyLock({
	surveyId: props.surveyId,
	existingRow,
	isDirty,
	isNew: props.isNew,
	readOnly: toRef(props, "disabled"),
	onBack: () => emit("back")
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

const { isSaving, isDeleting, saveAttempted, save, discard, remove } = useSurveySaveActions({
	draftSurvey,
	isDirty,
	isValid,
	validationErrors,
	reset,
	markClean,
	surveyId: props.surveyId,
	existingRow,
	isNew: props.isNew
});

// Alle Formularfelder lesen ihre Fehler hieraus (erst nach dem ersten Speicherversuch sichtbar)
provideFieldErrors(validationErrors, saveAttempted);

async function handleSave(): Promise<void> {
	const updated = await save();
	if (!updated) return;
	// Speichern gibt das Lock in der Data Table frei
	markLockReleased();
	emit("saved", updated);
}

async function handleDiscard(): Promise<void> {
	if (await discard()) {
		await releaseLock();
	}
}

async function handleDelete(): Promise<void> {
	if (await remove()) {
		emit("deleted");
	}
}

watch(
	isDirty,
	val => {
		emit("update:isDirty", val);
	},
	{ immediate: true }
);

onBeforeUnmount(() => {
	emit("update:isDirty", false);
});

function handleClone() {
	if (!draftSurvey.value) return;
	const cloned = cloneSurvey(draftSurvey.value);
	emit("clone", cloned);
}
</script>

<template>
	<div v-if="draftSurvey" class="space-y-6">
		<Message v-if="disabled" severity="info" :closable="false">
			{{ t("permissions.readOnlyBanner") }}
		</Message>

		<!-- Top Action Header & Breadcrumb -->
		<SurveyEditorToolbar
			:isDirty="isDirty"
			:isSaving="isSaving"
			:isDeleting="isDeleting"
			:version="draftSurvey.version"
			:disabled="disabled"
			:isNew="isNew"
			@back="emit('back')"
			@discard="handleDiscard"
			@save="handleSave"
			@deploy="emit('deploy')"
			@report="emit('report')"
			@delete="handleDelete"
			@clone="handleClone"
		/>

		<!-- Validation Errors Summary -->
		<SurveyValidationSummary
			:show="saveAttempted && !isValid"
			:errors="validationErrors"
		/>

		<!-- Hinweis zur Gesamttextmenge (Architect-Budget des Flow-JSON) -->
		<SurveyFlowSizeHint :size="flowPayloadSize" />

		<!-- Meta Section Card -->
		<SurveyMetaForm
			:survey="draftSurvey"
			:disabled="disabled"
			@save="handleSave"
		/>

		<!-- Questions Section -->
		<SurveyQuestionsSection
			:questions="draftSurvey.questions"
			:totalQuestionsCount="totalQuestionsCount"
			:canAddQuestion="canAddQuestion"
			:isQuestionSaved="isQuestionSaved"
			:disabled="disabled"
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
			@back="emit('back')"
			@save="handleSave"
		/>
	</div>
</template>
