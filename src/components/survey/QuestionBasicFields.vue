<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import InputText from "primevue/inputtext";
import PromptTextarea from "@/components/ui/PromptTextarea.vue";
import ToggleSwitch from "primevue/toggleswitch";
import Select from "primevue/select";
import type { SurveyQuestion, QuestionType } from "@/domain/survey/surveyTypes";
import { ensureTechnicalName } from "@/domain/survey/surveyTypes";
import { getQuestionTypes } from "@/domain/survey/questionTypeCatalog";
import { questionFieldIds } from "@/domain/survey/surveyFieldIds";
import { useFieldErrors } from "@/composables/useFieldErrors";
import FieldError from "@/components/ui/FieldError.vue";

const { t } = useI18n();
const questionTypeOptions = computed(() => getQuestionTypes());

const props = withDefaults(
	defineProps<{
		question: SurveyQuestion;
		isSaved?: boolean;
		disabled?: boolean;
	}>(),
	{
		isSaved: false,
		disabled: false
	}
);

const emit = defineEmits<{
	(e: "type-change", newType: QuestionType): void;
}>();

// Gespeicherte Namen sind unveränderlich; nur bei neuen Fragen eine Vorschau aus dem Titel zeigen
const displayQuestionName = computed(() =>
	props.isSaved
		? props.question.name
		: ensureTechnicalName(props.question.name, props.question.title, props.question.id, "frage")
);

const { hasError, errorId } = useFieldErrors();

const nameId = computed(() => questionFieldIds.name(props.question.id));
const typeId = computed(() => questionFieldIds.type(props.question.id));
const titleId = computed(() => questionFieldIds.title(props.question.id));
const descId = computed(() => questionFieldIds.description(props.question.id));
const repromptId = computed(() => questionFieldIds.reprompt(props.question.id));
const mandatoryId = computed(() => questionFieldIds.mandatory(props.question.id));
</script>

<template>
	<div class="space-y-4">
		<!-- Header Row: Immutable Name, Question Type, Mandatory Toggle -->
		<div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
			<div class="md:col-span-4">
				<label :for="nameId" class="block text-xs font-medium text-[var(--p-text-muted-color)] mb-1">
					{{ t("surveyQuestionFields.technicalName") }}
					<span class="text-[11px] text-amber-700 block">{{ t("surveyQuestionFields.technicalNameHintShort") }}</span>
				</label>
				<InputText
					:id="nameId"
					:modelValue="displayQuestionName"
					class="w-full text-xs font-mono bg-[var(--p-surface-100)] text-[var(--p-text-muted-color)]"
					disabled
					readonly
					:aria-describedby="`${nameId}_hint`"
				/>
				<span :id="`${nameId}_hint`" class="sr-only">{{ t("surveyQuestionFields.technicalNameHint") }}</span>
			</div>

			<div class="md:col-span-5">
				<!-- Kein <label for>: Select rendert kein Formularelement, Verknüpfung über aria-labelledby -->
				<div :id="`${typeId}_label`" class="block text-xs font-medium mb-1">
					{{ t("surveyQuestionFields.type") }} <span class="text-red-700" aria-hidden="true">*</span>
					<span v-if="isSaved" class="text-[11px] text-amber-700 block">{{ t("surveyQuestionFields.typeSavedHint") }}</span>
				</div>
				<Select
					:inputId="typeId"
					:ariaLabelledby="`${typeId}_label`"
					:pt="{ label: { 'aria-required': 'true' } }"
					:modelValue="question.type"
					:options="questionTypeOptions"
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
						{{ t("surveyQuestionFields.mandatory") }}
					</label>
				</div>
			</div>
		</div>

		<!-- Question Title -->
		<div>
			<label :for="titleId" class="block text-sm font-medium mb-1">
				{{ t("surveyQuestionFields.title") }} <span class="text-red-700" aria-hidden="true">*</span>
			</label>
			<PromptTextarea
				:id="titleId"
				aria-required="true"
				v-model="question.title"
				ttsLimit
				:placeholder="t('surveyQuestionFields.titlePlaceholder')"
				:disabled="disabled"
				:invalid="hasError(titleId)"
				:aria-describedby="errorId(titleId)"
			/>
			<FieldError :fieldId="titleId" />
		</div>

		<!-- Description & Reprompt -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div>
				<label :for="repromptId" class="block text-xs font-medium mb-1">
					{{ t("surveyQuestionFields.reprompt") }}
				</label>
				<PromptTextarea
					:id="repromptId"
					v-model="question.reprompt_message"
					ttsLimit
					class="text-sm"
					:placeholder="t('surveyQuestionFields.repromptPlaceholder')"
					:disabled="disabled"
					:invalid="hasError(repromptId)"
					:aria-describedby="errorId(repromptId)"
				/>
				<FieldError :fieldId="repromptId" />
			</div>

			<div>
				<label :for="descId" class="block text-xs font-medium mb-1">
					{{ t("surveyQuestionFields.description") }}
				</label>
				<PromptTextarea
					:id="descId"
					v-model="question.description"
					class="text-sm"
					:placeholder="t('surveyQuestionFields.descriptionPlaceholder')"
					:disabled="disabled"
				/>
			</div>
		</div>
	</div>
</template>
