<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import PromptTextarea from "@/components/ui/PromptTextarea.vue";
import type { Survey } from "@/domain/survey/surveyTypes";
import { displayTechnicalName } from "@/domain/survey/surveyTypes";
import { SURVEY_LANGUAGES, DEFAULT_SURVEY_LANGUAGE } from "@/domain/survey/flowTypes";
import type { SurveyLanguage } from "@/domain/survey/flowTypes";
import { BASE_URL_TOKEN_PLACEHOLDER } from "@/constants/surveyConstants";
import { usableBaseUrl } from "@/domain/survey/invitationLinks";
import { surveyFieldIds } from "@/domain/survey/surveyFieldIds";
import { useFieldErrors } from "@/composables/useFieldErrors";
import FieldError from "@/components/ui/FieldError.vue";
import { useWebThemes } from "@/composables/useWebThemes";
import { useAppStore } from "@/stores/appStore";

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
const surveyWebThemeId = surveyFieldIds.webTheme;
const { t } = useI18n();
const app = useAppStore();
const { hasError, errorId } = useFieldErrors();

// Nach dem ersten Speichern ist der Name unveränderlich; vorher eine Vorschau aus dem Titel zeigen
const computedTechnicalName = computed(() => displayTechnicalName(props.survey, props.isSaved, "umfrage"));

// {token} nicht direkt in die Sprachdatei schreiben: vue-i18n würde es als Parameter lesen
const tokenPlaceholder = BASE_URL_TOKEN_PLACEHOLDER;
// Standard-Basis-URL des Mandanten (Einstellungen): gilt, solange die Umfrage keine eigene hat
const defaultBaseUrl = computed(() => usableBaseUrl(app.domain.meta.web.defaultBaseUrl) ?? "");

// Umfragen ohne Feld (ältere Stände) gelten als Deutsch
const languageOptions = computed(() => SURVEY_LANGUAGES.map(value => ({ value, label: t(`language.${value}`) })));

// Web-Design: leer = Standard-Design des Mandanten (bzw. eingebautes Polly-Design)
const { themes: webThemes, loaded: webThemesLoaded, loadError: webThemesError, defaultTheme, load: loadWebThemes } = useWebThemes();
// Web-Felder nur mit Feature Flag web_survey; ohne Flag werden beim Speichern die Standardwerte gesetzt
onMounted(() => {
	if (app.webSurveyEnabled) void loadWebThemes();
});

// Nicht leer: PrimeVue Select zeigt bei "" den Platzhalter statt der passenden Option
const TENANT_DEFAULT = "__default__";
const webThemeOptions = computed(() => [
	{
		value: TENANT_DEFAULT,
		label: defaultTheme.value
			? t("surveyEditor.meta.webThemeDefaultNamed", { name: defaultTheme.value.name })
			: t("surveyEditor.meta.webThemeDefault")
	},
	...webThemes.value.map(theme => ({ value: theme.id, label: theme.name })),
	// Gewähltes Design, das (noch) nicht in der Liste steht, bleibt sichtbar, damit die Auswahl nicht leer
	// erscheint oder still wechselt: Liste lädt noch, ist nicht abrufbar oder das Design wurde gelöscht
	...(unlistedThemeLabel.value ? [{ value: props.survey.web_theme_id!, label: unlistedThemeLabel.value }] : [])
]);

const unlistedThemeLabel = computed(() => {
	const id = props.survey.web_theme_id;
	if (!id || webThemes.value.some(theme => theme.id === id)) return "";
	if (webThemeMissing.value) return t("surveyEditor.meta.webThemeMissingOption");
	if (webThemesError.value) return t("surveyEditor.meta.webThemeUnavailableOption");
	return t("surveyEditor.meta.webThemeLoadingOption");
});

/** Das gewählte Design gibt es nicht mehr: Die Umfrage fällt auf das Standard-Design zurück. */
const webThemeMissing = computed(
	() => !!props.survey.web_theme_id && webThemesLoaded.value && !webThemes.value.some(theme => theme.id === props.survey.web_theme_id)
);

function setWebTheme(value: string | null): void {
	if (value && value !== TENANT_DEFAULT) props.survey.web_theme_id = value;
	else delete props.survey.web_theme_id;
}
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

				<div v-if="app.webSurveyEnabled" class="grid grid-cols-1 md:grid-cols-12 gap-4">
					<div class="md:col-span-8">
						<label :for="surveyBaseUrlId" class="block text-sm font-medium mb-1">
							{{ t("surveyEditor.meta.baseUrl") }}
						</label>
						<InputText
							:id="surveyBaseUrlId"
							v-model="survey.base_url"
							type="url"
							class="w-full"
							:placeholder="defaultBaseUrl || t('surveyEditor.meta.placeholders.baseUrl', { placeholder: tokenPlaceholder })"
							:disabled="disabled"
							:invalid="hasError(surveyBaseUrlId)"
							:aria-describedby="[`${surveyBaseUrlId}_hint`, errorId(surveyBaseUrlId)].filter(Boolean).join(' ')"
						/>
						<p :id="`${surveyBaseUrlId}_hint`" class="mt-1 text-xs text-[var(--p-text-muted-color)]">
							{{ t("surveyEditor.meta.baseUrlHint", { placeholder: tokenPlaceholder }) }}
							<template v-if="defaultBaseUrl">{{ t("surveyEditor.meta.baseUrlHintDefault", { url: defaultBaseUrl }) }}</template>
							<template v-else>{{ t("surveyEditor.meta.baseUrlHintFallback") }}</template>
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

				<div v-if="app.webSurveyEnabled" class="grid grid-cols-1 md:grid-cols-12 gap-4">
					<div class="md:col-span-8">
						<div :id="`${surveyWebThemeId}_label`" class="block text-sm font-medium mb-1">
							{{ t("surveyEditor.meta.webTheme") }}
						</div>
						<Select
							:inputId="surveyWebThemeId"
							:ariaLabelledby="`${surveyWebThemeId}_label`"
							:modelValue="survey.web_theme_id ?? TENANT_DEFAULT"
							:options="webThemeOptions"
							optionLabel="label"
							optionValue="value"
							class="w-full"
							:disabled="disabled"
							:invalid="hasError(surveyWebThemeId)"
							:aria-describedby="[`${surveyWebThemeId}_hint`, errorId(surveyWebThemeId)].filter(Boolean).join(' ')"
							@update:modelValue="setWebTheme"
						/>
						<p :id="`${surveyWebThemeId}_hint`" class="mt-1 text-xs text-[var(--p-text-muted-color)]">
							<template v-if="webThemeMissing">{{ t("surveyEditor.meta.webThemeMissing") }}</template>
							<template v-else-if="webThemesError">{{ webThemesError }}</template>
							<template v-else>{{ t("surveyEditor.meta.webThemeHint") }}</template>
						</p>
						<FieldError :fieldId="surveyWebThemeId" />
					</div>
				</div>
			</form>
		</template>
	</Card>
</template>
