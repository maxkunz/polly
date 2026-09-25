<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Message from "primevue/message";
import type { Survey } from "@/domain/survey/surveyTypes";
import { useSurveyDeployment } from "@/composables/useSurveyDeployment";
import SurveyDeploymentStatus from "./SurveyDeploymentStatus.vue";
import SurveyQueueMappingForm from "./SurveyQueueMappingForm.vue";

const props = defineProps<{
	survey: Survey;
	surveyId: string;
	datatableId?: string;
	existingRow: Record<string, any>;
}>();

const emit = defineEmits<{
	(e: "back"): void;
	(e: "update:isDirty", isDirty: boolean): void;
}>();

const { t } = useI18n();

const isQueueMappingDirty = ref<boolean>(false);
watch(
	isQueueMappingDirty,
	(val) => {
		emit("update:isDirty", val);
	},
	{ immediate: true }
);

onBeforeUnmount(() => {
	emit("update:isDirty", false);
});

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
					:label="t('deployment.back')"
					:aria-label="t('deployment.backAriaLabel')"
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
			<SurveyDeploymentStatus :label="t('deployment.stage')" :survey="stageSnapshot" severity="warn" />
			<SurveyDeploymentStatus :label="t('deployment.prod')" :survey="prodSnapshot" severity="success" />
			<SurveyDeploymentStatus :label="t('deployment.backup')" :survey="backupSnapshot" severity="secondary" />
		</div>

		<!-- Actions -->
		<div class="flex flex-wrap gap-3 pt-2">
			<Button
				icon="pi pi-send"
				:label="t('deployment.deployStage')"
				severity="primary"
				:loading="isDeploying"
				:disabled="isDeploying"
				:aria-label="t('deployment.deployStageAriaLabel')"
				@click="deployToStage"
			/>
			<Button
				icon="pi pi-cloud-upload"
				:label="t('deployment.deployProd')"
				severity="warn"
				:loading="isDeploying"
				:disabled="isDeploying"
				:aria-label="t('deployment.deployProdAriaLabel')"
				@click="deployToProd"
			/>
			<Button
				icon="pi pi-history"
				:label="t('deployment.rollback')"
				severity="danger"
				variant="outlined"
				:loading="isDeploying"
				:disabled="isDeploying || !backupSnapshot"
				:aria-label="t('deployment.rollbackAriaLabel')"
				@click="rollback"
			/>
		</div>

		<!-- Queue Mapping (nur wenn Version in Prod deployt ist) -->
		<div v-if="prodSnapshot !== null || stageSnapshot !== null" class="pt-4 border-t border-[var(--p-content-border-color)]">
			<SurveyQueueMappingForm
				:surveyId="surveyId"
				:datatableId="datatableId"
				v-model:isDirty="isQueueMappingDirty"
			/>
		</div>
	</div>
</template>
