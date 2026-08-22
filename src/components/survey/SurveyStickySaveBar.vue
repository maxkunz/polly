<script setup lang="ts">
import Button from "primevue/button";

withDefaults(
	defineProps<{
		isDirty: boolean;
		isSaving: boolean;
		disabled?: boolean;
	}>(),
	{
		disabled: false
	}
);

const emit = defineEmits<{
	(e: "back"): void;
	(e: "save"): void;
}>();
</script>

<template>
	<div class="sticky bottom-4 z-20 bg-[var(--p-surface-0)]/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-[var(--p-content-border-color)] flex items-center justify-between gap-4">
		<div class="text-xs text-[var(--p-text-muted-color)]">
			<span v-if="isDirty" class="font-medium text-amber-600">
				● Ungespeicherte Änderungen vorhanden
			</span>
			<span v-else class="text-emerald-600">
				✓ Alle Änderungen gespeichert
			</span>
		</div>

		<div class="flex items-center gap-2">
			<Button
				size="small"
				severity="secondary"
				label="Zurück"
				icon="pi pi-arrow-left"
				@click="emit('back')"
			/>
			<Button
				size="small"
				severity="success"
				icon="pi pi-save"
				:loading="isSaving"
				label="Umfrage speichern"
				:disabled="disabled || !isDirty"
				@click="emit('save')"
			/>
		</div>
	</div>
</template>
