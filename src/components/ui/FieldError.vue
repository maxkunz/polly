<!-- Validierungsmeldungen eines Feldes; das Feld verweist per aria-describedby auf die id (siehe useFieldErrors) -->
<script setup lang="ts">
import { computed } from "vue";
import { fieldErrorId, useFieldErrors } from "@/composables/useFieldErrors";

const props = defineProps<{
	fieldId: string;
}>();

const { errorMessages } = useFieldErrors();
const messages = computed(() => errorMessages(props.fieldId));
</script>

<template>
	<div v-if="messages.length > 0" :id="fieldErrorId(fieldId)" class="mt-1 space-y-0.5 text-xs text-red-700">
		<p v-for="(message, index) in messages" :key="index" class="flex items-start gap-1">
			<!-- Symbol zusätzlich zur Farbe, damit der Fehler nicht nur über Rot erkennbar ist -->
			<i class="pi pi-exclamation-circle text-[11px] mt-0.5" aria-hidden="true" />
			<span>{{ message }}</span>
		</p>
	</div>
</template>
