import { OneRowDataTable, updateDataTableRow, addDataTableRow, deleteDataTableRow } from "@/services/genesys/dataTable";
import type { Survey } from "@/domain/survey/surveyTypes";
import { ensureSurveyTechnicalNames } from "@/domain/survey/surveyTypes";
import type { QueueMappingData, QueueMappingEntry } from "@/domain/queueMapping/queueMappingTypes";
import { useAppStore } from "@/stores/appStore";
import { SURVEY_LOCK_TTL_MINUTES } from "@/constants/surveyConstants";

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
		lock: JSON.stringify({ locked_by: "", locked_since: "" })
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

export interface FetchQueueMappingResult {
	mapping: QueueMappingData;
	rawRow: Record<string, any> | null;
}

export async function fetchQueueMapping(
	datatableId?: string
): Promise<FetchQueueMappingResult> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = "queue_mapping";
	let rawRow: Record<string, any> | null = null;
	let mapping: QueueMappingData = [];

	try {
		rawRow = await OneRowDataTable(resolvedTableId, rowKey);
		if (rawRow) {
			const rawProd = rawRow.Prod ?? rawRow.prod;
			if (rawProd) {
				const parsed = typeof rawProd === "string" ? JSON.parse(rawProd) : rawProd;
				if (Array.isArray(parsed)) {
					mapping = parsed;
				}
			}
		}
	} catch (e) {
		console.warn("Could not load queue_mapping row from data table:", e);
	}

	return {
		mapping,
		rawRow
	};
}

export async function saveQueueMapping(
	datatableId: string | undefined,
	surveyId: string,
	queues: string[],
	deliveryRate: number,
	existingRawRow?: Record<string, any> | null
): Promise<QueueMappingData> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = "queue_mapping";

	let currentRow = existingRawRow;
	if (!currentRow) {
		try {
			currentRow = await OneRowDataTable(resolvedTableId, rowKey);
		} catch {
			currentRow = null;
		}
	}

	let currentMapping: QueueMappingData = [];
	const rawProd = currentRow?.Prod ?? currentRow?.prod;
	if (rawProd) {
		try {
			const parsed = typeof rawProd === "string" ? JSON.parse(rawProd) : rawProd;
			if (Array.isArray(parsed)) {
				currentMapping = parsed;
			}
		} catch {
			currentMapping = [];
		}
	}

	// Clean inputs: unique, trimmed non-empty queues
	const cleanedQueues = Array.from(
		new Set(
			queues
				.map(q => q.trim())
				.filter(q => q.length > 0)
		)
	);

	// Ensure each queue only exists once:
	// 1. Remove all previous entries belonging to this surveyId
	// 2. Also remove any entry whose queueName matches one of the new cleanedQueues (case-insensitive)
	const remainingEntries = currentMapping.filter(
		entry =>
			entry.surveyId !== surveyId &&
			!cleanedQueues.some(q => q.toLowerCase() === (entry.queueName ?? "").toLowerCase())
	);

	// Create new entries for this survey
	const safeDeliveryRate = Math.max(1, Math.min(100, Math.round(deliveryRate)));
	const newEntries: QueueMappingEntry[] = cleanedQueues.map(queueName => ({
		queueName,
		surveyId,
		deliveryRate: safeDeliveryRate
	}));

	const updatedMapping: QueueMappingData = [...remainingEntries, ...newEntries];
	const serializedProd = JSON.stringify(updatedMapping);

	const rowPayload: Record<string, any> = {
		key: rowKey,
		Draft: currentRow?.Draft ?? "[]",
		Stage: currentRow?.Stage ?? "[]",
		Prod: serializedProd,
		Backup: currentRow?.Backup ?? "[]",
		lock: currentRow?.lock ?? JSON.stringify({ locked_by: "", locked_since: "" })
	};

	if (!currentRow) {
		try {
			await addDataTableRow(resolvedTableId, rowPayload);
		} catch {
			await updateDataTableRow(resolvedTableId, rowKey, rowPayload);
		}
	} else {
		await updateDataTableRow(resolvedTableId, rowKey, rowPayload);
	}

	return updatedMapping;
}

export interface SurveyLockData {
	locked_by: string;
	locked_since: string;
}

