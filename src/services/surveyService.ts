import { OneRowDataTable, updateDataTableRow, addDataTableRow, deleteDataTableRow } from "@/services/genesys/dataTable";
import type { Survey } from "@/domain/survey/surveyTypes";
import { ensureSurveyTechnicalNames } from "@/domain/survey/surveyTypes";
import { useAppStore } from "@/stores/appStore";

async function resolveDataTableId(datatableId?: string): Promise<string> {
	if (datatableId && datatableId.trim()) {
		return datatableId;
	}
	return await useAppStore().ensureDataTableId();
}

export interface LoadSurveyResult {
	survey: Survey;
	rawRow: Record<string, any>;
}

export interface SurveyListItem {
	id: string;
	title: string;
	[key: string]: any;
}

export async function fetchSurveyDetail(
	datatableId: string | undefined,
	surveyId: string
): Promise<LoadSurveyResult> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = `survey_${surveyId}`;
	const row = await OneRowDataTable(resolvedTableId, rowKey);

	if (!row) {
		throw new Error(`Keine Zeile für '${rowKey}' in der Data Table gefunden.`);
	}

	const rawDraft = row.Draft ?? row.draft;
	let surveyData: Survey;

	if (rawDraft) {
		surveyData = typeof rawDraft === "string" ? JSON.parse(rawDraft) : rawDraft;
	} else {
		surveyData = row as unknown as Survey;
	}

	return {
		survey: surveyData,
		rawRow: row
	};
}

export async function syncSurveyInList(
	datatableId: string | undefined,
	survey: Survey
): Promise<SurveyListItem[]> {
	console.log("syncing survey in list", survey);

	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = "survey_list";
	let listRow: Record<string, any> | null = null;
	let currentList: SurveyListItem[] = [];

	try {
		listRow = await OneRowDataTable(resolvedTableId, rowKey);
		if (listRow) {
			const rawDraft = listRow.Draft ?? listRow.draft;
			if (rawDraft) {
				currentList = typeof rawDraft === "string" ? JSON.parse(rawDraft) : rawDraft;
			}
		}
	} catch (e) {
		console.warn("Could not load existing survey_list row, initializing new list:", e);
	}

	const displayName = survey.title?.trim() || survey.name?.trim() || "Unbenannte Umfrage";
	const existingIndex = currentList.findIndex(
		item => String(item.id ?? item.key) === String(survey.id)
	);

	if (existingIndex !== -1) {
		currentList[existingIndex] = {
			...currentList[existingIndex],
			id: survey.id,
			title: displayName
		};
	} else {
		currentList.push({
			id: survey.id,
			title: displayName,
		});
	}

	const serializedDraft = JSON.stringify(currentList);
	const rowPayload: Record<string, any> = {
		key: rowKey,
		Draft: serializedDraft,
		Prod: listRow?.Prod ?? "{}",
		Stage: listRow?.Stage ?? "{}",
		Backup: listRow?.Backup ?? "{}",
		lock: listRow?.lock ?? JSON.stringify({ locked_by: "", locked_since: "" })
	};

	await updateDataTableRow(resolvedTableId, rowKey, rowPayload);

	try {
		const app = useAppStore();
		app.surveys = currentList;
	} catch {
		// Ignored if Pinia store is not active
	}

	return currentList;
}

export type DeployTarget = "Stage" | "Prod";

/**
 * Deployt den Draft-Inhalt auf Stage oder Prod.
 * Bei Prod wird der aktuelle Prod-Inhalt zuerst in Backup gesichert.
 */
export async function deploySurvey(
	datatableId: string | undefined,
	surveyId: string,
	target: DeployTarget,
	existingRow: Record<string, any>
): Promise<void> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = `survey_${surveyId}`;

	const rowPayload: Record<string, any> = {
		key: rowKey,
		Draft: existingRow.Draft ?? "{}",
		Stage: existingRow.Stage ?? "{}",
		Prod: existingRow.Prod ?? "{}",
		Backup: existingRow.Backup ?? "{}",
		lock: existingRow.lock ?? JSON.stringify({ locked_by: "", locked_since: "" })
	};

	if (target === "Stage") {
		rowPayload.Stage = existingRow.Draft ?? "{}";
	} else {
		// Prod deployen: erst Backup sichern, dann Prod überschreiben
		rowPayload.Backup = existingRow.Prod ?? "{}";
		rowPayload.Prod = existingRow.Draft ?? "{}";
	}

	await updateDataTableRow(resolvedTableId, rowKey, rowPayload);
}

