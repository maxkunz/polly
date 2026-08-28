<script setup lang="ts">
import Button from "primevue/button";
import Tag from "primevue/tag";

withDefaults(
	defineProps<{
		isDirty: boolean;
		isSaving: boolean;
		isDeleting?: boolean;
		version?: number;
		disabled?: boolean;
		isNew?: boolean;
	}>(),
	{
		isDeleting: false,
		version: 1,
		disabled: false,
		isNew: false
	}
);

const emit = defineEmits<{
	(e: "back"): void;
	(e: "discard"): void;
	(e: "save"): void;
	(e: "deploy"): void;
	(e: "delete"): void;
	(e: "clone"): void;
}>();
</script>

<template>
	<div class="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[var(--p-content-border-color)]">
		<div class="flex items-center gap-3">
			<Button
				size="small"
				severity="secondary"
				variant="text"
				icon="pi pi-arrow-left"
				label="Zurück zur Übersicht"
				aria-label="Zurück zur Umfragen-Übersicht"
				@click="emit('back')"
			/>
			<Tag v-if="isDirty" value="Ungespeichert" severity="warn" />
			<Tag v-else value="Gespeichert" severity="success" />
			<Tag :value="`v${version}`" severity="info" />
		</div>

		<div class="flex items-center gap-2">
			<Button
				v-if="!isNew"
				size="small"
				severity="danger"
				icon="pi pi-trash"
				label="Löschen"
				:loading="isDeleting"
				:disabled="isSaving || isDeleting || disabled"
				aria-label="Umfrage löschen"
				@click="emit('delete')"
			/>
			<Button
				v-if="!isNew"
				size="small"
				severity="secondary"
				icon="pi pi-clone"
				label="Klonen"
				:disabled="isSaving || isDeleting || disabled"
				aria-label="Umfrage klonen"
				@click="emit('clone')"
			/>
			<Button
				size="small"
				severity="secondary"
				icon="pi pi-refresh"
				label="Verwerfen"
				:disabled="!isDirty || isSaving || isDeleting || disabled"
				@click="emit('discard')"
			/>
			<Button
				v-if="!isNew"
				size="small"
				severity="info"
				icon="pi pi-cloud-upload"
				label="Deploy"
				:disabled="isDirty || isSaving || isDeleting || disabled"
				aria-label="Zur Deployment-Ansicht"
				@click="emit('deploy')"
			/>
			<Button
				size="small"
				severity="success"
				icon="pi pi-save"
				:loading="isSaving"
				label="Speichern"
				:disabled="disabled || !isDirty || isDeleting"
				@click="emit('save')"
			/>
		</div>
	</div>
</template>
