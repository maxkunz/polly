import { computed, ref } from "vue";
import type { Ref } from "vue";
import { i18n } from "@/i18n";
import { useAppStore } from "@/stores/appStore";
import { deploySurvey, rollbackSurvey, fetchSurveyDetail } from "@/services/surveyService";
import { readFieldVersion } from "@/domain/survey/surveyRow";
import { measureFlowPayload, type FlowPayloadSize } from "@/services/flowPayloadBudget";
import type { FlowSurvey } from "@/services/surveyFlowTranslator";

export interface UseSurveyDeploymentOptions {
	surveyId: string;
	existingRow: Ref<Record<string, any> | null>;
}

/** Stage/Prod/Backup enthalten das übersetzte Flow-Format, nicht den Editor-Draft. */
function parseFlowField(row: Record<string, any> | null, field: "Stage" | "Prod" | "Backup"): FlowSurvey | null {
	if (!row) return null;
	const raw = row[field];
	if (!raw || raw === "{}") return null;
	try {
		return typeof raw === "string" ? JSON.parse(raw) : (raw as FlowSurvey);
	} catch {
		return null;
	}
}

export function useSurveyDeployment({ surveyId, existingRow }: UseSurveyDeploymentOptions) {
	const isDeploying = ref(false);
	const deployError = ref<string | null>(null);

	const stageSnapshot = computed(() => parseFlowField(existingRow.value, "Stage"));
	const prodSnapshot = computed(() => parseFlowField(existingRow.value, "Prod"));
	const backupSnapshot = computed(() => parseFlowField(existingRow.value, "Backup"));
	/** true, wenn die Draft-Version bereits in Prod liegt – erneutes Prod-Deploy ist dann gesperrt. */
	const isDraftInProd = computed(() => {
		const draftVersion = readFieldVersion(existingRow.value?.Draft);
		return draftVersion !== null && draftVersion === readFieldVersion(existingRow.value?.Prod);
	});

	// Größe des übersetzten Drafts; null, wenn der Draft nicht übersetzbar ist.
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
	/** true, wenn das Flow-JSON das Architect-Budget überschreitet – Deployen ist dann gesperrt. */
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
