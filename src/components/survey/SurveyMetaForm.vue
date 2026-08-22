<script setup lang="ts">
import { computed } from "vue";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import type { Survey } from "@/domain/survey/surveyTypes";
import { ensureTechnicalName } from "@/domain/survey/surveyTypes";

const props = withDefaults(
	defineProps<{
		survey: Survey;
		disabled?: boolean;
		saveAttempted?: boolean;
	}>(),
	{
		disabled: false,
		saveAttempted: false
	}
);

const emit = defineEmits<{
	(e: "save"): void;
}>();

const surveyTitleId = "survey_title_input";
const surveyNameId = "survey_name_input";
const surveyDescId = "survey_desc_input";
const surveyGreetingId = "survey_greeting_input";
const surveyClosingId = "survey_closing_input";

const computedTechnicalName = computed(() => {
	return ensureTechnicalName(props.survey.name, props.survey.title, props.survey.id, "umfrage");
});
</script>

<template>
	<Card class="border border-[var(--p-content-border-color)] shadow-sm rounded-2xl">
		<template #title>
			<h2 class="text-lg font-semibold text-[var(--p-text-color)]">
				Allgemeine Umfrageeinstellungen
			</h2>
		</template>
		<template #content>
			<form class="space-y-4" @submit.prevent="emit('save')">
				<div class="grid grid-cols-1 md:grid-cols-12 gap-4">
					<div class="md:col-span-8">
						<label :for="surveyTitleId" class="block text-sm font-medium mb-1">
							Titel der Umfrage <span class="text-red-500" aria-hidden="true">*</span>
						</label>
						<InputText
							:id="surveyTitleId"
							v-model="survey.title"
							class="w-full"
							placeholder="z. B. Kundenzufriedenheit 2026"
							:disabled="disabled"
							:invalid="saveAttempted && !survey.title?.trim()"
							:aria-invalid="saveAttempted && !survey.title?.trim()"
						/>
					</div>

					<div class="md:col-span-4">
						<label :for="surveyNameId" class="block text-xs font-medium text-[var(--p-text-muted-color)] mb-1">
							Technischer Name (Automatisch aus Titel & ID)
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
						Beschreibung
					</label>
					<Textarea
						:id="surveyDescId"
						v-model="survey.description"
						class="w-full text-sm"
						rows="2"
						autoResize
						placeholder="Interne Beschreibung oder Kontext zur Umfrage..."
						:disabled="disabled"
					/>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label :for="surveyGreetingId" class="block text-sm font-medium mb-1">
							Begrüßungsnachricht (Greeting)
						</label>
						<Textarea
							:id="surveyGreetingId"
							v-model="survey.greeting_message"
							class="w-full text-sm"
							rows="2"
							autoResize
							placeholder="Vielen Dank, dass Sie sich kurz Zeit nehmen..."
							:disabled="disabled"
						/>
					</div>

					<div>
						<label :for="surveyClosingId" class="block text-sm font-medium mb-1">
							Verabschiedungsnachricht (Closing)
						</label>
						<Textarea
							:id="surveyClosingId"
							v-model="survey.closing_message"
							class="w-full text-sm"
							rows="2"
							autoResize
							placeholder="Vielen Dank für Ihr wertvolles Feedback!"
							:disabled="disabled"
						/>
					</div>
				</div>
			</form>
		</template>
	</Card>
</template>
