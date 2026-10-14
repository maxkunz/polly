<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Dialog from "primevue/dialog";
import Button from "primevue/button";
import type { SaveConflictChoice, SaveConflictState } from "@/composables/useSurveySaveActions";

const props = defineProps<{
	/** Offener Konflikt; null = Dialog geschlossen */
	conflict: SaveConflictState | null;
}>();

const emit = defineEmits<{
	(e: "choose", choice: SaveConflictChoice): void;
}>();

const { t } = useI18n();

const visible = computed(() => props.conflict !== null);

// Schließen per X/Escape = Abbrechen (Änderungen bleiben im Editor)
function onVisibleChange(value: boolean): void {
	if (!value && props.conflict) emit("choose", "cancel");
}
</script>

<template>
	<Dialog
		:visible="visible"
		modal
		:header="t('surveyEditor.saveConflict.header')"
		:style="{ width: '32rem' }"
		:breakpoints="{ '640px': '92vw' }"
		@update:visible="onVisibleChange"
	>
		<div class="flex items-start gap-3">
			<i class="pi pi-exclamation-triangle text-2xl text-orange-500" aria-hidden="true" />
			<p class="m-0">
				{{
					t("surveyEditor.saveConflict.message", {
						expected: conflict?.expectedVersion ?? "–",
						current: conflict?.currentVersion ?? "–"
					})
				}}
			</p>
		</div>

		<template #footer>
			<Button
				:label="t('surveyEditor.saveConflict.cancelLabel')"
				severity="secondary"
				autofocus
				@click="emit('choose', 'cancel')"
			/>
			<Button
				:label="t('surveyEditor.saveConflict.loadLabel')"
				severity="secondary"
				outlined
				@click="emit('choose', 'load')"
			/>
			<Button
				:label="t('surveyEditor.saveConflict.overwriteLabel')"
				severity="danger"
				@click="emit('choose', 'overwrite')"
			/>
		</template>
	</Dialog>
</template>
