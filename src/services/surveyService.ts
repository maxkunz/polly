import { OneRowDataTable, updateDataTableRow, addDataTableRow, deleteDataTableRow, listAllDataTableRows } from "@/services/genesys/dataTable";
import type { Survey } from "@/domain/survey/surveyTypes";
import { ensureSurveyTechnicalNames } from "@/domain/survey/surveyTypes";
import type { QueueMappingData, QueueMappingEntry } from "@/domain/queueMapping/queueMappingTypes";
import { useAppStore } from "@/stores/appStore";
import { SURVEY_LOCK_TTL_MINUTES } from "@/constants/surveyConstants";
import { translateSurveyForFlow } from "./surveyFlowTranslator";
import { i18n } from "@/i18n";

export async function resolveDataTableId(datatableId?: string): Promise<string> {
	if (datatableId && datatableId.trim()) {
		return datatableId;
	}
	return await useAppStore().ensureDataTableId();
}

async function resolveMappingDataTableId(): Promise<string> {
	return await useAppStore().ensureMappingDataTableId();
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
		throw new Error(i18n.global.t("surveys.detail.rowNotFound", { key: rowKey }));
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
/**
 * Liest die Versionsnummer aus einem JSON-Feld der Survey-Zeile (Draft/Stage/Prod/Backup).
 * Liefert null, wenn das Feld leer oder nicht lesbar ist.
 */
export function readFieldVersion(raw: unknown): number | null {
	if (!raw || raw === "{}") return null;
	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		return typeof parsed?.version === "number" ? parsed.version : null;
	} catch {
		return null;
	}
}

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

	// Gleiche Version nicht erneut nach Prod deployen, sonst würde das Backup
	// mit derselben Version überschrieben und die Vorgängerversion ginge verloren.
	if (target === "Prod") {
		const draftVersion = readFieldVersion(existingRow.Draft);
		if (draftVersion !== null && draftVersion === readFieldVersion(existingRow.Prod)) {
			throw new Error(i18n.global.t("deployment.alreadyInProd", { version: draftVersion }));
		}
	}

	const translatedPayload = translateSurveyForFlow(existingRow.Draft ?? "{}");

	if (target === "Stage") {
		rowPayload.Stage = translatedPayload;
	} else {
		// Prod deployen: erst Backup sichern (1:1 Rohkopie), dann Prod überschreiben
		rowPayload.Backup = existingRow.Prod ?? "{}";
		rowPayload.Prod = translatedPayload;
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

/**
 * Wandelt eine rohe Zeile der Mapping-Tabelle (<projectTag>_polly_mapping) in einen
 * QueueMappingEntry um. Die Key-Spalte trägt zwar den Titel "QueueName", ihr JSON-Property-
 * Name ist aber wie bei jeder Data-Table-Zeile schlicht "key".
 */
function rowToQueueMappingEntry(row: Record<string, any>): QueueMappingEntry {
	return {
		queueName: String(row.key ?? row.queueName ?? ""),
		surveyId: String(row.SurveyId ?? row.surveyId ?? ""),
		deliveryRate: Number(row.DeliveryRate ?? row.deliveryRate ?? 0)
	};
}

export async function fetchQueueMapping(): Promise<QueueMappingData> {
	const resolvedTableId = await resolveMappingDataTableId();
	try {
		const rows = await listAllDataTableRows(resolvedTableId);
		return rows.map(rowToQueueMappingEntry);
	} catch (e) {
		console.warn("Could not load queue mapping rows from data table:", e);
		return [];
	}
}

export async function saveQueueMapping(
	surveyId: string,
	queues: string[],
	deliveryRate: number
): Promise<QueueMappingData> {
	const resolvedTableId = await resolveMappingDataTableId();

	// Clean inputs: unique, trimmed non-empty queues
	const cleanedQueues = Array.from(
		new Set(
			queues
				.map(q => q.trim())
				.filter(q => q.length > 0)
		)
	);
	const cleanedQueuesLower = new Set(cleanedQueues.map(q => q.toLowerCase()));

	const safeDeliveryRate = Math.max(1, Math.min(100, Math.round(deliveryRate)));

	const currentRows = await listAllDataTableRows(resolvedTableId);

	// 1. Zeilen dieser Umfrage löschen, deren Queue nicht mehr in der neuen Liste steht
	for (const row of currentRows) {
		const entry = rowToQueueMappingEntry(row);
		if (entry.surveyId === surveyId && !cleanedQueuesLower.has(entry.queueName.toLowerCase())) {
			await deleteDataTableRow(resolvedTableId, entry.queueName);
		}
	}

	// 2. Für jede gewünschte Queue: bestehende Zeile übernehmen (ggf. mit korrigierter
	//    Schreibweise neu anlegen) oder neu erzeugen
	for (const queueName of cleanedQueues) {
		const existingRow = currentRows.find(
			row => rowToQueueMappingEntry(row).queueName.toLowerCase() === queueName.toLowerCase()
		);

		if (existingRow) {
			const existingKey = String(existingRow.key ?? existingRow.queueName ?? "");
			if (existingKey === queueName) {
				await updateDataTableRow(resolvedTableId, queueName, {
					SurveyId: surveyId,
					DeliveryRate: safeDeliveryRate
				});
			} else {
				// Schreibweise unterscheidet sich vom Key: alte Zeile ersetzen statt umbenennen
				await deleteDataTableRow(resolvedTableId, existingKey);
				await addDataTableRow(resolvedTableId, {
					key: queueName,
					SurveyId: surveyId,
					DeliveryRate: safeDeliveryRate
				});
			}
		} else {
			await addDataTableRow(resolvedTableId, {
				key: queueName,
				SurveyId: surveyId,
				DeliveryRate: safeDeliveryRate
			});
		}
	}

	return await fetchQueueMapping();
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

