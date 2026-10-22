<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Message from "primevue/message";
import type { Survey } from "@/domain/survey/surveyTypes";
import { useSurveyDeployment } from "@/composables/useSurveyDeployment";
import { useWebPreview } from "@/composables/useWebPreview";
import { PREVIEW_TOKEN_TTL_DAYS } from "@/domain/survey/invitationLinks";
import SurveyDeploymentStatus from "./SurveyDeploymentStatus.vue";
import SurveyQueueMappingForm from "./SurveyQueueMappingForm.vue";
import { useAppStore } from "@/stores/appStore";
import { currentLocaleTag } from "@/i18n";
import { readFieldVersion } from "@/domain/survey/surveyRow";

const props = defineProps<{
	survey: Survey;
	surveyId: string;
}>();

/** Rohzeile der Umfrage; Deploy und Rollback aktualisieren sie, die Seite bleibt per v-model auf demselben Stand */
const existingRow = defineModel<Record<string, any> | null>("existingRow", { required: true });

const emit = defineEmits<{
	(e: "back"): void;
	(e: "update:isDirty", isDirty: boolean): void;
}>();

const { t } = useI18n();
const app = useAppStore();

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

const {
	isDeploying,
	deployError,
	stageSnapshot,
	prodSnapshot,
	backupSnapshot,
	isDraftInProd,
	draftPayloadSize,
	isDraftTooLarge,
	deployToStage,
	deployToProd,
	rollback
} = useSurveyDeployment({
	surveyId: props.surveyId,
	existingRow
});

const {
	isOpening: isOpeningWebPreview,
	errorMessage: webPreviewError,
	blockedUrl: webPreviewBlockedUrl,
	openWebPreview
} = useWebPreview(props.surveyId);

// Version des aktuell geladenen Drafts (nach einem Deploy-Fehler ggf. neuer als beim Öffnen)
const draftVersion = computed(() => readFieldVersion(existingRow.value?.Draft) ?? props.survey.version ?? 1);

// Tooltip nur bei fehlender Rolle polly_deploy
const deployTooltip = computed(() => (app.canDeploy ? undefined : t("permissions.missingDeploy")));

const payloadTooLargeId = `deploy-payload-too-large-${props.surveyId}`;
const payloadTooLargeText = computed(() => {
	if (!draftPayloadSize.value) return "";
	const format = new Intl.NumberFormat(currentLocaleTag());
	return t("deployment.payloadTooLarge", {
		length: format.format(draftPayloadSize.value.length),
		max: format.format(draftPayloadSize.value.max)
	});
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
					<span class="text-[var(--p-surface-600)] font-normal">(v{{ draftVersion }})</span>
				</h2>
			</div>
		</div>

		<Message v-if="!app.canDeploy" severity="info" :closable="false">
			{{ t("permissions.deployReadOnlyBanner") }}
		</Message>

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

		<!-- Hinweis vor den Buttons, damit er in der Lesereihenfolge vor den gesperrten Aktionen steht -->
		<Message v-if="isDraftTooLarge" :id="payloadTooLargeId" severity="error" :closable="false">
			{{ payloadTooLargeText }}
		</Message>

		<!-- Actions -->
		<div class="flex flex-wrap gap-3 pt-2">
			<span v-tooltip.top="deployTooltip">
				<Button
					icon="pi pi-send"
					:label="t('deployment.deployStage')"
					severity="primary"
					:loading="isDeploying"
					:disabled="isDeploying || isDraftTooLarge || !app.canDeploy"
					:aria-label="t('deployment.deployStageAriaLabel')"
					:aria-describedby="isDraftTooLarge ? payloadTooLargeId : undefined"
					@click="deployToStage"
				/>
			</span>
			<span v-if="app.webSurveyEnabled" v-tooltip.top="deployTooltip">
				<Button
					icon="pi pi-external-link"
					:label="t('deployment.webPreview')"
					severity="secondary"
					variant="outlined"
					:loading="isOpeningWebPreview"
					:disabled="isDeploying || isOpeningWebPreview || !stageSnapshot || !app.canDeploy"
					:aria-label="t('deployment.webPreviewAriaLabel')"
					aria-describedby="deploy-web-preview-hint"
					@click="openWebPreview"
				/>
			</span>
			<span v-tooltip.top="deployTooltip">
				<Button
					icon="pi pi-cloud-upload"
					:label="t('deployment.deployProd')"
					severity="warn"
					:loading="isDeploying"
					:disabled="isDeploying || isDraftInProd || isDraftTooLarge || !app.canDeploy"
					:aria-label="t('deployment.deployProdAriaLabel')"
					:aria-describedby="isDraftTooLarge ? payloadTooLargeId : undefined"
					@click="deployToProd"
				/>
			</span>
			<span v-tooltip.top="deployTooltip">
				<Button
					icon="pi pi-history"
					:label="t('deployment.rollback')"
					severity="danger"
					variant="outlined"
					:loading="isDeploying"
					:disabled="isDeploying || !backupSnapshot || !app.canDeploy"
					:aria-label="t('deployment.rollbackAriaLabel')"
					@click="rollback"
				/>
			</span>
		</div>

		<template v-if="app.webSurveyEnabled">
			<p id="deploy-web-preview-hint" class="text-sm text-[var(--p-text-muted-color)]">
				{{ t("deployment.webPreviewHint", { days: PREVIEW_TOKEN_TTL_DAYS }) }}
			</p>
			<Message v-if="webPreviewError" severity="error" :closable="false">
				{{ webPreviewError }}
			</Message>
			<Message v-if="webPreviewBlockedUrl" severity="warn" :closable="false">
				{{ t("deployment.webPreviewBlocked") }}
				<a :href="webPreviewBlockedUrl" target="_blank" rel="noopener noreferrer" class="underline break-all">
					{{ t("deployment.webPreviewOpenLink") }}
				</a>
			</Message>
		</template>

		<Message v-if="isDraftInProd" severity="info" :closable="false">
			{{ t("deployment.alreadyInProd", { version: draftVersion }) }}
		</Message>

		<!-- Queue Mapping (nur wenn Version in Prod deployt ist) -->
		<div v-if="prodSnapshot !== null || stageSnapshot !== null" class="pt-4 border-t border-[var(--p-content-border-color)]">
			<SurveyQueueMappingForm
				:surveyId="surveyId"
				:disabled="!app.canDeploy"
				v-model:isDirty="isQueueMappingDirty"
			/>
		</div>
	</div>
</template>
