import { computed, ref } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { Survey } from "@/domain/survey/surveyTypes";
import { i18n } from "@/i18n";
import { useAppStore } from "@/stores/appStore";
import {
	deploySurvey,
	rollbackSurvey,
	fetchSurveyDetail,
	readFieldVersion
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
	/** true, wenn die Draft-Version bereits in Prod liegt – erneutes Prod-Deploy ist dann gesperrt. */
	isDraftInProd: ComputedRef<boolean>;
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
	datatableId,
	surveyId,
	existingRow
}: UseSurveyDeploymentOptions): UseSurveyDeploymentReturn {
	const isDeploying = ref(false);
	const deployError = ref<string | null>(null);

	const stageSnapshot = computed(() => parseField(existingRow.value, "Stage"));
	const prodSnapshot = computed(() => parseField(existingRow.value, "Prod"));
	const backupSnapshot = computed(() => parseField(existingRow.value, "Backup"));
	const isDraftInProd = computed(() => {
		const draftVersion = readFieldVersion(existingRow.value?.Draft);
		return draftVersion !== null && draftVersion === readFieldVersion(existingRow.value?.Prod);
	});

	async function refresh(): Promise<void> {
		const res = await fetchSurveyDetail(datatableId, surveyId);
		existingRow.value = res.rawRow;
	}

	async function run(action: () => Promise<void>): Promise<void> {
		// Zweite Absicherung neben den deaktivierten Buttons
		if (!useAppStore().canDeploy) return;
		isDeploying.value = true;
		deployError.value = null;
		try {
			await action();
			await refresh();
		} catch (e: any) {
			deployError.value = e?.message ?? i18n.global.t("deployment.unknownError");
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
		isDraftInProd,
		deployToStage,
		deployToProd,
		rollback
	};
}
