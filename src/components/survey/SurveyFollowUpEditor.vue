<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import { useConfirm } from "primevue/useconfirm";
import type {
	FollowUpRule,
	SurveyQuestion,
	QuestionType,
	ConditionOperator,
	ChoiceOptions,
	RatingOptions
} from "@/domain/survey/surveyTypes";
import { isChoiceOptions, isRatingOptions } from "@/domain/survey/surveyTypes";

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

const questionTypes: { label: string; value: QuestionType }[] = [
	{ label: "Freitext / Kommentar (comment)", value: "comment" },
	{ label: "Bewertung (rating)", value: "rating" },
	{ label: "Ja / Nein (yes_no)", value: "yes_no" },
	{ label: "Auswahl (choice)", value: "choice" },
	{ label: "NPS (nps)", value: "nps" }
];

const operatorOptions = computed<{ label: string; value: ConditionOperator }[]>(() => {
	if (props.parentQuestion.type === "yes_no" || props.parentQuestion.type === "choice") {
		return [
			{ label: "ist gleich (equals)", value: "equals" },
			{ label: "ist ungleich (not_equals)", value: "not_equals" }
		];
	}
	return [
		{ label: "ist gleich (equals)", value: "equals" },
		{ label: "ist ungleich (not_equals)", value: "not_equals" },
		{ label: "ist kleiner als (less_than)", value: "less_than" },
		{ label: "ist größer als (greater_than)", value: "greater_than" },
		{ label: "ist kleiner oder gleich (less_than_or_equal)", value: "less_than_or_equal" },
		{ label: "ist größer oder gleich (greater_than_or_equal)", value: "greater_than_or_equal" }
	];
});

const choiceOptionsList = computed(() => {
	if (props.parentQuestion.type === "choice" && isChoiceOptions(props.parentQuestion.options)) {
		return (props.parentQuestion.options as ChoiceOptions).labels.map(l => ({
			label: l.label || `Option (${l.id.slice(0, 6)})`,
			value: l.id
		}));
	}
	return [];
});

const booleanOptions = [
	{ label: "Ja (true)", value: true },
	{ label: "Nein (false)", value: false }
];

const conditionValueId = computed(() => `fu_cond_val_${props.parentQuestion.id}_${props.index}`);
const conditionOpId = computed(() => `fu_cond_op_${props.parentQuestion.id}_${props.index}`);
const titleId = computed(() => `q_title_${props.followUp.question.id}`);
const descId = computed(() => `fu_desc_${props.followUp.question.id}`);
const typeId = computed(() => `fu_type_${props.followUp.question.id}`);

function handleTypeChange(newType: QuestionType) {
	props.followUp.question.type = newType;
	if (newType === "rating" && !isRatingOptions(props.followUp.question.options)) {
		props.followUp.question.options = { min_value: 1, max_value: 5 };
	} else if (newType === "choice" && !isChoiceOptions(props.followUp.question.options)) {
		props.followUp.question.options = {
			labels: [
				{ id: crypto.randomUUID(), label: "Option 1" },
				{ id: crypto.randomUUID(), label: "Option 2" }
			]
		};
	}
}

function confirmDelete() {
	confirm.require({
		header: "Folgefrage löschen",
		message: `Möchten Sie diese Folgefrage wirklich entfernen?`,
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
		<div class="p-3 bg-[var(--p-surface-50)] border border-[var(--p-content-border-color)] rounded-lg space-y-3">
			<div class="text-xs font-medium text-[var(--p-text-color)]">
				Bedingung zur Anzeige:
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div>
					<label :for="conditionOpId" class="block text-xs font-medium mb-1">
						Operator <span class="text-red-500" aria-hidden="true">*</span>
					</label>
					<Select
						:inputId="conditionOpId"
						v-model="followUp.condition.operator"
						:options="operatorOptions"
						optionLabel="label"
						optionValue="value"
						class="w-full text-xs"
						:disabled="disabled"
					/>
				</div>

				<div>
					<label :for="conditionValueId" class="block text-xs font-medium mb-1">
						Vergleichswert <span class="text-red-500" aria-hidden="true">*</span>
					</label>

					<!-- Boolean for yes_no -->
					<Select
						v-if="parentQuestion.type === 'yes_no'"
						:inputId="conditionValueId"
						v-model="followUp.condition.value"
						:options="booleanOptions"
						optionLabel="label"
						optionValue="value"
						class="w-full text-xs"
						:disabled="disabled"
					/>

					<!-- Options for choice -->
					<Select
						v-else-if="parentQuestion.type === 'choice'"
						:inputId="conditionValueId"
						v-model="followUp.condition.value"
						:options="choiceOptionsList"
						optionLabel="label"
						optionValue="value"
						placeholder="Wähle Option..."
						class="w-full text-xs"
						:disabled="disabled"
					/>

					<!-- Number for rating / nps -->
					<InputNumber
						v-else
						:inputId="conditionValueId"
						v-model="followUp.condition.value as number"
						inputClass="w-full text-xs"
						:useGrouping="false"
						:disabled="disabled"
					/>
				</div>
			</div>
		</div>

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
						:options="questionTypes"
						optionLabel="label"
						optionValue="value"
						class="w-full text-sm"
						:disabled="disabled || isSaved"
						@update:modelValue="handleTypeChange"
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
	</fieldset>
</template>
