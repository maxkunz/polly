import { computed, ref } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { Survey } from "@/domain/survey/surveyTypes";
import { i18n } from "@/i18n";
import { useAppStore } from "@/stores/appStore";
import { deploySurvey, rollbackSurvey, fetchSurveyDetail } from "@/services/surveyService";
import { readFieldVersion } from "@/domain/survey/surveyRow";
import { measureFlowPayload, type FlowPayloadSize } from "@/services/flowPayloadBudget";

export interface UseSurveyDeploymentOptions {
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
	/** Größe des übersetzten Drafts; null, wenn der Draft nicht übersetzbar ist. */
	draftPayloadSize: ComputedRef<FlowPayloadSize | null>;
	/** true, wenn das Flow-JSON das Architect-Budget überschreitet – Deployen ist dann gesperrt. */
	isDraftTooLarge: ComputedRef<boolean>;
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

	// Nur bei Änderung der Zeile neu berechnet (nach Laden bzw. Deploy), nicht laufend
	const draftPayloadSize = computed<FlowPayloadSize | null>(() => {
		const draft = existingRow.value?.Draft;
		if (!draft || draft === "{}") return null;
		try {
			return measureFlowPayload(draft);
		} catch {
			// Nicht übersetzbare Drafts meldet deploySurvey selbst
			return null;
		}
	});
	const isDraftTooLarge = computed(() => draftPayloadSize.value?.level === "exceeded");

	async function refresh(): Promise<void> {
		const res = await fetchSurveyDetail(surveyId);
		existingRow.value = res.rawRow;
	}

	async function run(action: () => Promise<void>): Promise<void> {
		// Zweite Absicherung neben den deaktivierten Buttons
		const app = useAppStore();
		await app.refreshRoles();
		if (!app.canDeploy) return;
		isDeploying.value = true;
		deployError.value = null;
		try {
			await action();
			await refresh();
		} catch (e: any) {
			deployError.value = e?.message ?? i18n.global.t("deployment.unknownError");
			// Auch bei Fehlern den aktuellen Stand zeigen (z. B. wenn der Draft zwischenzeitlich geändert wurde)
			await refresh().catch(err => console.warn("Could not refresh survey row after deploy error:", err));
		} finally {
			isDeploying.value = false;
		}
	}

	// Übergeben wird jeweils die angezeigte Version: Hat sie sich inzwischen geändert, bricht der Service ab
	async function deployToStage(): Promise<void> {
		await run(() => deploySurvey(surveyId, "Stage", readFieldVersion(existingRow.value?.Draft)));
	}

	async function deployToProd(): Promise<void> {
		await run(() => deploySurvey(surveyId, "Prod", readFieldVersion(existingRow.value?.Draft)));
	}

	async function rollback(): Promise<void> {
		await run(() => rollbackSurvey(surveyId, readFieldVersion(existingRow.value?.Prod)));
	}

	return {
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
	};
}
