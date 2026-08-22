<script setup lang="ts">
import type { QuestionType } from "@/domain/survey/surveyTypes";

defineProps<{
	type: QuestionType;
}>();
</script>

<template>
	<div
		v-if="type === 'nps'"
		class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center gap-2"
	>
		<i class="pi pi-info-circle text-sm" aria-hidden="true" />
		<span>Net Promoter Score verwendet eine standardisierte Skala von 0 (Sehr unwahrscheinlich) bis 10 (Sehr wahrscheinlich).</span>
	</div>

	<div
		v-else-if="type === 'yes_no'"
		class="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2"
	>
		<i class="pi pi-check-circle text-sm" aria-hidden="true" />
		<span>Ja / Nein Frage mit zwei standardisierten Antwortmöglichkeiten.</span>
	</div>

	<div
		v-else-if="type === 'comment'"
		class="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800 flex items-center gap-2"
	>
		<i class="pi pi-comment text-sm" aria-hidden="true" />
		<span>Offenes Freitextfeld für Rückmeldungen des Teilnehmers.</span>
	</div>
</template>
