<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Tag from "primevue/tag";

const { t } = useI18n();

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
				:label="t('surveyEditor.toolbar.back')"
				:aria-label="t('surveyEditor.toolbar.backAriaLabel')"
				@click="emit('back')"
			/>
			<Tag v-if="isDirty" :value="t('surveyEditor.toolbar.statusUnsaved')" severity="warn" />
			<Tag v-else :value="t('surveyEditor.toolbar.statusSaved')" severity="success" />
			<Tag :value="`v${version}`" severity="info" />
		</div>

		<div class="flex items-center gap-2">
			<Button
				size="small"
				severity="secondary"
				icon="pi pi-refresh"
				:label="t('surveyEditor.toolbar.discard')"
				:disabled="!isDirty || isSaving || isDeleting || disabled"
				@click="emit('discard')"
			/>
			<Button
				v-if="!isNew"
				size="small"
				severity="danger"
				icon="pi pi-trash"
				:label="t('surveyEditor.toolbar.delete')"
				:loading="isDeleting"
				:disabled="isSaving || isDeleting || disabled"
				:aria-label="t('surveyEditor.toolbar.deleteAriaLabel')"
				@click="emit('delete')"
			/>
			<Button
				v-if="!isNew"
				size="small"
				severity="info"
				icon="pi pi-clone"
				:label="t('surveyEditor.toolbar.clone')"
				:disabled="isDirty || isSaving || isDeleting || disabled"
				:aria-label="t('surveyEditor.toolbar.cloneAriaLabel')"
				@click="emit('clone')"
			/>
			<Button
				v-if="!isNew"
				size="small"
				severity="info"
				icon="pi pi-cloud-upload"
				:label="t('surveyEditor.toolbar.deploy')"
				:disabled="isDirty || isSaving || isDeleting || disabled"
				:aria-label="t('surveyEditor.toolbar.deployAriaLabel')"
				@click="emit('deploy')"
			/>
			<Button
				size="small"
				severity="success"
				icon="pi pi-save"
				:loading="isSaving"
				:label="t('surveyEditor.toolbar.save')"
				:disabled="disabled || !isDirty || isDeleting"
				@click="emit('save')"
			/>
		</div>
	</div>
</template>
