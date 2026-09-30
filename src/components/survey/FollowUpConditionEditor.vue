<script setup lang="ts">
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import Select from "primevue/select";
import InputNumber from "primevue/inputnumber";
import type {
	FollowUpRule,
	SurveyQuestion,
	ChoiceOptions,
	ConditionOperator
} from "@/domain/survey/surveyTypes";
import { isChoiceOptions } from "@/domain/survey/surveyTypes";
import { getOperatorOptions, getBooleanOptions } from "@/domain/survey/questionTypeCatalog";
import {
	findDuplicateFollowUpOperators,
	findDuplicateFollowUpValues
} from "@/domain/survey/surveyValidator";

const { t } = useI18n();

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

// Bei choice und yes_no gibt es nur den Operator "equals" und dieser darf - anders
// als bei rating/nps - mehrfach verwendet werden, da jede Folgefrage an einen
// anderen möglichen Antwortwert (Auswahloption bzw. ja/nein) gebunden ist. Die
// Operator-Auswahl entfällt daher im UI.
const hasSingleOperator = computed(() => getOperatorOptions(props.parentQuestion.type).length === 1);

watch(
	() => props.parentQuestion.type,
	type => {
		const options = getOperatorOptions(type);
		if (options.length === 1 && props.followUp.condition.operator !== options[0].value) {
			props.followUp.condition.operator = options[0].value;
		}
	},
	{ immediate: true }
);

const usedOperatorsBySiblings = computed(() => {
	const used = new Set<ConditionOperator>();
	if (hasSingleOperator.value) return used;
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
	return t("surveyCondition.operatorDuplicate", { number: firstIdx + 1 });
});

// Bei choice und yes_no darf jeder mögliche Antwortwert (Auswahloption bzw.
// ja/nein) nur einmal als Folgefragen-Bedingung verwendet werden.
const usedValuesBySiblings = computed(() => {
	const used = new Set<unknown>();
	if (!hasSingleOperator.value) return used;
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
			label: l.label || t("surveyCondition.unnamedOption", { id: l.id.slice(0, 6) }),
			value: l.id,
			disabled: usedValuesBySiblings.value.has(l.id)
		}));
	}
	return [];
});

const booleanOptions = computed(() =>
	getBooleanOptions().map(opt => ({
		...opt,
		disabled: usedValuesBySiblings.value.has(opt.value)
	}))
);

const duplicateValueMessage = computed(() => {
	if (!hasSingleOperator.value) return undefined;
	const duplicates = findDuplicateFollowUpValues(
		props.parentQuestion.type,
		props.parentQuestion.follow_ups || []
	);
	const firstIdx = duplicates.get(props.index);
	if (firstIdx === undefined) return undefined;
	return t("surveyCondition.valueDuplicate", { number: firstIdx + 1 });
});

const conditionOpId = computed(() => `fu_cond_op_${props.parentQuestion.id}_${props.index}`);
const conditionValueId = computed(() => `fu_cond_val_${props.parentQuestion.id}_${props.index}`);
</script>

<template>
	<div class="p-3 bg-[var(--p-surface-50)] border border-[var(--p-content-border-color)] rounded-lg space-y-3">
		<div class="text-xs font-medium text-[var(--p-text-color)]">
			{{ t("surveyCondition.label") }}
		</div>

		<div class="grid grid-cols-1 gap-3" :class="hasSingleOperator ? '' : 'md:grid-cols-2'">
			<div v-if="!hasSingleOperator">
				<label :for="conditionOpId" class="block text-xs font-medium mb-1">
					{{ t("surveyCondition.operator") }} <span class="text-red-500" aria-hidden="true">*</span>
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
					<template v-if="isChoiceParent">{{ t("surveyCondition.valueChoice") }}</template>
					<template v-else>{{ t("surveyCondition.valueOther") }}</template>
					<span class="text-red-500" aria-hidden="true">*</span>
				</label>

				<!-- Boolean for yes_no -->
				<template v-if="parentQuestion.type === 'yes_no'">
					<Select
						:inputId="conditionValueId"
						v-model="followUp.condition.value"
						:options="booleanOptions"
						optionLabel="label"
						optionValue="value"
						optionDisabled="disabled"
						class="w-full text-xs"
						:disabled="disabled"
						:invalid="showValidation && !!duplicateValueMessage"
						:aria-invalid="showValidation && !!duplicateValueMessage"
						:aria-describedby="showValidation && duplicateValueMessage ? `${conditionValueId}_dup` : undefined"
					/>
					<small
						v-if="showValidation && duplicateValueMessage"
						:id="`${conditionValueId}_dup`"
						class="block mt-1 text-xs text-red-500"
					>
						{{ duplicateValueMessage }}
					</small>
				</template>

				<!-- Options for choice -->
				<template v-else-if="parentQuestion.type === 'choice'">
					<Select
						:inputId="conditionValueId"
						v-model="followUp.condition.value"
						:options="choiceOptionsList"
						optionLabel="label"
						optionValue="value"
						optionDisabled="disabled"
						:placeholder="t('surveyCondition.choicePlaceholder')"
						class="w-full text-xs"
						:disabled="disabled"
						:invalid="showValidation && !!duplicateValueMessage"
						:aria-invalid="showValidation && !!duplicateValueMessage"
						:aria-describedby="showValidation && duplicateValueMessage ? `${conditionValueId}_dup` : undefined"
					/>
					<small
						v-if="showValidation && duplicateValueMessage"
						:id="`${conditionValueId}_dup`"
						class="block mt-1 text-xs text-red-500"
					>
						{{ duplicateValueMessage }}
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
