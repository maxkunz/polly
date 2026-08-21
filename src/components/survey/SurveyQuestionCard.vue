<script setup lang="ts">
import { computed } from "vue";
import Card from "primevue/card";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import InputNumber from "primevue/inputnumber";
import ToggleSwitch from "primevue/toggleswitch";
import Select from "primevue/select";
import Tag from "primevue/tag";
import { useConfirm } from "primevue/useconfirm";

import type {
	SurveyQuestion,
	QuestionType,
	RatingOptions,
	ChoiceOptions
} from "@/domain/survey/surveyTypes";
import {
	isRatingOptions,
	isChoiceOptions,
	createEmptyChoiceOption,
	ensureTechnicalName
} from "@/domain/survey/surveyTypes";
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

const confirm = useConfirm();

const questionTypes: { label: string; value: QuestionType; icon: string }[] = [
	{ label: "Bewertung (rating)", value: "rating", icon: "pi pi-star" },
	{ label: "Auswahl (choice)", value: "choice", icon: "pi pi-list" },
	{ label: "Ja / Nein (yes_no)", value: "yes_no", icon: "pi pi-check-circle" },
	{ label: "NPS (nps)", value: "nps", icon: "pi pi-chart-bar" },
	{ label: "Kommentar / Text (comment)", value: "comment", icon: "pi pi-comment" }
];

const currentTypeMeta = computed(() => {
	return questionTypes.find(t => t.value === props.question.type) ?? questionTypes[0];
});

const displayQuestionName = computed(() => {
	return ensureTechnicalName(props.question.name, props.question.title, props.question.id, "frage");
});

// Generated IDs for strict accessibility binding
const nameId = computed(() => `q_name_${props.question.id}`);
const typeId = computed(() => `q_type_${props.question.id}`);
const titleId = computed(() => `q_title_${props.question.id}`);
const descId = computed(() => `q_desc_${props.question.id}`);
const repromptId = computed(() => `q_reprompt_${props.question.id}`);
const mandatoryId = computed(() => `q_mandatory_${props.question.id}`);
const ratingMinId = computed(() => `q_rating_min_${props.question.id}`);
const ratingMaxId = computed(() => `q_rating_max_${props.question.id}`);

function handleTypeChange(newType: QuestionType) {
	props.question.type = newType;
	if (newType === "rating") {
		props.question.options = { min_value: 1, max_value: 5 };
	} else if (newType === "choice") {
		props.question.options = {
			labels: [
				{ id: crypto.randomUUID(), label: "Option 1" },
				{ id: crypto.randomUUID(), label: "Option 2" }
			]
		};
	} else {
		props.question.options = undefined;
	}
}

const ratingOptions = computed<RatingOptions>({
	get() {
		if (isRatingOptions(props.question.options)) {
			return props.question.options;
		}
		return { min_value: 1, max_value: 5 };
	},
	set(val) {
		props.question.options = val;
	}
});

const choiceOptions = computed<ChoiceOptions>({
	get() {
		if (isChoiceOptions(props.question.options)) {
			return props.question.options;
		}
		return {
			labels: [
				{ id: crypto.randomUUID(), label: "Option 1" },
				{ id: crypto.randomUUID(), label: "Option 2" }
			]
		};
	},
	set(val) {
		props.question.options = val;
	}
});

function addChoiceOption() {
	if (choiceOptions.value.labels.length < 5) {
		choiceOptions.value.labels.push(createEmptyChoiceOption());
	}
}

function removeChoiceOption(optIndex: number) {
	if (choiceOptions.value.labels.length > 2) {
		choiceOptions.value.labels.splice(optIndex, 1);
	}
}

function confirmDelete() {
	const qTitle = props.question.title?.trim() || `Frage #${props.index + 1}`;
	confirm.require({
		header: "Frage löschen",
		message: `Möchten Sie „${qTitle}“ und alle zugehörigen Folgefragen wirklich unwiderruflich löschen?`,
		icon: "pi pi-exclamation-triangle",
		acceptLabel: "Löschen",
		rejectLabel: "Abbrechen",
		acceptClass: "p-button-danger",
		accept: () => {
			emit("delete");
		}
	});
}

function getRatingScaleArray(): number[] {
	const min = ratingOptions.value.min_value ?? 1;
	const max = ratingOptions.value.max_value ?? 5;
	if (min > max) return [];
	const arr: number[] = [];
	for (let i = min; i <= max; i++) arr.push(i);
	return arr;
}
</script>

