<script setup lang="ts">
import { watch, onBeforeUnmount, toRef, computed } from "vue";
import { useI18n } from "vue-i18n";
import Message from "primevue/message";
import Button from "primevue/button";

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
import SurveySaveConflictDialog from "./SurveySaveConflictDialog.vue";

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
	/** Gespeicherter Stand wurde nach einem Speicherkonflikt neu geladen */
	(e: "reloaded", survey: Survey): void;
	(e: "back"): void;
	(e: "deploy"): void;
	(e: "report"): void;
	(e: "invite"): void;
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
	isSurveySaved,
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

const { markLockReleased, releaseLock, isLockReadOnly, conflictLockedBy, editAnyway } = useSurveyLock({
	surveyId: props.surveyId,
	existingRow,
	isDirty,
	isNew: props.isNew,
	readOnly: toRef(props, "disabled"),
	onBack: () => emit("back")
});

// Gesperrt durch fehlende Schreibrechte oder durch „Nur lesen“ im Lock-Konfliktdialog
const isReadOnly = computed(() => props.disabled || isLockReadOnly.value);

watch(
	() => props.survey,
	newVal => {
		if (newVal) {
			setSurvey(newVal);
		}
	},
	{ deep: true }
);

const { isSaving, isDeleting, saveAttempted, saveConflict, resolveConflict, save, discard, remove } = useSurveySaveActions({
	draftSurvey,
	isDirty,
	isValid,
	validationErrors,
	reset,
	markClean,
	setSurvey,
	onReloaded: async survey => {
		// Editor ist wieder unverändert – eigenes Lock wie beim Verwerfen freigeben
		await releaseLock();
		emit("reloaded", survey);
	},
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
		<Message v-else-if="isLockReadOnly" severity="warn" :closable="false">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<span>{{ t("surveyLock.readOnlyBanner", { user: conflictLockedBy }) }}</span>
				<Button
					:label="t('surveyLock.conflict.acceptLabel')"
					severity="danger"
					size="small"
					@click="editAnyway"
				/>
			</div>
		</Message>

		<!-- Top Action Header & Breadcrumb -->
		<SurveyEditorToolbar
			:isDirty="isDirty"
			:isSaving="isSaving"
			:isDeleting="isDeleting"
			:version="draftSurvey.version"
			:disabled="isReadOnly"
			:isNew="isNew"
			@back="emit('back')"
			@discard="handleDiscard"
			@save="handleSave"
			@deploy="emit('deploy')"
			@report="emit('report')"
			@invite="emit('invite')"
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
			:isSaved="isSurveySaved"
			:disabled="isReadOnly"
			@save="handleSave"
		/>

		<!-- Questions Section -->
		<SurveyQuestionsSection
			:questions="draftSurvey.questions"
			:totalQuestionsCount="totalQuestionsCount"
			:canAddQuestion="canAddQuestion"
			:isQuestionSaved="isQuestionSaved"
			:disabled="isReadOnly"
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
			:disabled="isReadOnly"
			@back="emit('back')"
			@save="handleSave"
		/>

		<SurveySaveConflictDialog :conflict="saveConflict" @choose="resolveConflict" />
	</div>
</template>