/**
 * Stellt die letzte Backup-Version auf Prod wieder her.
 */
export async function rollbackSurvey(
	datatableId: string | undefined,
	surveyId: string,
	existingRow: Record<string, any>
): Promise<void> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = `survey_${surveyId}`;

	const rowPayload: Record<string, any> = {
		key: rowKey,
		Draft: existingRow.Draft ?? "{}",
		Stage: existingRow.Stage ?? "{}",
		Prod: existingRow.Backup ?? "{}",
		Backup: existingRow.Backup ?? "{}",
		lock: existingRow.lock ?? JSON.stringify({ locked_by: "", locked_since: "" })
	};

	await updateDataTableRow(resolvedTableId, rowKey, rowPayload);
}

export async function saveSurveyDetail(
	datatableId: string | undefined,
	surveyId: string,
	survey: Survey,
	existingRow?: Record<string, any>,
	isNew?: boolean
): Promise<Survey> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = `survey_${surveyId}`;

	const updatedSurvey: Survey = JSON.parse(JSON.stringify(survey));
	updatedSurvey.updated_at = new Date().toISOString();
	updatedSurvey.version = (survey.version ?? 0) + 1;

	// Ensure technical names exist for survey & all questions without modifying already established names
	ensureSurveyTechnicalNames(updatedSurvey);

	const serializedDraft = JSON.stringify(updatedSurvey);

	// Genesys Cloud Data Table schema strictly requires exact field names (Draft)
	// and rejects any extra properties not defined in the schema.
	const rowPayload: Record<string, any> = {
		key: rowKey,
		Draft: serializedDraft,
		Prod: existingRow?.Prod ?? "{}",
		Stage: existingRow?.Stage ?? "{}",
		Backup: existingRow?.Backup ?? "{}",
		lock: existingRow?.lock ?? JSON.stringify({ locked_by: "", locked_since: "" })
	};

	if (isNew) {
		await addDataTableRow(resolvedTableId, rowPayload);
	} else {
		await updateDataTableRow(resolvedTableId, rowKey, rowPayload);
	}

	// Also sync the survey in the survey_list row
	await syncSurveyInList(resolvedTableId, updatedSurvey);

	return updatedSurvey;
}

export async function deleteSurvey(
	datatableId: string | undefined,
	surveyId: string
): Promise<void> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = `survey_${surveyId}`;

	// 1. Delete data table row
	await deleteDataTableRow(resolvedTableId, rowKey);

	// 2. Remove survey from survey_list row
	const listRowKey = "survey_list";
	let listRow: Record<string, any> | null = null;
	let currentList: SurveyListItem[] = [];

	try {
		listRow = await OneRowDataTable(resolvedTableId, listRowKey);
		if (listRow) {
			const rawDraft = listRow.Draft ?? listRow.draft;
			if (rawDraft) {
				currentList = typeof rawDraft === "string" ? JSON.parse(rawDraft) : rawDraft;
			}
		}
	} catch (e) {
		console.warn("Could not load survey_list row during delete:", e);
	}

	const updatedList = currentList.filter(
		item => String(item.id ?? item.key) !== String(surveyId)
	);

	const serializedDraft = JSON.stringify(updatedList);
	const rowPayload: Record<string, any> = {
		key: listRowKey,
		Draft: serializedDraft,
		Prod: listRow?.Prod ?? "{}",
		Stage: listRow?.Stage ?? "{}",
		Backup: listRow?.Backup ?? "{}",
		lock: listRow?.lock ?? JSON.stringify({ locked_by: "", locked_since: "" })
	};

	await updateDataTableRow(resolvedTableId, listRowKey, rowPayload);

	try {
		const app = useAppStore();
		app.surveys = updatedList;
	} catch {
		// Ignored if Pinia store is not active
	}
}
