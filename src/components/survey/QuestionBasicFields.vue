<script setup lang="ts">
import { computed } from "vue";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import Select from "primevue/select";
import type { SurveyQuestion, QuestionType } from "@/domain/survey/surveyTypes";
import { ensureTechnicalName } from "@/domain/survey/surveyTypes";
import { questionTypes } from "@/domain/survey/questionTypeCatalog";

const props = withDefaults(
	defineProps<{
		question: SurveyQuestion;
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
	(e: "type-change", newType: QuestionType): void;
}>();

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
</script>

<template>
	<div class="space-y-4">
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
					@update:modelValue="(val: QuestionType) => emit('type-change', val)"
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
					placeholder="Zweite Aufforderung zur Beantwortung der Frage (optional)."
					:disabled="disabled"
				/>
			</div>
		</div>
	</div>
</template>