export function parseSurveyLock(lockRaw: unknown): SurveyLockData {
	const defaultLock: SurveyLockData = { locked_by: "", locked_since: "" };
	if (!lockRaw) return defaultLock;
	if (typeof lockRaw === "object") {
		return {
			locked_by: String((lockRaw as any).locked_by ?? "").trim(),
			locked_since: String((lockRaw as any).locked_since ?? "").trim()
		};
	}
	if (typeof lockRaw === "string") {
		try {
			const parsed = JSON.parse(lockRaw);
			return {
				locked_by: String(parsed?.locked_by ?? "").trim(),
				locked_since: String(parsed?.locked_since ?? "").trim()
			};
		} catch {
			return defaultLock;
		}
	}
	return defaultLock;
}

export function isSurveyLockStale(
	lock: SurveyLockData,
	ttlMinutes: number = SURVEY_LOCK_TTL_MINUTES
): boolean {
	if (!lock.locked_by || !lock.locked_since) {
		return true;
	}
	const lockedAt = new Date(lock.locked_since).getTime();
	if (Number.isNaN(lockedAt)) {
		return true;
	}
	const diffMinutes = (Date.now() - lockedAt) / (1000 * 60);
	return diffMinutes >= ttlMinutes;
}

export function checkSurveyLockConflict(
	lock: SurveyLockData,
	currentUsername: string,
	ttlMinutes: number = SURVEY_LOCK_TTL_MINUTES
): { hasConflict: boolean; lock: SurveyLockData } {
	if (isSurveyLockStale(lock, ttlMinutes)) {
		return { hasConflict: false, lock };
	}
	const cleanCurrent = currentUsername.trim().toLowerCase();
	const cleanLockBy = lock.locked_by.trim().toLowerCase();
	const isOwnedByMe = Boolean(cleanCurrent && cleanLockBy === cleanCurrent);
	return {
		hasConflict: !isOwnedByMe,
		lock
	};
}

export async function acquireSurveyLock(
	datatableId: string | undefined,
	surveyId: string,
	username: string,
	existingRow?: Record<string, any>
): Promise<Record<string, any>> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = `survey_${surveyId}`;

	let currentRow = existingRow;
	if (!currentRow) {
		currentRow = await OneRowDataTable(resolvedTableId, rowKey);
	}

	const newLock: SurveyLockData = {
		locked_by: username,
		locked_since: new Date().toISOString()
	};

	const rowPayload: Record<string, any> = {
		key: rowKey,
		Draft: currentRow?.Draft ?? "{}",
		Prod: currentRow?.Prod ?? "{}",
		Stage: currentRow?.Stage ?? "{}",
		Backup: currentRow?.Backup ?? "{}",
		lock: JSON.stringify(newLock)
	};

	await updateDataTableRow(resolvedTableId, rowKey, rowPayload);

	return {
		...(currentRow || {}),
		...rowPayload
	};
}

export async function releaseSurveyLock(
	datatableId: string | undefined,
	surveyId: string,
	username?: string,
	existingRow?: Record<string, any>
): Promise<Record<string, any> | null> {
	try {
		const resolvedTableId = await resolveDataTableId(datatableId);
		const rowKey = `survey_${surveyId}`;

		let currentRow = existingRow;
		if (!currentRow) {
			currentRow = await OneRowDataTable(resolvedTableId, rowKey);
		}

		if (!currentRow) return null;

		const currentLock = parseSurveyLock(currentRow.lock);
		// If lock is held by someone else and not stale, do not overwrite unless forced or username matched
		if (
			username &&
			currentLock.locked_by &&
			currentLock.locked_by.trim().toLowerCase() !== username.trim().toLowerCase() &&
			!isSurveyLockStale(currentLock)
		) {
			return currentRow;
		}

		const rowPayload: Record<string, any> = {
			key: rowKey,
			Draft: currentRow?.Draft ?? "{}",
			Prod: currentRow?.Prod ?? "{}",
			Stage: currentRow?.Stage ?? "{}",
			Backup: currentRow?.Backup ?? "{}",
			lock: JSON.stringify({ locked_by: "", locked_since: "" })
		};

		await updateDataTableRow(resolvedTableId, rowKey, rowPayload);
		return {
			...currentRow,
			...rowPayload
		};
	} catch (err) {
		console.warn("Could not release survey lock:", err);
		return null;
	}
}

