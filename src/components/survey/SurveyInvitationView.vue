<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import DatePicker from "primevue/datepicker";
import InputNumber from "primevue/inputnumber";
import Message from "primevue/message";
import Tooltip from "primevue/tooltip";
import type { Survey } from "@/domain/survey/surveyTypes";
import { INVITATION_COUNT_MAX, INVITATION_COUNT_MIN } from "@/domain/survey/invitationLinks";
import { useSurveyInvitations } from "@/composables/useSurveyInvitations";
import { useAppStore } from "@/stores/appStore";

const props = defineProps<{
	survey: Survey;
	surveyId: string;
	existingRow: Record<string, any> | null;
}>();

const emit = defineEmits<{
	(e: "back"): void;
}>();

const { t } = useI18n();
const vTooltip = Tooltip;
const app = useAppStore();

const {
	count,
	expiryDate,
	multi,
	isGenerating,
	errorMessage,
	lastGeneratedCount,
	minExpiryDate,
	hasProd,
	prodVersion,
	baseUrlSource,
	exampleUrl,
	isCountValid,
	canGenerate,
	generate
} = useSurveyInvitations({
	survey: toRef(props, "survey"),
	surveyId: props.surveyId,
	existingRow: toRef(props, "existingRow")
});

const linkTargetText = computed(() =>
	t(
		baseUrlSource.value === "survey"
			? "invitations.linkTargetBaseUrl"
			: baseUrlSource.value === "default"
				? "invitations.linkTargetDefault"
				: "invitations.linkTargetFallback"
	)
);
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
					:label="t('invitations.back')"
					:aria-label="t('invitations.backAriaLabel')"
					@click="emit('back')"
				/>
				<h2 class="text-base font-semibold text-[var(--p-text-color)]">
					{{ t("invitations.title") }} – {{ survey.title || survey.name }}
					<span v-if="prodVersion !== null" class="text-[var(--p-surface-600)] font-normal">
						({{ t("invitations.prodVersion", { version: prodVersion }) }})
					</span>
				</h2>
			</div>
		</div>

		<p class="text-sm text-[var(--p-surface-600)]">{{ t("invitations.intro") }}</p>

		<Message v-if="!hasProd" severity="warn" :closable="false">
			{{ t("invitations.noProd") }}
		</Message>
		<Message v-else-if="!app.canDeploy" severity="info" :closable="false">
			{{ t("permissions.missingDeploy") }}
		</Message>

		<Message v-if="errorMessage" severity="error" :closable="false">
			{{ errorMessage }}
		</Message>
		<Message v-else-if="lastGeneratedCount !== null" severity="success" :closable="false">
			{{ t("invitations.success", { count: lastGeneratedCount }) }}
		</Message>

		<!-- Eingaben -->
		<div class="flex flex-wrap items-start gap-6">
			<div class="flex flex-col gap-1">
				<label for="invitation-count" class="text-sm text-[var(--p-surface-600)]">{{ t("invitations.count") }}</label>
				<InputNumber
					v-model="count"
					inputId="invitation-count"
					:min="INVITATION_COUNT_MIN"
					:max="INVITATION_COUNT_MAX"
					:useGrouping="false"
					showButtons
					:invalid="!isCountValid"
					:disabled="isGenerating"
					aria-describedby="invitation-count-hint"
				/>
				<small id="invitation-count-hint" class="text-xs text-[var(--p-surface-600)]">
					{{ t("invitations.countHint", { min: INVITATION_COUNT_MIN, max: INVITATION_COUNT_MAX }) }}
				</small>
			</div>
			<div class="flex flex-col gap-1">
				<label for="invitation-expiry" class="text-sm text-[var(--p-surface-600)]">{{ t("invitations.expiry") }}</label>
				<DatePicker
					v-model="expiryDate"
					inputId="invitation-expiry"
					showIcon
					showButtonBar
					:minDate="minExpiryDate"
					:disabled="isGenerating"
					aria-describedby="invitation-expiry-hint"
				/>
				<small id="invitation-expiry-hint" class="text-xs text-[var(--p-surface-600)] w-0 min-w-full">
					{{ t("invitations.expiryHint") }}
				</small>
			</div>
			<div class="flex flex-col gap-1 pt-6 w-72 max-w-full">
				<div class="flex items-center gap-2">
					<Checkbox
						v-model="multi"
						inputId="invitation-multi"
						binary
						:disabled="isGenerating"
						aria-describedby="invitation-multi-hint"
					/>
					<label for="invitation-multi" class="text-sm text-[var(--p-text-color)]">{{ t("invitations.multi") }}</label>
				</div>
				<!-- Beide Hinweise übereinander gestapelt: die Höhe entspricht dem längeren, das Formular springt beim Umschalten nicht -->
				<div id="invitation-multi-hint" class="grid text-xs text-[var(--p-surface-600)]">
					<small class="col-start-1 row-start-1" :class="{ invisible: multi }">{{ t("invitations.multiHintOff") }}</small>
					<small class="col-start-1 row-start-1" :class="{ invisible: !multi }">{{ t("invitations.multiHintOn") }}</small>
				</div>
			</div>
		</div>

		<!-- Link-Ziel -->
		<div class="space-y-1">
			<h3 class="text-sm font-semibold text-[var(--p-text-color)]">{{ t("invitations.linkTarget") }}</h3>
			<p class="text-sm text-[var(--p-surface-600)]">
				{{ linkTargetText }}
			</p>
			<code class="block text-xs font-mono break-all p-2 rounded-lg bg-[var(--p-surface-50)] border border-[var(--p-content-border-color)]">
				{{ exampleUrl }}
			</code>
		</div>

		<!-- Erzeugen -->
		<div class="space-y-2 pt-2">
			<span v-tooltip.top="app.canDeploy ? undefined : t('permissions.missingDeploy')">
				<Button
					icon="pi pi-download"
					:label="t('invitations.generate')"
					:aria-label="t('invitations.generateAriaLabel')"
					:loading="isGenerating"
					:disabled="!canGenerate"
					@click="generate"
				/>
			</span>
			<p class="text-xs text-[var(--p-surface-600)]">{{ t("invitations.notStoredHint") }}</p>
		</div>
	</div>
</template>
