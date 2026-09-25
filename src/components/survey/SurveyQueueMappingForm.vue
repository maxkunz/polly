<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import Card from "primevue/card";
import SelectButton from "primevue/selectbutton";
import Textarea from "primevue/textarea";
import Button from "primevue/button";
import Message from "primevue/message";
import Tag from "primevue/tag";
import ProgressSpinner from "primevue/progressspinner";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useQueueMapping } from "@/composables/useQueueMapping";

const props = defineProps<{
	surveyId: string;
	datatableId?: string;
}>();

const emit = defineEmits<{
	(e: "update:isDirty", isDirty: boolean): void;
}>();

const confirm = useConfirm();
const toast = useToast();
const { t } = useI18n();

const deliveryRateOptions = [25, 50, 75, 100];

const {
	isLoading,
	isSaving,
	loadError,
	saveError,
	queueNamesText,
	deliveryRate,
	surveyMappings,
	parsedQueues,
	isDirty,
	activeConflicts,
	load,
	executeSave,
	resetForm
} = useQueueMapping({
	datatableId: props.datatableId,
	surveyId: props.surveyId
});

watch(
	isDirty,
	(dirty) => {
		emit("update:isDirty", dirty);
	},
	{ immediate: true }
);

onBeforeUnmount(() => {
	emit("update:isDirty", false);
});

onMounted(async () => {
	await load();
});

async function performSave(): Promise<void> {
	const success = await executeSave();
	if (success) {
		toast.add({
			severity: "success",
			summary: t("queueMapping.toast.savedSummary"),
			detail: t("queueMapping.toast.savedDetail"),
			life: 3500
		});
	}
}

function handleSave(): void {
	if (activeConflicts.value.length > 0) {
		const conflictList = activeConflicts.value
			.map(c => t("queueMapping.overwriteConfirm.listItem", { queueName: c.queueName, surveyId: c.surveyId }))
			.join("\n");

		confirm.require({
			header: t("queueMapping.overwriteConfirm.header"),
			message: t("queueMapping.overwriteConfirm.message", { list: conflictList }),
			icon: "pi pi-exclamation-triangle",
			acceptLabel: t("queueMapping.overwriteConfirm.acceptLabel"),
			rejectLabel: t("queueMapping.overwriteConfirm.rejectLabel"),
			acceptClass: "p-button-danger",
			accept: async () => {
				await performSave();
			}
		});
	} else {
		void performSave();
	}
}
</script>

