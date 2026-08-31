<script setup lang="ts">
import { onMounted } from "vue";
import Card from "primevue/card";
import Slider from "primevue/slider";
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

const confirm = useConfirm();
const toast = useToast();

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

onMounted(async () => {
	await load();
});

async function performSave(): Promise<void> {
	const success = await executeSave();
	if (success) {
		toast.add({
			severity: "success",
			summary: "Queue Mapping gespeichert",
			detail: "Die Queue-Zuordnungen wurden erfolgreich in der Data Table aktualisiert.",
			life: 3500
		});
	}
}

function handleSave(): void {
	if (activeConflicts.value.length > 0) {
		const conflictList = activeConflicts.value
			.map(c => `• ${c.queueName} (Umfrage ID: ${c.surveyId})`)
			.join("\n");

		confirm.require({
			header: "Bestehende Zuordnungen überschreiben?",
			message: `Die folgenden Queues sind aktuell bereits einer anderen Umfrage zugeordnet:\n\n${conflictList}\n\nMöchten Sie diese Zuordnungen wirklich auf die aktuelle Umfrage übertragen und die bestehenden überschreiben?`,
			icon: "pi pi-exclamation-triangle",
			acceptLabel: "Ja, überschreiben",
			rejectLabel: "Abbrechen",
			acceptClass: "p-button-warning",
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
							Queue Mapping (Prod)
						</h3>
					</div>
					<div v-if="surveyMappings.length > 0" class="flex items-center gap-1.5">
						<Tag
							severity="info"
							:value="`${surveyMappings.length} ${surveyMappings.length === 1 ? 'Queue' : 'Queues'} zugeordnet`"
						/>
						<Tag
							severity="secondary"
							:value="`${surveyMappings[0]?.deliveryRate ?? deliveryRate}% Rate`"
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
						Lade Queue-Mapping...
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
						label="Erneut versuchen"
						@click="load"
					/>
				</div>

				<!-- Mapping Form -->
				<form v-else class="space-y-6" @submit.prevent="handleSave">
					<!-- Description / Intro -->
					<p class="text-sm text-[var(--p-text-muted-color)] leading-relaxed">
						Legen Sie fest, welchen Queues diese Umfrage nach Anrufende zugeordnet ist und mit welcher Wahrscheinlichkeit (Delivery Rate) sie ausgeliefert werden soll.
					</p>

					<!-- Save Error -->
					<Message v-if="saveError" severity="error" :closable="false">
						{{ saveError }}
					</Message>

					<!-- Delivery Rate Slider -->
					<div class="space-y-2 bg-[var(--p-surface-50)] dark:bg-[var(--p-surface-800)] p-4 rounded-xl border border-[var(--p-content-border-color)]">
						<div class="flex items-center justify-between">
							<label for="queue-delivery-rate-slider" class="text-sm font-medium text-[var(--p-text-color)]">
								Auslieferungswahrscheinlichkeit (Delivery Rate)
							</label>
							<span class="text-sm font-semibold font-mono px-2.5 py-0.5 rounded bg-[var(--p-primary-color)] text-white">
								{{ deliveryRate }} %
							</span>
						</div>
						<div class="pt-2 px-1">
							<Slider
								id="queue-delivery-rate-slider"
								v-model="deliveryRate"
								:min="1"
								:max="100"
								:step="1"
								class="w-full"
								aria-label="Auslieferungswahrscheinlichkeit in Prozent"
								:aria-valuenow="deliveryRate"
								:aria-valuemin="1"
								:aria-valuemax="100"
							/>
						</div>
						<div class="flex justify-between text-xs text-[var(--p-text-muted-color)] pt-1">
							<span>1% (Selten)</span>
							<span>50%</span>
							<span>100% (Immer)</span>
						</div>
					</div>

					<!-- Queue Textarea -->
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<label for="queue-names-input" class="text-sm font-medium text-[var(--p-text-color)]">
								Queues (eine Queue pro Zeile)
							</label>
							<span v-if="parsedQueues.length > 0" class="text-xs text-[var(--p-text-muted-color)] font-mono">
								{{ parsedQueues.length }} {{ parsedQueues.length === 1 ? 'Eintrag' : 'Einträge' }}
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
							Geben Sie die genauen Queue-Namen zeilenweise ein. Um das Mapping für diese Umfrage vollständig zu entfernen, leeren Sie das Textfeld und speichern Sie.
						</p>
					</div>

					<!-- Conflict Hint Message if any conflicts in currently typed input -->
					<Message v-if="activeConflicts.length > 0" severity="warn" :closable="false">
						<div class="space-y-1">
							<div class="font-medium text-sm">
								Hinweis: {{ activeConflicts.length }} {{ activeConflicts.length === 1 ? 'Queue ist' : 'Queues sind' }} bereits einer anderen Umfrage zugeordnet:
							</div>
							<ul class="text-xs list-disc list-inside space-y-0.5 opacity-90">
								<li v-for="c in activeConflicts" :key="c.queueName">
									<strong>{{ c.queueName }}</strong> (aktuelle Umfrage ID: <code class="font-mono">{{ c.surveyId }}</code>)
								</li>
							</ul>
							<div class="text-xs pt-1">
								Beim Speichern werden Sie zur Bestätigung aufgefordert, bevor die bestehende Zuordnung überschrieben wird.
							</div>
						</div>
					</Message>

					<!-- Action Buttons -->
					<div class="flex flex-wrap items-center justify-between gap-3 pt-2">
						<Button
							type="submit"
							icon="pi pi-save"
							label="Queue Mapping speichern"
							severity="primary"
							:loading="isSaving"
							:disabled="isSaving"
							aria-label="Queue Mapping speichern"
						/>
						<Button
							v-if="isDirty"
							type="button"
							icon="pi pi-undo"
							label="Änderungen zurücksetzen"
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
