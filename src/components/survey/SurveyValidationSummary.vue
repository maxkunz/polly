<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Message from "primevue/message";
import { surveyFieldIds } from "@/domain/survey/surveyFieldIds";
import { focusField } from "@/composables/useFieldErrors";

defineProps<{
	show: boolean;
	errors: Array<{ message: string; fieldId?: string }>;
}>();

const { t } = useI18n();
const summaryId = surveyFieldIds.validationSummary;

// Kein role="alert": Die Liste ändert sich bei jeder Eingabe und würde sonst ständig neu vorgelesen.
// Angesagt wird beim Speichern über den Toast und den Fokus auf das erste fehlerhafte Feld.
</script>

<template>
	<section
		v-if="show && errors.length > 0"
		:id="summaryId"
		tabindex="-1"
		:aria-labelledby="`${summaryId}_title`"
	>
		<Message severity="error" :closable="false">
			<div class="space-y-1">
				<h2 :id="`${summaryId}_title`" class="font-bold text-sm">{{ t("validation.summaryTitle") }}</h2>
				<p class="text-xs">{{ t("validation.summaryHint") }}</p>
				<ul class="list-disc list-inside text-xs space-y-0.5">
					<li v-for="(err, i) in errors" :key="i">
						<a
							v-if="err.fieldId"
							:href="`#${err.fieldId}`"
							class="underline underline-offset-2 hover:no-underline focus:outline-2 focus:outline-offset-2"
							@click.prevent="focusField(err.fieldId)"
						>{{ err.message }}</a>
						<template v-else>{{ err.message }}</template>
					</li>
				</ul>
			</div>
		</Message>
	</section>
</template>
