<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Card from "primevue/card";
import Button from "primevue/button";
import ProgressSpinner from "primevue/progressspinner";
import PageHeader from "@/components/layout/PageHeader.vue";
import { useAppStore } from "@/stores/appStore";
import { useControlBarStore } from "@/stores/controlBarStore";
import { moduleRegistry } from "@/app/modules";
import { usePageControlBar } from "@/app/usePageControlBar";
import { fetchSurveyDetail, DEFAULT_SURVEY_DATATABLE_ID } from "@/services/surveyService";
import type { Survey } from "@/domain/survey/surveyTypes";
import SurveyEditor from "@/components/survey/SurveyEditor.vue";
import SurveyDeploymentView from "@/components/survey/SurveyDeploymentView.vue";

const app = useAppStore();
const route = useRoute();
const router = useRouter();
const controlBar = useControlBarStore();

const { selectModules } = moduleRegistry();
const moduleMeta = computed(() => selectModules({ keys: ["surveys"] })[0]);

const isLoading = ref<boolean>(false);
const error = ref<string | null>(null);

const selectedSurveyDetail = ref<Survey | null>(null);
const rawRowData = ref<Record<string, any> | null>(null);
const isDetailLoading = ref<boolean>(false);
const detailError = ref<string | null>(null);

const surveysList = computed(() => app.surveys ?? []);

const searchQuery = computed(() =>
	(controlBar.pageSearch?.query ?? "").trim().toLowerCase()
);

const filteredSurveys = computed(() => {
	const q = searchQuery.value;
	if (!q) return surveysList.value;
	return surveysList.value.filter((s: any) => {
		const title = (s.title || s.name || "").toLowerCase();
		const id = String(s.id || s.key || "").toLowerCase();
		return title.includes(q) || id.includes(q);
	});
});

const selectedSurveyId = computed((): string | null => {
	const raw = route.query.id;
	return typeof raw === "string" && raw.length ? raw : null;
});

const isDeployView = computed(
	() => route.query.deploy === "1" && !!selectedSurveyId.value
);

const selectedSurvey = computed(() => {
	if (!selectedSurveyId.value || !surveysList.value.length) return null;
	return (
		surveysList.value.find(
			(s: any, index: number) => String(s.id ?? s.key ?? index) === selectedSurveyId.value
		) ?? null
	);
});

function selectSurvey(survey: any, index: number): void {
	const id = String(survey.id ?? survey.key ?? index);
	router.push({ name: "surveys", query: { id } });
}

function handleBackToList(): void {
	router.push({ name: "surveys" });
}

function handleDeploy(): void {
	router.push({ name: "surveys", query: { id: selectedSurveyId.value!, deploy: "1" } });
}

async function handleDeployBack(): Promise<void> {
	if (selectedSurveyId.value) {
		await loadSurveyDetail(selectedSurveyId.value);
	}
	router.push({ name: "surveys", query: { id: selectedSurveyId.value! } });
}

function handleSurveySaved(updated: Survey, freshRow?: Record<string, any>): void {
	selectedSurveyDetail.value = updated;
	if (freshRow) {
		rawRowData.value = freshRow;
	}
	// Update in survey list if present
	const found = surveysList.value.find(
		(s: any) => String(s.id ?? s.key) === updated.id
	);
	if (found) {
		found.title = updated.title;
		found.name = updated.name;
	}
}

async function loadSurveyDetail(surveyId: string): Promise<void> {
	if (!surveyId) {
		selectedSurveyDetail.value = null;
		rawRowData.value = null;
		return;
	}

	isDetailLoading.value = true;
	detailError.value = null;
	selectedSurveyDetail.value = null;
	rawRowData.value = null;

	try {
		const res = await fetchSurveyDetail(DEFAULT_SURVEY_DATATABLE_ID, surveyId);
		selectedSurveyDetail.value = res.survey;
		rawRowData.value = res.rawRow;
	} catch (e: any) {
		console.error(`Failed to load detail for survey_${surveyId}:`, e);
		detailError.value = e?.message || `Fehler beim Laden der Umfrage '${surveyId}'`;
	} finally {
		isDetailLoading.value = false;
	}
}

watch(
	selectedSurveyId,
	(newId) => {
		if (newId) {
			loadSurveyDetail(newId);
		} else {
			selectedSurveyDetail.value = null;
			rawRowData.value = null;
			detailError.value = null;
		}
	},
	{ immediate: true }
);

usePageControlBar(
	"surveys",
	() => ({
		search: {
			enabled: !selectedSurveyId.value,
			placeholder: "Umfrage suchen...",
			query: ""
		},
		actions: selectedSurveyId.value
			? [
					{
						id: "surveys.back",
						label: "Zurück zur Übersicht",
						iconKey: "back",
						severity: "secondary",
						handler: handleBackToList
					}
			  ]
			: [
					{
						id: "surveys.reload",
						label: "Umfragen neu laden",
						iconKey: "reload",
						severity: "secondary",
						handler: () => loadSurveysList()
					}
			  ]
	}),
	[() => selectedSurveyId.value]
);

async function loadSurveysList(): Promise<void> {
	isLoading.value = true;
	error.value = null;

	try {
		await app.loadSurveys();
	} catch (e: any) {
		console.error("Failed to load survey_list row from data table:", e);
		error.value = e?.message || "Fehler beim Laden der Umfragedaten";
	} finally {
		isLoading.value = false;
	}
}

onMounted(async () => {
	await loadSurveysList();
});
</script>

