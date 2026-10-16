<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import PromptTextarea from "@/components/ui/PromptTextarea.vue";
import type { Survey } from "@/domain/survey/surveyTypes";
import { displayTechnicalName, SURVEY_LANGUAGES, DEFAULT_SURVEY_LANGUAGE } from "@/domain/survey/surveyTypes";
import type { SurveyLanguage } from "@/domain/survey/surveyTypes";
import { BASE_URL_TOKEN_PLACEHOLDER } from "@/constants/surveyConstants";
import { surveyFieldIds } from "@/domain/survey/surveyFieldIds";
import { useFieldErrors } from "@/composables/useFieldErrors";
import FieldError from "@/components/ui/FieldError.vue";

const props = withDefaults(
	defineProps<{
		survey: Survey;
		isSaved?: boolean;
		disabled?: boolean;
	}>(),
	{
		isSaved: false,
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
const surveyBaseUrlId = surveyFieldIds.baseUrl;
const surveyLanguageId = surveyFieldIds.language;
const { t } = useI18n();
const { hasError, errorId } = useFieldErrors();

// Nach dem ersten Speichern ist der Name unveränderlich; vorher eine Vorschau aus dem Titel zeigen
const computedTechnicalName = computed(() => displayTechnicalName(props.survey, props.isSaved, "umfrage"));

// {token} nicht direkt in die Sprachdatei schreiben: vue-i18n würde es als Parameter lesen
const tokenPlaceholder = BASE_URL_TOKEN_PLACEHOLDER;

// Umfragen ohne Feld (ältere Stände) gelten als Deutsch
const languageOptions = computed(() => SURVEY_LANGUAGES.map(value => ({ value, label: t(`language.${value}`) })));
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

				<div class="grid grid-cols-1 md:grid-cols-12 gap-4">
					<div class="md:col-span-8">
						<label :for="surveyBaseUrlId" class="block text-sm font-medium mb-1">
							{{ t("surveyEditor.meta.baseUrl") }}
						</label>
						<InputText
							:id="surveyBaseUrlId"
							v-model="survey.base_url"
							type="url"
							class="w-full"
							:placeholder="t('surveyEditor.meta.placeholders.baseUrl', { placeholder: tokenPlaceholder })"
							:disabled="disabled"
							:invalid="hasError(surveyBaseUrlId)"
							:aria-describedby="[`${surveyBaseUrlId}_hint`, errorId(surveyBaseUrlId)].filter(Boolean).join(' ')"
						/>
						<p :id="`${surveyBaseUrlId}_hint`" class="mt-1 text-xs text-[var(--p-text-muted-color)]">
							{{ t("surveyEditor.meta.baseUrlHint", { placeholder: tokenPlaceholder }) }}
						</p>
						<FieldError :fieldId="surveyBaseUrlId" />
					</div>

					<div class="md:col-span-4">
						<!-- Kein <label for>: Select rendert kein Formularelement, Verknüpfung über aria-labelledby -->
						<div :id="`${surveyLanguageId}_label`" class="block text-sm font-medium mb-1">
							{{ t("surveyEditor.meta.language") }}
						</div>
						<Select
							:inputId="surveyLanguageId"
							:ariaLabelledby="`${surveyLanguageId}_label`"
							:modelValue="survey.language ?? DEFAULT_SURVEY_LANGUAGE"
							:options="languageOptions"
							optionLabel="label"
							optionValue="value"
							class="w-full"
							:disabled="disabled"
							@update:modelValue="(value: SurveyLanguage) => (survey.language = value)"
						/>
						<FieldError :fieldId="surveyLanguageId" />
					</div>
				</div>
			</form>
		</template>
	</Card>
</template>