<template>
	<section class="space-y-4" aria-labelledby="queue-mapping-heading">
		<Card class="border border-[var(--p-content-border-color)] shadow-sm rounded-2xl">
			<template #title>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<i class="pi pi-sliders-h text-[var(--p-primary-color)] text-lg" aria-hidden="true" />
						<h3 id="queue-mapping-heading" class="text-base font-semibold text-[var(--p-text-color)]">
							{{ t("queueMapping.title") }}
						</h3>
					</div>
					<div v-if="surveyMappings.length > 0" class="flex items-center gap-1.5">
						<Tag
							severity="info"
							:value="t('queueMapping.queueCount', surveyMappings.length)"
						/>
						<Tag
							severity="secondary"
							:value="t('queueMapping.rate', { rate: surveyMappings[0]?.deliveryRate ?? deliveryRate })"
						/>
					</div>
				</div>
			</template>

			<template #content>
				<!-- Loading State -->
				<div
					v-if="isLoading"
					class="flex flex-col items-center justify-center py-8 text-center space-y-3"
					role="status"
					aria-live="polite"
				>
					<ProgressSpinner style="width: 32px; height: 32px" strokeWidth="4" />
					<span class="text-sm font-medium text-[var(--p-text-muted-color)]">
						{{ t("queueMapping.loading") }}
					</span>
				</div>

				<!-- Load Error -->
				<div v-else-if="loadError" class="space-y-3">
					<Message severity="error" :closable="false">
						{{ loadError }}
					</Message>
					<Button
						size="small"
						severity="secondary"
						icon="pi pi-refresh"
						:label="t('queueMapping.retry')"
						@click="load"
					/>
				</div>

				<!-- Mapping Form -->
				<form v-else class="space-y-6" @submit.prevent="handleSave">
					<!-- Description / Intro -->
					<p class="text-sm text-[var(--p-text-muted-color)] leading-relaxed">
						{{ t("queueMapping.intro") }}
					</p>

					<!-- Save Error -->
					<Message v-if="saveError" severity="error" :closable="false">
						{{ saveError }}
					</Message>

					<!-- Delivery Rate Selection -->
					<div class="space-y-2 bg-[var(--p-surface-50)] p-4 rounded-xl border border-[var(--p-content-border-color)]">
						<div class="flex items-center justify-between">
							<label for="queue-delivery-rate-select" class="text-sm font-medium text-[var(--p-text-color)]">
								{{ t("queueMapping.deliveryRateLabel") }}
							</label>
							<span class="text-sm font-semibold font-mono px-2.5 py-0.5 rounded bg-[var(--p-primary-color)] text-white">
								{{ deliveryRate }} %
							</span>
						</div>
						<div class="pt-2 px-1">
							<SelectButton
								id="queue-delivery-rate-select"
								v-model="deliveryRate"
								:options="deliveryRateOptions"
								:allowEmpty="false"
								class="w-full"
								:aria-label="t('queueMapping.deliveryRateAriaLabel')"
							>
								<template #option="{ option }">
									{{ option }} %
								</template>
							</SelectButton>
						</div>
					</div>

					<!-- Queue Textarea -->
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<label for="queue-names-input" class="text-sm font-medium text-[var(--p-text-color)]">
								{{ t("queueMapping.queuesLabel") }}
							</label>
							<span v-if="parsedQueues.length > 0" class="text-xs text-[var(--p-text-muted-color)] font-mono">
								{{ t("queueMapping.entriesCount", parsedQueues.length) }}
							</span>
						</div>
						<Textarea
							id="queue-names-input"
							v-model="queueNamesText"
							class="w-full font-mono text-sm leading-relaxed"
							rows="5"
							autoResize
							placeholder=""
							aria-describedby="queue-names-hint"
						/>
						<p id="queue-names-hint" class="text-xs text-[var(--p-text-muted-color)]">
							{{ t("queueMapping.queuesHint") }}
						</p>
					</div>

					<!-- Conflict Hint Message if any conflicts in currently typed input -->
					<Message v-if="activeConflicts.length > 0" severity="warn" :closable="false">
						<div class="space-y-1">
							<div class="font-medium text-sm">
								{{ t("queueMapping.conflictHint", activeConflicts.length) }}
							</div>
							<ul class="text-xs list-disc list-inside space-y-0.5 opacity-90">
								<li v-for="c in activeConflicts" :key="c.queueName">
									<strong>{{ c.queueName }}</strong> ({{ t("queueMapping.conflictSurveyId", { id: c.surveyId }) }})
								</li>
							</ul>
							<div class="text-xs pt-1">
								{{ t("queueMapping.conflictFooter") }}
							</div>
						</div>
					</Message>

					<!-- Action Buttons -->
					<div class="flex flex-wrap items-center justify-between gap-3 pt-2">
						<Button
							type="submit"
							icon="pi pi-save"
							:label="t('queueMapping.save')"
							severity="primary"
							:loading="isSaving"
							:disabled="isSaving"
							:aria-label="t('queueMapping.save')"
						/>
						<Button
							v-if="isDirty"
							type="button"
							icon="pi pi-undo"
							:label="t('queueMapping.reset')"
							severity="secondary"
							variant="text"
							size="small"
							:disabled="isSaving"
							@click="resetForm"
						/>
					</div>
				</form>
			</template>
		</Card>
	</section>
</template>
