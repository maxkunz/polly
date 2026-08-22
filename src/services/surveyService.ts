import { OneRowDataTable, updateDataTableRow } from "@/services/genesys/dataTable";
import type { Survey } from "@/domain/survey/surveyTypes";
import { generateTechnicalName, ensureSurveyTechnicalNames } from "@/domain/survey/surveyTypes";
import { useAppStore } from "@/stores/appStore";

export const DEFAULT_SURVEY_DATATABLE_ID = "f928c3fd-a861-49ab-a148-738be4a62e35";

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
	datatableId: string = DEFAULT_SURVEY_DATATABLE_ID,
	surveyId: string
): Promise<LoadSurveyResult> {
	const rowKey = `survey_${surveyId}`;
	const row = await OneRowDataTable(datatableId, rowKey);

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
	datatableId: string = DEFAULT_SURVEY_DATATABLE_ID,
	survey: Survey
): Promise<SurveyListItem[]> {
	console.log("syncing survey in list", survey);

	const rowKey = "survey_list";
	let listRow: Record<string, any> | null = null;
	let currentList: SurveyListItem[] = [];

	try {
		listRow = await OneRowDataTable(datatableId, rowKey);
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

	await updateDataTableRow(datatableId, rowKey, rowPayload);

	try {
		const app = useAppStore();
		app.surveys = currentList;
	} catch {
		// Ignored if Pinia store is not active
	}

	return currentList;
}

export async function saveSurveyDetail(
	datatableId: string = DEFAULT_SURVEY_DATATABLE_ID,
	surveyId: string,
	survey: Survey,
	existingRow?: Record<string, any>
): Promise<Survey> {
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

	await updateDataTableRow(datatableId, rowKey, rowPayload);

	// Also sync the survey in the survey_list row
	await syncSurveyInList(datatableId, updatedSurvey);

	return updatedSurvey;
}


