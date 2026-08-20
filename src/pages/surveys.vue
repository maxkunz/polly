<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Card from "primevue/card";
import ProgressSpinner from "primevue/progressspinner";
import PageHeader from "@/components/layout/PageHeader.vue";
import { useAppStore } from "@/stores/appStore";
import { moduleRegistry } from "@/app/modules";
import { usePageControlBar } from "@/app/usePageControlBar";
import { OneRowDataTable } from "@/services/genesys/dataTable";

const app = useAppStore();
const route = useRoute();
const router = useRouter();

const { selectModules } = moduleRegistry();
const moduleMeta = computed(() => selectModules({ keys: ["surveys"] })[0]);

const isLoading = ref<boolean>(false);
const error = ref<string | null>(null);

const selectedSurveyDetail = ref<any>(null);
const isDetailLoading = ref<boolean>(false);
const detailError = ref<string | null>(null);

const surveysList = computed(() => app.surveys ?? []);

const selectedSurveyId = computed((): string | null => {
	const raw = route.query.id;
	return typeof raw === "string" && raw.length ? raw : null;
});

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

async function loadSurveyDetail(surveyId: string): Promise<void> {
	if (!surveyId) {
		selectedSurveyDetail.value = null;
		return;
	}

	const datatableId = "f928c3fd-a861-49ab-a148-738be4a62e35";
	const rowId = `survey_${surveyId}`;

	isDetailLoading.value = true;
	detailError.value = null;
	selectedSurveyDetail.value = null;

	try {
		const row = await OneRowDataTable(datatableId, rowId);
		console.log(`Loaded row for ${rowId}:`, row);

		if (row) {
			const rawDraft = row.Draft ?? row.draft;
			if (rawDraft) {
				selectedSurveyDetail.value = typeof rawDraft === "string" ? JSON.parse(rawDraft) : rawDraft;
				console.log(`Unpacked draft JSON for ${rowId}:`, selectedSurveyDetail.value);
			} else {
				selectedSurveyDetail.value = row;
			}
		} else {
			detailError.value = `Keine Zeile für '${rowId}' gefunden.`;
		}
	} catch (e: any) {
		console.error(`Failed to load detail for ${rowId}:`, e);
		detailError.value = e?.message || `Fehler beim Laden der Zeile '${rowId}'`;
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
			detailError.value = null;
		}
	},
	{ immediate: true }
);

usePageControlBar("surveys", () => ({
	search: null,
	actions: []
}));

onMounted(async () => {
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
});
</script>

<template>
	<section class="p-4">
		<div class="mb-8">
			<PageHeader
				v-if="moduleMeta"
				:title="selectedSurvey ? (selectedSurvey.title || selectedSurvey.name || moduleMeta.title) : moduleMeta.title"
				:iconKey="moduleMeta.key"
				:color="moduleMeta.color"
			/>
		</div>

		<div class="max-w-5xl mx-auto space-y-4">
			<!-- Selected Survey View -->
			<Card v-if="selectedSurveyId">
				<template #title>
					{{ selectedSurvey ? (selectedSurvey.title || selectedSurvey.name || 'Umfragen Details') : 'Umfragen Details' }}
				</template>
				<template #content>
					<div v-if="isDetailLoading" class="flex items-center gap-3 text-sm text-[var(--p-text-muted-color)]">
						<ProgressSpinner style="width: 20px; height: 20px" strokeWidth="4" />
						<span>Lade Umfragedetails für survey_{{ selectedSurveyId }}...</span>
					</div>
					<div v-else-if="detailError" class="text-sm text-red-500">
						{{ detailError }}
					</div>
					<div v-else-if="selectedSurveyDetail" class="space-y-2">
						<pre class="bg-[var(--p-surface-100)] p-3 rounded-lg text-xs overflow-x-auto">{{ JSON.stringify(selectedSurveyDetail, null, 2) }}</pre>
					</div>
					<div v-else class="text-sm text-[var(--p-text-muted-color)]">
						Keine Daten im Feld "draft" vorhanden.
					</div>
				</template>
			</Card>

			<!-- All Surveys Overview List -->
			<Card v-else>
				<template #title>Umfragen Übersicht</template>
				<template #content>
					<div v-if="isLoading" class="flex items-center gap-3 text-sm text-[var(--p-text-muted-color)]">
						<ProgressSpinner style="width: 20px; height: 20px" strokeWidth="4" />
						<span>Lade Umfragedaten...</span>
					</div>
					<div v-else-if="error" class="text-sm text-red-500">
						{{ error }}
					</div>
					<div v-else-if="surveysList.length > 0" class="space-y-2">
						<ul class="divide-y divide-[var(--p-content-border-color)]">
							<li
								v-for="(survey, index) in surveysList"
								:key="survey.id || survey.key || index"
								class="py-3 text-sm text-[var(--p-text-color)] flex items-center justify-between cursor-pointer hover:bg-[var(--p-surface-100)] px-2 rounded-lg transition"
								@click="selectSurvey(survey, index)"
							>
								<span class="font-medium">{{ survey.title || survey.name || 'Unbenannte Umfrage' }}</span>
								<i class="pi pi-chevron-right text-xs text-[var(--p-text-muted-color)]" />
							</li>
						</ul>
					</div>
					<div v-else class="text-sm text-[var(--p-text-muted-color)]">
						Keine Umfragen vorhanden.
					</div>
				</template>
			</Card>
		</div>
	</section>
</template>
