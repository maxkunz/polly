<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Card from "primevue/card";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Tag from "primevue/tag";
import Message from "primevue/message";
import ConfirmDialog from "primevue/confirmdialog";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

import type { Survey, QuestionType } from "@/domain/survey/surveyTypes";
import {
	generateTechnicalName,
	ensureTechnicalName,
	ensureSurveyTechnicalNames
} from "@/domain/survey/surveyTypes";
import { useSurveyEditor } from "@/composables/useSurveyEditor";
import { saveSurveyDetail, DEFAULT_SURVEY_DATATABLE_ID } from "@/services/surveyService";
import SurveyQuestionCard from "./SurveyQuestionCard.vue";

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

const toast = useToast();
const confirm = useConfirm();

const isSaving = ref<boolean>(false);
const saveAttempted = ref<boolean>(false);

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

const surveyTitleId = "survey_title_input";
const surveyNameId = "survey_name_input";
const surveyDescId = "survey_desc_input";
const surveyGreetingId = "survey_greeting_input";
const surveyClosingId = "survey_closing_input";

const computedTechnicalName = computed(() => {
	if (!draftSurvey.value) return "";
	return ensureTechnicalName(draftSurvey.value.name, draftSurvey.value.title, draftSurvey.value.id, "umfrage");
});

function handleAddNewQuestion(type: QuestionType = "rating") {
	if (!canAddQuestion.value) {
		toast.add({
			severity: "warn",
			summary: "Limit erreicht",
			detail: "Eine Umfrage darf maximal 20 Fragen (inkl. Folgefragen) enthalten.",
			life: 4000
		});
		return;
	}
	const newQ = addQuestion(type);
	if (newQ) {
		toast.add({
			severity: "info",
			summary: "Frage hinzugefügt",
			detail: `Neue Frage (${type}) wurde am Ende eingefügt.`,
			life: 2500
		});
	}
}

async function handleSave() {
	saveAttempted.value = true;
	if (!isValid.value || !draftSurvey.value) {
		toast.add({
			severity: "error",
			summary: "Validierungsfehler",
			detail: "Bitte beheben Sie die markierten Fehler vor dem Speichern.",
			life: 5000
		});
		return;
	}

	ensureSurveyTechnicalNames(draftSurvey.value);

	isSaving.value = true;
	try {
		const updated = await saveSurveyDetail(
			props.datatableId,
			props.surveyId,
			draftSurvey.value,
			props.existingRow
		);
		markClean(updated);
		saveAttempted.value = false;

		toast.add({
			severity: "success",
			summary: "Erfolgreich gespeichert",
			detail: `Umfrage „${updated.title}“ wurde in der Data Table aktualisiert.`,
			life: 3500
		});

		emit("saved", updated);
	} catch (err: any) {
		console.error("Save survey error:", err);
		toast.add({
			severity: "error",
			summary: "Speicherfehler",
			detail: err?.message || "Fehler beim Speichern der Umfrage in der Data Table.",
			life: 5000
		});
	} finally {
		isSaving.value = false;
	}
}

function handleDiscard() {
	if (!isDirty.value) return;

	confirm.require({
		header: "Änderungen verwerfen",
		message: "Möchten Sie alle nicht gespeicherten Änderungen wirklich verwerfen?",
		icon: "pi pi-exclamation-triangle",
		acceptLabel: "Ja, verwerfen",
		rejectLabel: "Abbrechen",
		acceptClass: "p-button-warning",
		accept: () => {
			reset();
			saveAttempted.value = false;
			toast.add({
				severity: "info",
				summary: "Zurückgesetzt",
				detail: "Änderungen wurden verworfen.",
				life: 2500
			});
		}
	});
}

function handleBack() {
	if (isDirty.value) {
		confirm.require({
			header: "Ungespeicherte Änderungen",
			message: "Sie haben ungespeicherte Änderungen. Möchten Sie die Seite wirklich verlassen?",
			icon: "pi pi-exclamation-triangle",
			acceptLabel: "Verlassen",
			rejectLabel: "Bleiben",
			acceptClass: "p-button-danger",
			accept: () => {
				emit("back");
			}
		});
	} else {
		emit("back");
	}
}
</script>

