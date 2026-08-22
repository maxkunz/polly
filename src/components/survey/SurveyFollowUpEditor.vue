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
import {
	isChoiceOptions,
	isRatingOptions,
	createEmptyChoiceOption
} from "@/domain/survey/surveyTypes";

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
const ratingMinId = computed(() => `fu_rating_min_${props.followUp.question.id}`);
const ratingMaxId = computed(() => `fu_rating_max_${props.followUp.question.id}`);

function handleTypeChange(newType: QuestionType) {
	props.followUp.question.type = newType;
	if (newType === "rating") {
		if (!isRatingOptions(props.followUp.question.options)) {
			props.followUp.question.options = { min_value: 1, max_value: 5 };
		}
	} else if (newType === "choice") {
		if (!isChoiceOptions(props.followUp.question.options)) {
			props.followUp.question.options = {
				labels: [
					{ id: crypto.randomUUID(), label: "Option 1" },
					{ id: crypto.randomUUID(), label: "Option 2" }
				]
			};
		}
	} else {
		props.followUp.question.options = undefined;
	}
}

const ratingOptions = computed<RatingOptions>({
	get() {
		if (isRatingOptions(props.followUp.question.options)) {
			return props.followUp.question.options;
		}
		return { min_value: 1, max_value: 5 };
	},
	set(val) {
		props.followUp.question.options = val;
	}
});

const choiceOptions = computed<ChoiceOptions>({
	get() {
		if (isChoiceOptions(props.followUp.question.options)) {
			return props.followUp.question.options;
		}
		return {
			labels: [
				{ id: crypto.randomUUID(), label: "Option 1" },
				{ id: crypto.randomUUID(), label: "Option 2" }
			]
		};
	},
	set(val) {
		props.followUp.question.options = val;
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

function getRatingScaleArray(): number[] {
	const min = ratingOptions.value.min_value ?? 1;
	const max = ratingOptions.value.max_value ?? 5;
	if (min > max) return [];
	const arr: number[] = [];
	for (let i = min; i <= max; i++) arr.push(i);
	return arr;
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

		<!-- Type-Specific Options -->
		<!-- RATING -->
		<div
			v-if="followUp.question.type === 'rating'"
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
			v-else-if="followUp.question.type === 'choice'"
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
					<label :for="`fu_opt_${followUp.question.id}_${optIdx}`" class="sr-only">
						Option {{ optIdx + 1 }}
					</label>
					<InputText
						:id="`fu_opt_${followUp.question.id}_${optIdx}`"
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
			v-else-if="followUp.question.type === 'nps'"
			class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center gap-2"
		>
			<i class="pi pi-info-circle text-sm" aria-hidden="true" />
			<span>Net Promoter Score verwendet eine standardisierte Skala von 0 (Sehr unwahrscheinlich) bis 10 (Sehr wahrscheinlich).</span>
		</div>

		<div
			v-else-if="followUp.question.type === 'yes_no'"
			class="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2"
		>
			<i class="pi pi-check-circle text-sm" aria-hidden="true" />
			<span>Ja / Nein Frage mit zwei standardisierten Antwortmöglichkeiten.</span>
		</div>

		<div
			v-else-if="followUp.question.type === 'comment'"
			class="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800 flex items-center gap-2"
		>
			<i class="pi pi-comment text-sm" aria-hidden="true" />
			<span>Offenes Freitextfeld für Rückmeldungen des Teilnehmers.</span>
		</div>
	</fieldset>
</template>

