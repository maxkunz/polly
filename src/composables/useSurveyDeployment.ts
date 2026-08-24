import { computed, ref } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { Survey } from "@/domain/survey/surveyTypes";
import {
	deploySurvey,
	rollbackSurvey,
	fetchSurveyDetail,
	DEFAULT_SURVEY_DATATABLE_ID
} from "@/services/surveyService";

export interface UseSurveyDeploymentOptions {
	datatableId?: string;
	surveyId: string;
	existingRow: Ref<Record<string, any> | null>;
}

export interface UseSurveyDeploymentReturn {
	isDeploying: Ref<boolean>;
	deployError: Ref<string | null>;
	stageSnapshot: ComputedRef<Survey | null>;
	prodSnapshot: ComputedRef<Survey | null>;
	backupSnapshot: ComputedRef<Survey | null>;
	deployToStage(): Promise<void>;
	deployToProd(): Promise<void>;
	rollback(): Promise<void>;
}

function parseField(row: Record<string, any> | null, field: string): Survey | null {
	if (!row) return null;
	const raw = row[field];
	if (!raw || raw === "{}" || raw === "") return null;
	try {
		return typeof raw === "string" ? JSON.parse(raw) : (raw as Survey);
	} catch {
		return null;
	}
}

export function useSurveyDeployment({
	datatableId = DEFAULT_SURVEY_DATATABLE_ID,
	surveyId,
	existingRow
}: UseSurveyDeploymentOptions): UseSurveyDeploymentReturn {
	const isDeploying = ref(false);
	const deployError = ref<string | null>(null);

	const stageSnapshot = computed(() => parseField(existingRow.value, "Stage"));
	const prodSnapshot = computed(() => parseField(existingRow.value, "Prod"));
	const backupSnapshot = computed(() => parseField(existingRow.value, "Backup"));

	async function refresh(): Promise<void> {
		const res = await fetchSurveyDetail(datatableId, surveyId);
		existingRow.value = res.rawRow;
	}

	async function run(action: () => Promise<void>): Promise<void> {
		isDeploying.value = true;
		deployError.value = null;
		try {
			await action();
			await refresh();
		} catch (e: any) {
			deployError.value = e?.message ?? "Unbekannter Fehler beim Deployment";
		} finally {
			isDeploying.value = false;
		}
	}

	async function deployToStage(): Promise<void> {
		await run(() => deploySurvey(datatableId, surveyId, "Stage", existingRow.value!));
	}

	async function deployToProd(): Promise<void> {
		await run(() => deploySurvey(datatableId, surveyId, "Prod", existingRow.value!));
	}

	async function rollback(): Promise<void> {
		await run(() => rollbackSurvey(datatableId, surveyId, existingRow.value!));
	}

	return {
		isDeploying,
		deployError,
		stageSnapshot,
		prodSnapshot,
		backupSnapshot,
		deployToStage,
		deployToProd,
		rollback
	};
}
