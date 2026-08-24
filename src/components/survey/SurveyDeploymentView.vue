<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import type { Survey } from "@/domain/survey/surveyTypes";
import { DEFAULT_SURVEY_DATATABLE_ID } from "@/services/surveyService";
import { useSurveyDeployment } from "@/composables/useSurveyDeployment";
import SurveyDeploymentStatus from "./SurveyDeploymentStatus.vue";

const props = withDefaults(
	defineProps<{
		survey: Survey;
		surveyId: string;
		datatableId?: string;
		existingRow: Record<string, any>;
	}>(),
	{ datatableId: DEFAULT_SURVEY_DATATABLE_ID }
);

const emit = defineEmits<{
	(e: "back"): void;
}>();

// Local ref so useSurveyDeployment can update it reactively after each deploy
const localRow = ref<Record<string, any> | null>({ ...props.existingRow });
watch(
	() => props.existingRow,
	v => { localRow.value = { ...v }; },
	{ deep: true }
);

const {
	isDeploying,
	deployError,
	stageSnapshot,
	prodSnapshot,
	backupSnapshot,
	deployToStage,
	deployToProd,
	rollback
} = useSurveyDeployment({
	datatableId: props.datatableId,
	surveyId: props.surveyId,
	existingRow: localRow
});
</script>

<template>
	<div class="space-y-6">
		<!-- Header -->
		<div class="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[var(--p-content-border-color)]">
			<div class="flex items-center gap-3">
				<Button
					size="small"
					severity="secondary"
					variant="text"
					icon="pi pi-arrow-left"
					label="Zurück zum Editor"
					aria-label="Zurück zum Editor"
					@click="emit('back')"
				/>
				<h2 class="text-base font-semibold text-[var(--p-text-color)]">
					{{ survey.title || survey.name }}
					<span class="text-[var(--p-text-muted-color)] font-normal">(v{{ survey.version ?? 1 }})</span>
				</h2>
			</div>
		</div>

		<!-- Error -->
		<Message v-if="deployError" severity="error" :closable="false">
			{{ deployError }}
		</Message>

		<!-- Environment Status Grid -->
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<SurveyDeploymentStatus label="Stage" :survey="stageSnapshot" severity="warn" />
			<SurveyDeploymentStatus label="Prod" :survey="prodSnapshot" severity="success" />
			<SurveyDeploymentStatus label="Backup" :survey="backupSnapshot" severity="secondary" />
		</div>

		<!-- Actions -->
		<div class="flex flex-wrap gap-3 pt-2">
			<Button
				icon="pi pi-send"
				label="Stage deployen"
				severity="warn"
				:loading="isDeploying"
				:disabled="isDeploying"
				aria-label="Draft auf Stage deployen"
				@click="deployToStage"
			/>
			<Button
				icon="pi pi-cloud-upload"
				label="Prod deployen"
				severity="success"
				:loading="isDeploying"
				:disabled="isDeploying"
				aria-label="Draft auf Prod deployen (Prod wird in Backup gesichert)"
				@click="deployToProd"
			/>
			<Button
				icon="pi pi-history"
				label="Rollback"
				severity="danger"
				variant="outlined"
				:loading="isDeploying"
				:disabled="isDeploying || !backupSnapshot"
				aria-label="Backup auf Prod zurückspielen"
				@click="rollback"
			/>
		</div>
	</div>
</template>
