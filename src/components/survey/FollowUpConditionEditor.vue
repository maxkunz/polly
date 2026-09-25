<script setup lang="ts">
import { computed, watch } from "vue";
import Select from "primevue/select";
import InputNumber from "primevue/inputnumber";
import type {
	FollowUpRule,
	SurveyQuestion,
	ChoiceOptions,
	ConditionOperator
} from "@/domain/survey/surveyTypes";
import { isChoiceOptions } from "@/domain/survey/surveyTypes";
import { getOperatorOptions, booleanOptions } from "@/domain/survey/questionTypeCatalog";
import {
	findDuplicateFollowUpOperators,
	findDuplicateChoiceFollowUpValues
} from "@/domain/survey/surveyValidator";

const props = withDefaults(
	defineProps<{
		parentQuestion: SurveyQuestion;
		followUp: FollowUpRule;
		index: number;
		disabled?: boolean;
		showValidation?: boolean;
	}>(),
	{
		disabled: false,
		showValidation: false
	}
);

const isChoiceParent = computed(() => props.parentQuestion.type === "choice");

// Bei choice gibt es nur den Operator "equals" und dieser darf - anders als bei
// rating/nps - mehrfach verwendet werden, da jede Folgefrage an eine andere
// Auswahloption gebunden ist. Die Operator-Auswahl entfällt daher im UI.
watch(
	() => props.parentQuestion.type,
	type => {
		if (type === "choice" && props.followUp.condition.operator !== "equals") {
			props.followUp.condition.operator = "equals";
		}
	},
	{ immediate: true }
);

const usedOperatorsBySiblings = computed(() => {
	const used = new Set<ConditionOperator>();
	if (isChoiceParent.value) return used;
	(props.parentQuestion.follow_ups || []).forEach((fu, idx) => {
		if (idx !== props.index && fu.condition?.operator) {
			used.add(fu.condition.operator);
		}
	});
	return used;
});

const operatorOptions = computed(() =>
	getOperatorOptions(props.parentQuestion.type).map(opt => ({
		...opt,
		disabled: usedOperatorsBySiblings.value.has(opt.value)
	}))
);

const duplicateOperatorMessage = computed(() => {
	const duplicates = findDuplicateFollowUpOperators(
		props.parentQuestion.type,
		props.parentQuestion.follow_ups || []
	);
	const firstIdx = duplicates.get(props.index);
	if (firstIdx === undefined) return undefined;
	return `Der Komparator wird bereits von Folgefrage ${firstIdx + 1} verwendet.`;
});

const usedChoiceValuesBySiblings = computed(() => {
	const used = new Set<unknown>();
	if (!isChoiceParent.value) return used;
	(props.parentQuestion.follow_ups || []).forEach((fu, idx) => {
		if (idx !== props.index && fu.condition?.value !== undefined && fu.condition?.value !== "") {
			used.add(fu.condition.value);
		}
	});
	return used;
});

const choiceOptionsList = computed(() => {
	if (props.parentQuestion.type === "choice" && isChoiceOptions(props.parentQuestion.options)) {
		return (props.parentQuestion.options as ChoiceOptions).labels.map(l => ({
			label: l.label || `Option (${l.id.slice(0, 6)})`,
			value: l.id,
			disabled: usedChoiceValuesBySiblings.value.has(l.id)
		}));
	}
	return [];
});

const duplicateChoiceValueMessage = computed(() => {
	if (!isChoiceParent.value) return undefined;
	const duplicates = findDuplicateChoiceFollowUpValues(
		props.parentQuestion.type,
		props.parentQuestion.follow_ups || []
	);
	const firstIdx = duplicates.get(props.index);
	if (firstIdx === undefined) return undefined;
	return `Diese Option wird bereits von Folgefrage ${firstIdx + 1} verwendet.`;
});

const conditionOpId = computed(() => `fu_cond_op_${props.parentQuestion.id}_${props.index}`);
const conditionValueId = computed(() => `fu_cond_val_${props.parentQuestion.id}_${props.index}`);
</script>

<template>
	<div class="p-3 bg-[var(--p-surface-50)] border border-[var(--p-content-border-color)] rounded-lg space-y-3">
		<div class="text-xs font-medium text-[var(--p-text-color)]">
			Bedingung zur Anzeige:
		</div>

		<div class="grid grid-cols-1 gap-3" :class="isChoiceParent ? '' : 'md:grid-cols-2'">
			<div v-if="!isChoiceParent">
				<label :for="conditionOpId" class="block text-xs font-medium mb-1">
					Operator <span class="text-red-500" aria-hidden="true">*</span>
				</label>
				<Select
					:inputId="conditionOpId"
					v-model="followUp.condition.operator"
					:options="operatorOptions"
					optionLabel="label"
					optionValue="value"
					optionDisabled="disabled"
					class="w-full text-xs"
					:disabled="disabled"
					:invalid="showValidation && !!duplicateOperatorMessage"
					:aria-invalid="showValidation && !!duplicateOperatorMessage"
					:aria-describedby="showValidation && duplicateOperatorMessage ? `${conditionOpId}_dup` : undefined"
				/>
				<small
					v-if="showValidation && duplicateOperatorMessage"
					:id="`${conditionOpId}_dup`"
					class="block mt-1 text-xs text-red-500"
				>
					{{ duplicateOperatorMessage }}
				</small>
			</div>

			<div>
				<label :for="conditionValueId" class="block text-xs font-medium mb-1">
					<template v-if="isChoiceParent">Antwort entspricht Option</template>
					<template v-else>Vergleichswert</template>
					<span class="text-red-500" aria-hidden="true">*</span>
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
				<template v-else-if="parentQuestion.type === 'choice'">
					<Select
						:inputId="conditionValueId"
						v-model="followUp.condition.value"
						:options="choiceOptionsList"
						optionLabel="label"
						optionValue="value"
						optionDisabled="disabled"
						placeholder="Wähle Option..."
						class="w-full text-xs"
						:disabled="disabled"
						:invalid="showValidation && !!duplicateChoiceValueMessage"
						:aria-invalid="showValidation && !!duplicateChoiceValueMessage"
						:aria-describedby="showValidation && duplicateChoiceValueMessage ? `${conditionValueId}_dup` : undefined"
					/>
					<small
						v-if="showValidation && duplicateChoiceValueMessage"
						:id="`${conditionValueId}_dup`"
						class="block mt-1 text-xs text-red-500"
					>
						{{ duplicateChoiceValueMessage }}
					</small>
				</template>

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
</template>
