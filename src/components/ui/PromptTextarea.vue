<!-- Mehrzeiliges Eingabefeld für Ansagetexte: startet mit 2 Zeilen, wächst bis 10 Zeilen, danach scrollbar -->
<script setup lang="ts">
import Textarea from "primevue/textarea";

// id, aria-*, placeholder, disabled, invalid usw. werden unverändert an das Textarea durchgereicht
const model = defineModel<string | null | undefined>();
</script>

<template>
	<Textarea
		v-model="model"
		class="prompt-textarea w-full"
		rows="2"
		autoResize
	/>
</template>

<style scoped>
/* autoResize setzt overflow: hidden – ab der Maximalhöhe muss der Inhalt scrollbar bleiben */
.p-textarea.prompt-textarea {
	max-height: calc(10 * 1.5em + 2 * var(--p-textarea-padding-y) + 2px);
	max-height: calc(10lh + 2 * var(--p-textarea-padding-y) + 2px);
	overflow-y: auto;
}
</style>