<template>
	<div v-if="draftSurvey" class="space-y-6">
		<ConfirmDialog />

		<!-- Top Action Header & Breadcrumb -->
		<div class="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[var(--p-content-border-color)]">
			<div class="flex items-center gap-3">
				<Button
					size="small"
					severity="secondary"
					variant="text"
					icon="pi pi-arrow-left"
					label="Zurück zur Übersicht"
					aria-label="Zurück zur Umfragen-Übersicht"
					@click="handleBack"
				/>
				<Tag v-if="isDirty" value="Ungespeichert" severity="warn" />
				<Tag v-else value="Gespeichert" severity="success" />
				<Tag :value="`v${draftSurvey.version ?? 1}`" severity="info" />
			</div>

			<div class="flex items-center gap-2">
				<Button
					size="small"
					severity="secondary"
					icon="pi pi-refresh"
					label="Verwerfen"
					:disabled="!isDirty || isSaving || disabled"
					@click="handleDiscard"
				/>
				<Button
					size="small"
					severity="success"
					icon="pi pi-save"
					:loading="isSaving"
					label="Speichern"
					:disabled="disabled || !isDirty"
					@click="handleSave"
				/>
			</div>
		</div>

		<!-- Validation Errors Summary (if attempted or invalid) -->
		<div v-if="saveAttempted && !isValid" role="alert" aria-live="assertive">
			<Message severity="error" :closable="false">
				<div class="space-y-1">
					<div class="font-bold text-sm">Bitte beheben Sie folgende Fehler:</div>
					<ul class="list-disc list-inside text-xs space-y-0.5">
						<li v-for="(err, i) in validationErrors" :key="i">
							{{ err.message }}
						</li>
					</ul>
				</div>
			</Message>
		</div>

		<!-- Meta Section Card -->
		<Card class="border border-[var(--p-content-border-color)] shadow-sm rounded-2xl">
			<template #title>
				<h2 class="text-lg font-semibold text-[var(--p-text-color)]">
					Allgemeine Umfrageeinstellungen
				</h2>
			</template>
			<template #content>
				<form class="space-y-4" @submit.prevent="handleSave">
					<div class="grid grid-cols-1 md:grid-cols-12 gap-4">
						<div class="md:col-span-8">
							<label :for="surveyTitleId" class="block text-sm font-medium mb-1">
								Titel der Umfrage <span class="text-red-500" aria-hidden="true">*</span>
							</label>
							<InputText
								:id="surveyTitleId"
								v-model="draftSurvey.title"
								class="w-full"
								placeholder="z. B. Kundenzufriedenheit 2026"
								:disabled="disabled"
								:aria-invalid="!draftSurvey.title?.trim()"
							/>
						</div>

						<div class="md:col-span-4">
							<label :for="surveyNameId" class="block text-xs font-medium text-[var(--p-text-muted-color)] mb-1">
								Technischer Name (Automatisch aus Titel & ID)
							</label>
							<InputText
								:id="surveyNameId"
								:modelValue="computedTechnicalName"
								class="w-full text-xs font-mono bg-[var(--p-surface-100)] text-[var(--p-text-muted-color)]"
								disabled
								readonly
							/>
						</div>
					</div>

					<div>
						<label :for="surveyDescId" class="block text-sm font-medium mb-1">
							Beschreibung
						</label>
						<Textarea
							:id="surveyDescId"
							v-model="draftSurvey.description"
							class="w-full text-sm"
							rows="2"
							autoResize
							placeholder="Interne Beschreibung oder Kontext zur Umfrage..."
							:disabled="disabled"
						/>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label :for="surveyGreetingId" class="block text-sm font-medium mb-1">
								Begrüßungsnachricht (Greeting)
							</label>
							<Textarea
								:id="surveyGreetingId"
								v-model="draftSurvey.greeting_message"
								class="w-full text-sm"
								rows="2"
								autoResize
								placeholder="Vielen Dank, dass Sie sich kurz Zeit nehmen..."
								:disabled="disabled"
							/>
						</div>

						<div>
							<label :for="surveyClosingId" class="block text-sm font-medium mb-1">
								Verabschiedungsnachricht (Closing)
							</label>
							<Textarea
								:id="surveyClosingId"
								v-model="draftSurvey.closing_message"
								class="w-full text-sm"
								rows="2"
								autoResize
								placeholder="Vielen Dank für Ihr wertvolles Feedback!"
								:disabled="disabled"
							/>
						</div>
					</div>
				</form>
			</template>
		</Card>

		<!-- Questions Section -->
		<section aria-labelledby="questions-heading" class="space-y-4">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h3 id="questions-heading" class="text-base font-semibold text-[var(--p-text-color)]">
						Fragenkatalog
					</h3>
					<div
						role="status"
						aria-live="polite"
						class="text-xs flex items-center gap-2 mt-0.5"
						:class="totalQuestionsCount >= 20 ? 'text-red-500 font-bold' : 'text-[var(--p-text-muted-color)]'"
					>
						<span>{{ totalQuestionsCount }} von maximal 20 Fragen belegt (inkl. Folgefragen)</span>
						<span v-if="totalQuestionsCount >= 20" class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
							Maximum erreicht
						</span>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<Button
						size="small"
						severity="primary"
						icon="pi pi-plus"
						label="Frage hinzufügen"
						:disabled="disabled || !canAddQuestion"
						aria-label="Neue Frage zur Umfrage hinzufügen"
						@click="handleAddNewQuestion('rating')"
					/>
				</div>
			</div>

			<!-- Empty Questions State -->
			<div
				v-if="!draftSurvey.questions || draftSurvey.questions.length === 0"
				class="p-8 text-center bg-[var(--p-surface-0)] border border-dashed border-[var(--p-content-border-color)] rounded-2xl space-y-3"
			>
				<i class="pi pi-question-circle text-3xl text-[var(--p-text-muted-color)]" aria-hidden="true" />
				<div class="text-sm font-medium text-[var(--p-text-color)]">
					Diese Umfrage enthält noch keine Fragen.
				</div>
				<p class="text-xs text-[var(--p-text-muted-color)] max-w-sm mx-auto">
					Erstellen Sie Ihre erste Frage, um mit der Umfragekonfiguration zu beginnen.
				</p>
				<Button
					size="small"
					severity="primary"
					icon="pi pi-plus"
					label="Erste Frage erstellen"
					:disabled="disabled"
					@click="handleAddNewQuestion('rating')"
				/>
			</div>

			<!-- Questions List -->
			<div v-else class="space-y-4" role="list">
				<SurveyQuestionCard
					v-for="(question, qIndex) in draftSurvey.questions"
					:key="question.id"
					:question="question"
					:index="qIndex"
					:totalQuestions="draftSurvey.questions.length"
					:canAddQuestion="canAddQuestion"
					:isSaved="isQuestionSaved(question.id)"
					:isQuestionSaved="isQuestionSaved"
					:disabled="disabled"
					@move-up="moveQuestion(qIndex, 'up')"
					@move-down="moveQuestion(qIndex, 'down')"
					@delete="removeQuestion(question.id)"
					@add-follow-up="addFollowUp(question.id)"
					@remove-follow-up="(fuIdx) => removeFollowUp(question.id, fuIdx)"
				/>
			</div>
		</section>

		<!-- Bottom Sticky Save Bar for ease of access -->
		<div class="sticky bottom-4 z-20 bg-[var(--p-surface-0)]/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-[var(--p-content-border-color)] flex items-center justify-between gap-4">
			<div class="text-xs text-[var(--p-text-muted-color)]">
				<span v-if="isDirty" class="font-medium text-amber-600">
					● Ungespeicherte Änderungen vorhanden
				</span>
				<span v-else class="text-emerald-600">
					✓ Alle Änderungen gespeichert
				</span>
			</div>

			<div class="flex items-center gap-2">
				<Button
					size="small"
					severity="secondary"
					label="Zurück"
					icon="pi pi-arrow-left"
					@click="handleBack"
				/>
				<Button
					size="small"
					severity="success"
					icon="pi pi-save"
					:loading="isSaving"
					label="Umfrage speichern"
					:disabled="disabled || !isDirty"
					@click="handleSave"
				/>
			</div>
		</div>
	</div>
</template>