<template>
	<section class="p-4 sm:p-6 max-w-6xl mx-auto" aria-labelledby="page-title">
		<div class="mb-6">
			<PageHeader
				v-if="moduleMeta"
				:title="selectedSurveyDetail ? (selectedSurveyDetail.title || selectedSurveyDetail.name) : (selectedSurvey ? (selectedSurvey.title || selectedSurvey.name || moduleMeta.title) : moduleMeta.title)"
				:iconKey="moduleMeta.key"
				:color="moduleMeta.color"
			/>
		</div>

		<!-- Selected Survey: Loading / Error / Editor -->
		<div v-if="selectedSurveyId">
			<!-- Loading State -->
			<div
				v-if="isDetailLoading"
				class="flex flex-col items-center justify-center py-16 text-center space-y-3"
				role="status"
				aria-live="polite"
			>
				<ProgressSpinner style="width: 44px; height: 44px" strokeWidth="4" />
				<span class="text-sm font-medium text-[var(--p-text-muted-color)]">
					Lade Umfragedetails...
				</span>
			</div>

			<!-- Error State -->
			<div v-else-if="detailError" role="alert" class="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 space-y-3">
				<div class="flex items-center gap-2 font-semibold text-base">
					<i class="pi pi-exclamation-triangle" aria-hidden="true" />
					<span>Fehler beim Laden der Umfrage</span>
				</div>
				<p class="text-sm">{{ detailError }}</p>
				<Button
					size="small"
					severity="danger"
					label="Zurück zur Übersicht"
					icon="pi pi-arrow-left"
					@click="handleBackToList"
				/>
			</div>

			<!-- Editor Component -->
			<SurveyEditor
				v-else-if="selectedSurveyDetail && !isDeployView"
				:survey="selectedSurveyDetail"
				:surveyId="selectedSurveyId"
				:existingRow="rawRowData ?? undefined"
				@saved="handleSurveySaved"
				@back="handleBackToList"
				@deploy="handleDeploy"
			/>

			<!-- Deployment View -->
			<SurveyDeploymentView
				v-else-if="isDeployView && selectedSurveyDetail && rawRowData"
				:survey="selectedSurveyDetail"
				:surveyId="selectedSurveyId!"
				:existingRow="rawRowData"
				@back="handleDeployBack"
			/>

			<!-- Empty Draft fallback -->
			<Card v-else class="text-center py-8">
				<template #content>
					<div class="text-sm text-[var(--p-text-muted-color)] mb-4">
						Keine Umfragedaten für diese ID vorhanden.
					</div>
					<Button
						size="small"
						severity="secondary"
						label="Zurück zur Übersicht"
						icon="pi pi-arrow-left"
						@click="handleBackToList"
					/>
				</template>
			</Card>
		</div>

		<!-- All Surveys Overview List -->
		<div v-else class="space-y-4">
			<Card class="border border-[var(--p-content-border-color)] shadow-sm rounded-2xl overflow-hidden">
				<template #title>
					<div class="flex items-center justify-between">
						<h2 class="text-base font-semibold text-[var(--p-text-color)]">
							Verfügbare Umfragen ({{ filteredSurveys.length }})
						</h2>
					</div>
				</template>
				<template #content>
					<!-- Loading -->
					<div
						v-if="isLoading"
						class="flex items-center justify-center py-10 gap-3 text-sm text-[var(--p-text-muted-color)]"
						role="status"
						aria-live="polite"
					>
						<ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
						<span>Lade Umfragedaten...</span>
					</div>

					<!-- Error -->
					<div v-else-if="error" role="alert" class="p-4 bg-red-50 text-red-700 rounded-xl text-sm">
						{{ error }}
					</div>

					<!-- List -->
					<div v-else-if="filteredSurveys.length > 0">
						<ul class="divide-y divide-[var(--p-content-border-color)]" role="list">
							<li
								v-for="(survey, index) in filteredSurveys"
								:key="survey.id || survey.key || index"
								class="transition hover:bg-[var(--p-surface-50)] rounded-xl"
							>
								<button
									type="button"
									class="w-full text-left py-4 px-4 flex items-center justify-between gap-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--p-primary-color)] rounded-xl"
									:aria-label="`Umfrage öffnen: ${survey.title || survey.name || 'Unbenannte Umfrage'}`"
									@click="selectSurvey(survey, index)"
								>
									<div class="space-y-1 min-w-0">
										<div class="font-semibold text-sm text-[var(--p-text-color)] truncate">
											{{ survey.title || survey.name || 'Unbenannte Umfrage' }}
										</div>
										<div class="text-xs text-[var(--p-text-muted-color)] flex items-center gap-3">
											<span>ID: <code class="font-mono">{{ String(survey.id || survey.key || index).slice(0, 18) }}...</code></span>
										</div>
									</div>
									<div class="flex items-center gap-2 text-[var(--p-text-muted-color)] shrink-0">
										<span class="text-xs hidden sm:inline">Bearbeiten</span>
										<i class="pi pi-chevron-right text-xs" aria-hidden="true" />
									</div>
								</button>
							</li>
						</ul>
					</div>

					<!-- Empty List -->
					<div v-else class="text-center py-10 text-sm text-[var(--p-text-muted-color)]">
						{{ searchQuery ? 'Keine Umfragen für die Suchanfrage gefunden.' : 'Keine Umfragen vorhanden.' }}
					</div>
				</template>
			</Card>
		</div>
	</section>
</template>