<template>
	<Card class="border border-[var(--p-content-border-color)] shadow-sm rounded-2xl overflow-hidden mb-6">
		<template #header>
			<div class="bg-[var(--p-surface-50)] px-4 py-3 border-b border-[var(--p-content-border-color)] flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<span
						class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--p-primary-500)] text-white font-bold text-xs"
						aria-label="Fragenummer"
					>
						{{ index + 1 }}
					</span>
					<div class="flex items-center gap-2">
						<Tag :value="currentTypeMeta.label" severity="info">
							<template #icon>
								<i :class="currentTypeMeta.icon" class="mr-1 text-xs" aria-hidden="true" />
							</template>
						</Tag>
						<Tag
							v-if="question.mandatory"
							value="Pflichtfeld"
							severity="warn"
							class="text-xs"
						/>
					</div>
				</div>

				<div class="flex items-center gap-1">
					<Button
						size="small"
						severity="secondary"
						variant="text"
						icon="pi pi-arrow-up"
						:aria-label="`Frage ${index + 1} nach oben verschieben`"
						:disabled="disabled || index === 0"
						@click="emit('move-up')"
					/>
					<Button
						size="small"
						severity="secondary"
						variant="text"
						icon="pi pi-arrow-down"
						:aria-label="`Frage ${index + 1} nach unten verschieben`"
						:disabled="disabled || index === totalQuestions - 1"
						@click="emit('move-down')"
					/>
					<Button
						size="small"
						severity="danger"
						variant="text"
						icon="pi pi-trash"
						label="Löschen"
						:aria-label="`Frage ${index + 1} löschen`"
						:disabled="disabled"
						@click="confirmDelete"
					/>
				</div>
			</div>
		</template>

		<template #content>
			<div class="space-y-4 pt-2">
				<!-- Header Row: Immutable Name, Question Type, Mandatory Toggle -->
				<div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
					<div class="md:col-span-4">
						<label :for="nameId" class="block text-xs font-medium text-[var(--p-text-muted-color)] mb-1">
							Technischer Bezeichner (Name)
							<span class="text-[10px] text-amber-600 block">(Unveränderbar für Reporting)</span>
						</label>
						<InputText
							:id="nameId"
							:modelValue="displayQuestionName"
							class="w-full text-xs font-mono bg-[var(--p-surface-100)] text-[var(--p-text-muted-color)]"
							disabled
							readonly
							:aria-describedby="`${nameId}_hint`"
						/>
						<span :id="`${nameId}_hint`" class="sr-only">Der Bezeichner wird für Reporting-Zwecke verwendet und kann nicht geändert werden.</span>
					</div>

					<div class="md:col-span-5">
						<label :for="typeId" class="block text-xs font-medium mb-1">
							Fragetyp <span class="text-red-500" aria-hidden="true">*</span>
							<span v-if="isSaved" class="text-[10px] text-amber-600 block">(Gespeichert - Typ unveränderbar)</span>
						</label>
						<Select
							:inputId="typeId"
							:modelValue="question.type"
							:options="questionTypes"
							optionLabel="label"
							optionValue="value"
							class="w-full"
							:disabled="disabled || isSaved"
							@update:modelValue="handleTypeChange"
						/>
					</div>

					<div class="md:col-span-3 flex flex-col justify-end">
						<div class="flex items-center gap-3 pt-4">
							<ToggleSwitch
								:inputId="mandatoryId"
								v-model="question.mandatory"
								:disabled="disabled"
							/>
							<label :for="mandatoryId" class="text-sm font-medium cursor-pointer">
								Pflichtfrage
							</label>
						</div>
					</div>
				</div>

				<!-- Question Title -->
				<div>
					<label :for="titleId" class="block text-sm font-medium mb-1">
						Fragetext / Titel <span class="text-red-500" aria-hidden="true">*</span>
					</label>
					<InputText
						:id="titleId"
						v-model="question.title"
						class="w-full"
						placeholder="z. B. Wie zufrieden sind Sie mit unserem Service?"
						:disabled="disabled"
						:invalid="showValidation && !question.title?.trim()"
						:aria-invalid="showValidation && !question.title?.trim()"
					/>
				</div>

				<!-- Description & Reprompt -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label :for="descId" class="block text-xs font-medium mb-1">
							Beschreibung / Hilfetext
						</label>
						<Textarea
							:id="descId"
							v-model="question.description"
							class="w-full text-sm"
							rows="2"
							autoResize
							placeholder="Ergänzende Hinweise für den Befragten..."
							:disabled="disabled"
						/>
					</div>

					<div>
						<label :for="repromptId" class="block text-xs font-medium mb-1">
							Wiederholungsaufforderung (Reprompt)
						</label>
						<Textarea
							:id="repromptId"
							v-model="question.reprompt_message"
							class="w-full text-sm"
							rows="2"
							autoResize
							placeholder="Bitte beantworten Sie diese Frage."
							:disabled="disabled"
						/>
					</div>
				</div>

				<!-- Type-Specific Options -->
				<!-- RATING -->
				<div
					v-if="question.type === 'rating'"
					class="p-4 bg-[var(--p-surface-50)] rounded-xl border border-[var(--p-content-border-color)] space-y-3"
				>
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-[var(--p-text-color)]">
							Bewertungsskala konfigurieren (0 bis max. 8):
						</span>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
						<div>
							<label :for="ratingMinId" class="block text-xs font-medium mb-1">
								Minimalwert (0 bis 7)
							</label>
							<InputNumber
								:inputId="ratingMinId"
								v-model="ratingOptions.min_value"
								:min="0"
								:max="7"
								:useGrouping="false"
								inputClass="w-full"
								:disabled="disabled"
							/>
						</div>

						<div>
							<label :for="ratingMaxId" class="block text-xs font-medium mb-1">
								Maximalwert (1 bis 8)
							</label>
							<InputNumber
								:inputId="ratingMaxId"
								v-model="ratingOptions.max_value"
								:min="1"
								:max="8"
								:useGrouping="false"
								inputClass="w-full"
								:disabled="disabled"
							/>
						</div>
					</div>

					<div class="pt-2">
						<span class="text-xs text-[var(--p-text-muted-color)] block mb-1">Vorschau der Skala:</span>
						<div class="flex flex-wrap gap-2">
							<span
								v-for="val in getRatingScaleArray()"
								:key="val"
								class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)] text-xs font-bold shadow-sm"
							>
								{{ val }}
							</span>
						</div>
					</div>
				</div>

				<!-- CHOICE -->
				<div
					v-else-if="question.type === 'choice'"
					class="p-4 bg-[var(--p-surface-50)] rounded-xl border border-[var(--p-content-border-color)] space-y-3"
				>
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-[var(--p-text-color)]">
							Auswahloptionen (2 bis max. 5 Optionen):
						</span>
						<Button
							size="small"
							severity="secondary"
							icon="pi pi-plus"
							label="Option hinzufügen"
							:disabled="disabled || choiceOptions.labels.length >= 5"
							@click="addChoiceOption"
						/>
					</div>

					<ul class="space-y-2" role="list">
						<li
							v-for="(opt, optIdx) in choiceOptions.labels"
							:key="opt.id"
							class="flex items-center gap-2"
						>
							<span class="w-6 text-xs text-[var(--p-text-muted-color)] font-medium text-right">
								{{ optIdx + 1 }}.
							</span>
							<label :for="`opt_${question.id}_${optIdx}`" class="sr-only">
								Option {{ optIdx + 1 }}
							</label>
							<InputText
								:id="`opt_${question.id}_${optIdx}`"
								v-model="opt.label"
								class="flex-1 text-sm"
								:placeholder="`Option ${optIdx + 1}`"
								:disabled="disabled"
								:invalid="showValidation && !opt.label?.trim()"
								:aria-invalid="showValidation && !opt.label?.trim()"
							/>
							<Button
								size="small"
								severity="danger"
								variant="text"
								icon="pi pi-times"
								:aria-label="`Option ${optIdx + 1} entfernen`"
								:disabled="disabled || choiceOptions.labels.length <= 2"
								@click="removeChoiceOption(optIdx)"
							/>
						</li>
					</ul>
				</div>

				<!-- NPS / YES_NO / COMMENT INFO HINTS -->
				<div
					v-else-if="question.type === 'nps'"
					class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center gap-2"
				>
					<i class="pi pi-info-circle text-sm" aria-hidden="true" />
					<span>Net Promoter Score verwendet eine standardisierte Skala von 0 (Sehr unwahrscheinlich) bis 10 (Sehr wahrscheinlich).</span>
				</div>

				<div
					v-else-if="question.type === 'yes_no'"
					class="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2"
				>
					<i class="pi pi-check-circle text-sm" aria-hidden="true" />
					<span>Ja / Nein Frage mit zwei standardisierten Antwortmöglichkeiten.</span>
				</div>

				<div
					v-else-if="question.type === 'comment'"
					class="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800 flex items-center gap-2"
				>
					<i class="pi pi-comment text-sm" aria-hidden="true" />
					<span>Offenes Freitextfeld für Rückmeldungen des Teilnehmers.</span>
				</div>

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
