<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Button from "primevue/button";

const { t } = useI18n();

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
				{{ t("surveyEditor.stickyBar.unsaved") }}
			</span>
			<span v-else class="text-emerald-600">
				{{ t("surveyEditor.stickyBar.allSaved") }}
			</span>
		</div>

		<div class="flex items-center gap-2">
			<Button
				size="small"
				severity="secondary"
				:label="t('surveyEditor.stickyBar.back')"
				icon="pi pi-arrow-left"
				@click="emit('back')"
			/>
			<Button
				size="small"
				severity="success"
				icon="pi pi-save"
				:loading="isSaving"
				:label="t('surveyEditor.stickyBar.save')"
				:disabled="disabled || !isDirty"
				@click="emit('save')"
			/>
		</div>
	</div>
</template>
