<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import PromptTextarea from "@/components/ui/PromptTextarea.vue";
import type { Survey } from "@/domain/survey/surveyTypes";
import { ensureTechnicalName } from "@/domain/survey/surveyTypes";
import { surveyFieldIds } from "@/domain/survey/surveyFieldIds";
import { useFieldErrors } from "@/composables/useFieldErrors";
import FieldError from "@/components/ui/FieldError.vue";

const props = withDefaults(
	defineProps<{
		survey: Survey;
		disabled?: boolean;
	}>(),
	{
		disabled: false
	}
);

const emit = defineEmits<{
	(e: "save"): void;
}>();

const surveyTitleId = surveyFieldIds.title;
const surveyNameId = surveyFieldIds.name;
const surveyDescId = surveyFieldIds.description;
const surveyGreetingId = surveyFieldIds.greeting;
const surveyClosingId = surveyFieldIds.closing;
const { t } = useI18n();
const { hasError, errorId } = useFieldErrors();

const computedTechnicalName = computed(() => {
	return ensureTechnicalName(props.survey.name, props.survey.title, props.survey.id, "umfrage");
});
</script>

<template>
	<Card class="border border-[var(--p-content-border-color)] shadow-sm rounded-2xl">
		<template #title>
			<h2 class="text-lg font-semibold text-[var(--p-text-color)]">
				{{ t("surveyEditor.meta.title") }}
			</h2>
		</template>
		<template #content>
			<form class="space-y-4" @submit.prevent="!disabled && emit('save')">
				<div class="grid grid-cols-1 md:grid-cols-12 gap-4">
					<div class="md:col-span-8">
						<label :for="surveyTitleId" class="block text-sm font-medium mb-1">
							{{ t("surveyEditor.meta.surveyTitle") }} <span class="text-red-700" aria-hidden="true">*</span>
						</label>
						<InputText
							:id="surveyTitleId"
							aria-required="true"
							v-model="survey.title"
							class="w-full"
							:placeholder="t('surveyEditor.meta.placeholders.title')"
							:disabled="disabled"
							:invalid="hasError(surveyTitleId)"
							:aria-describedby="errorId(surveyTitleId)"
						/>
						<FieldError :fieldId="surveyTitleId" />
					</div>

					<div class="md:col-span-4">
						<label :for="surveyNameId" class="block text-xs font-medium text-[var(--p-text-muted-color)] mb-1">
							{{ t("surveyEditor.meta.technicalName") }}
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
						{{ t("surveyEditor.meta.description") }}
					</label>
					<PromptTextarea
						:id="surveyDescId"
						v-model="survey.description"
						class="text-sm"
						:placeholder="t('surveyEditor.meta.placeholders.description')"
						:disabled="disabled"
					/>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label :for="surveyGreetingId" class="block text-sm font-medium mb-1">
							{{ t("surveyEditor.meta.greeting") }}
						</label>
						<PromptTextarea
							:id="surveyGreetingId"
							v-model="survey.greeting_message"
							ttsLimit
							class="text-sm"
							:placeholder="t('surveyEditor.meta.placeholders.greeting')"
							:disabled="disabled"
							:invalid="hasError(surveyGreetingId)"
							:aria-describedby="errorId(surveyGreetingId)"
						/>
						<FieldError :fieldId="surveyGreetingId" />
					</div>

					<div>
						<label :for="surveyClosingId" class="block text-sm font-medium mb-1">
							{{ t("surveyEditor.meta.closing") }}
						</label>
						<PromptTextarea
							:id="surveyClosingId"
							v-model="survey.closing_message"
							ttsLimit
							class="text-sm"
							:placeholder="t('surveyEditor.meta.placeholders.closing')"
							:disabled="disabled"
							:invalid="hasError(surveyClosingId)"
							:aria-describedby="errorId(surveyClosingId)"
						/>
						<FieldError :fieldId="surveyClosingId" />
					</div>
				</div>
			</form>
		</template>
	</Card>
</template>
