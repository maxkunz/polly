<script setup lang="ts">
import { computed } from "vue";
import Select from "primevue/select";
import InputNumber from "primevue/inputnumber";
import type {
	FollowUpRule,
	SurveyQuestion,
	ChoiceOptions
} from "@/domain/survey/surveyTypes";
import { isChoiceOptions } from "@/domain/survey/surveyTypes";
import { getOperatorOptions, booleanOptions } from "@/domain/survey/questionTypeCatalog";

const props = withDefaults(
	defineProps<{
		parentQuestion: SurveyQuestion;
		followUp: FollowUpRule;
		index: number;
		disabled?: boolean;
	}>(),
	{
		disabled: false
	}
);

const operatorOptions = computed(() => getOperatorOptions(props.parentQuestion.type));

const choiceOptionsList = computed(() => {
	if (props.parentQuestion.type === "choice" && isChoiceOptions(props.parentQuestion.options)) {
		return (props.parentQuestion.options as ChoiceOptions).labels.map(l => ({
			label: l.label || `Option (${l.id.slice(0, 6)})`,
			value: l.id
		}));
	}
	return [];
});

const conditionOpId = computed(() => `fu_cond_op_${props.parentQuestion.id}_${props.index}`);
const conditionValueId = computed(() => `fu_cond_val_${props.parentQuestion.id}_${props.index}`);
</script>

<template>
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
</template>
