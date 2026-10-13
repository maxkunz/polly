import { OneRowDataTable, updateDataTableRow, addDataTableRow, deleteDataTableRow, listAllDataTableRows } from "@/services/genesys/dataTable";
import type { Survey } from "@/domain/survey/surveyTypes";
import { ensureSurveyTechnicalNames } from "@/domain/survey/surveyTypes";
import {
	EMPTY_SURVEY_LOCK,
	buildSurveyRowPayload,
	readFieldVersion,
	surveyRowKey,
	type SurveyRowPatch
} from "@/domain/survey/surveyRow";
import type { QueueMappingData, QueueMappingEntry } from "@/domain/queueMapping/queueMappingTypes";
import { useAppStore } from "@/stores/appStore";
import { SURVEY_LOCK_TTL_MINUTES } from "@/constants/surveyConstants";
import { translateSurveyForFlow } from "./surveyFlowTranslator";
import { evaluateFlowPayloadSize } from "./flowPayloadBudget";
import { getErrorStatus } from "./genesys/retry";
import { i18n, currentLocaleTag } from "@/i18n";

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
	const rowKey = surveyRowKey(surveyId);
	const row = await OneRowDataTable(resolvedTableId, rowKey);

	if (!row) {
		throw new Error(i18n.global.t("surveys.detail.rowNotFound", { key: rowKey }));
	}

	const rawDraft = row.Draft;
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

const SURVEY_LIST_ROW_KEY = "survey_list";

/**
 * Liest den Umfrage-Index (Zeile survey_list, Liste im Feld Draft).
 * Nur eine fehlende Zeile (404) gilt als leere Liste. Jeder andere Fehler wird geworfen:
 * Sonst schriebe der Aufrufer eine unvollständige Liste zurück und alle übrigen Umfragen
 * verschwänden aus der Übersicht.
 */
export async function readSurveyList(
	datatableId: string
): Promise<{ items: SurveyListItem[]; row: Record<string, any> | null }> {
	let row: Record<string, any> | null;
	try {
		row = await OneRowDataTable(datatableId, SURVEY_LIST_ROW_KEY);
	} catch (err) {
		if (getErrorStatus(err) === 404) return { items: [], row: null };
		throw err;
	}

	const rawDraft = row?.Draft;
	if (!rawDraft) return { items: [], row };
	const items = typeof rawDraft === "string" ? JSON.parse(rawDraft) : rawDraft;
	if (!Array.isArray(items)) {
		throw new Error(i18n.global.t("surveys.list.invalidIndex"));
	}
	return { items, row };
}

/** Schreibt den Umfrage-Index; legt die Zeile an, falls sie noch nicht existiert. */
async function writeSurveyList(
	datatableId: string,
	items: SurveyListItem[],
	listRow: Record<string, any> | null
): Promise<void> {
	const rowPayload: Record<string, any> = {
		key: SURVEY_LIST_ROW_KEY,
		Draft: JSON.stringify(items),
		Prod: listRow?.Prod ?? "{}",
		Stage: listRow?.Stage ?? "{}",
		Backup: listRow?.Backup ?? "{}",
		lock: listRow?.lock ?? JSON.stringify({ locked_by: "", locked_since: "" })
	};

	if (listRow) {
		await updateDataTableRow(datatableId, SURVEY_LIST_ROW_KEY, rowPayload);
	} else {
		await addDataTableRow(datatableId, rowPayload);
	}

	try {
		useAppStore().surveys = items;
	} catch {
		// Ignored if Pinia store is not active
	}
}

export async function syncSurveyInList(
	datatableId: string | undefined,
	survey: Survey
): Promise<SurveyListItem[]> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const { items: currentList, row: listRow } = await readSurveyList(resolvedTableId);

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

	await writeSurveyList(resolvedTableId, currentList, listRow);
	return currentList;
}

/**
 * Ändert die Zeile `survey_<id>` auf Basis ihres AKTUELLEN Stands: frisch lesen, Änderung
 * anwenden, ganze Zeile schreiben. So wird kein zwischenzeitlicher Stand anderer Nutzer
 * (z. B. ein Deploy) mit einer veralteten Kopie aus dem Editor überschrieben.
 * Genesys-Data-Tables kennen keine Versionsprüfung beim Schreiben; ein Restrisiko bleibt
 * nur im kurzen Moment zwischen Lesen und Schreiben.
 *
 * `change` erhält die frische Zeile und liefert die zu ändernden Felder, `null` für
 * „nichts schreiben“, oder wirft, um abzubrechen. Rückgabe ist die Zeile nach dem Schreiben.
 */
async function updateSurveyRow(
	datatableId: string | undefined,
	surveyId: string,
	change: (currentRow: Record<string, any>) => SurveyRowPatch | null
): Promise<Record<string, any>> {
	const resolvedTableId = await resolveDataTableId(datatableId);
	const rowKey = surveyRowKey(surveyId);
	const currentRow = await OneRowDataTable(resolvedTableId, rowKey);
	if (!currentRow) {
		throw new Error(i18n.global.t("surveys.detail.rowNotFound", { key: rowKey }));
	}

	const patch = change(currentRow);
	if (!patch) return currentRow;

	const payload = buildSurveyRowPayload(surveyId, currentRow, patch);
	await updateDataTableRow(resolvedTableId, rowKey, payload);
	return { ...currentRow, ...payload };
}

export type DeployTarget = "Stage" | "Prod";

/**
 * Deployt den Draft auf Stage oder Prod. Bei Prod wird der aktuelle Prod-Inhalt zuerst in
 * Backup gesichert. `expectedDraftVersion` ist die Version, die der Nutzer in der Ansicht
 * gesehen hat: Hat sich der Draft seitdem geändert, wird abgebrochen statt ungeprüft eine
 * andere Version zu deployen.
 */
export async function deploySurvey(
	datatableId: string | undefined,
	surveyId: string,
	target: DeployTarget,
	expectedDraftVersion: number | null
): Promise<void> {
	await updateSurveyRow(datatableId, surveyId, currentRow => {
		const draftVersion = readFieldVersion(currentRow.Draft);
		if (draftVersion !== expectedDraftVersion) {
			throw new Error(
				i18n.global.t("deployment.draftChanged", {
					expected: expectedDraftVersion ?? "–",
					current: draftVersion ?? "–"
				})
			);
		}

		// Gleiche Version nicht erneut nach Prod deployen, sonst würde das Backup
		// mit derselben Version überschrieben und die Vorgängerversion ginge verloren.
		if (target === "Prod" && draftVersion !== null && draftVersion === readFieldVersion(currentRow.Prod)) {
			throw new Error(i18n.global.t("deployment.alreadyInProd", { version: draftVersion }));
		}

		const translatedPayload = translateSurveyForFlow(currentRow.Draft ?? "{}");

		// Architect liest max. FLOW_PAYLOAD_MAX_CHARS Zeichen pro String – zu große
		// Umfragen nicht deployen, sonst scheitert der Flow erst im Anruf.
		const payloadSize = evaluateFlowPayloadSize(translatedPayload.length);
		if (payloadSize.level === "exceeded") {
			const format = new Intl.NumberFormat(currentLocaleTag());
			throw new Error(
				i18n.global.t("deployment.payloadTooLarge", {
					length: format.format(payloadSize.length),
					max: format.format(payloadSize.max)
				})
			);
		}

		if (target === "Stage") {
			return { Stage: translatedPayload };
		}
		// Prod deployen: erst Backup sichern (1:1 Rohkopie), dann Prod überschreiben
		return { Backup: currentRow.Prod ?? "{}", Prod: translatedPayload };
	});
}

/**
 * Stellt die Backup-Version auf Prod wieder her. Abbruch, wenn sich Prod seit der Anzeige
 * geändert hat (`expectedProdVersion`) – sonst würde ein anderes Backup zurückgespielt als angezeigt.
 */
export async function rollbackSurvey(
	datatableId: string | undefined,
	surveyId: string,
	expectedProdVersion: number | null
): Promise<void> {
	await updateSurveyRow(datatableId, surveyId, currentRow => {
		if (readFieldVersion(currentRow.Prod) !== expectedProdVersion) {
			throw new Error(i18n.global.t("deployment.prodChanged"));
		}
		return { Prod: currentRow.Backup ?? "{}" };
	});
}

/**
 * Speichert den Draft und gibt dabei das Umfrage-Lock frei. Stage/Prod/Backup bleiben auf dem
 * aktuellen Stand der Zeile.
 */
export async function saveSurveyDetail(
	datatableId: string | undefined,
	surveyId: string,
	survey: Survey,
	isNew?: boolean
): Promise<Survey> {
	const resolvedTableId = await resolveDataTableId(datatableId);

	const updatedSurvey: Survey = JSON.parse(JSON.stringify(survey));
	updatedSurvey.updated_at = new Date().toISOString();
	// Ensure technical names exist for survey & all questions without modifying already established names
	ensureSurveyTechnicalNames(updatedSurvey);

	if (isNew) {
		updatedSurvey.version = (survey.version ?? 0) + 1;
		const patch = { Draft: JSON.stringify(updatedSurvey), lock: EMPTY_SURVEY_LOCK };
		await addDataTableRow(resolvedTableId, buildSurveyRowPayload(surveyId, null, patch));
	} else {
		await updateSurveyRow(resolvedTableId, surveyId, currentRow => {
			// Von der höheren Version aus zählen: Hat jemand zwischenzeitlich gespeichert, bekäme
			// ein anderer Inhalt sonst dieselbe Versionsnummer (Deploy-Prüfungen vergleichen Versionen).
			const latest = Math.max(survey.version ?? 0, readFieldVersion(currentRow.Draft) ?? 0);
			updatedSurvey.version = latest + 1;
			return { Draft: JSON.stringify(updatedSurvey), lock: EMPTY_SURVEY_LOCK };
		});
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
	const rowKey = surveyRowKey(surveyId);

	// Liste zuerst lesen: Ist sie nicht lesbar, wird abgebrochen, bevor etwas gelöscht ist
	const { items: currentList, row: listRow } = await readSurveyList(resolvedTableId);

	await deleteDataTableRow(resolvedTableId, rowKey);

	const updatedList = currentList.filter(
		item => String(item.id ?? item.key) !== String(surveyId)
	);
	await writeSurveyList(resolvedTableId, updatedList, listRow);
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
	username: string
): Promise<Record<string, any>> {
	const newLock: SurveyLockData = {
		locked_by: username,
		locked_since: new Date().toISOString()
	};
	return await updateSurveyRow(datatableId, surveyId, () => ({ lock: JSON.stringify(newLock) }));
}

/** Gibt das Lock frei, sofern es nicht inzwischen von jemand anderem gehalten wird. */
export async function releaseSurveyLock(
	datatableId: string | undefined,
	surveyId: string,
	username?: string
): Promise<Record<string, any> | null> {
	try {
		return await updateSurveyRow(datatableId, surveyId, currentRow => {
			const currentLock = parseSurveyLock(currentRow.lock);
			const isHeldByOther =
				username &&
				currentLock.locked_by &&
				currentLock.locked_by.trim().toLowerCase() !== username.trim().toLowerCase() &&
				!isSurveyLockStale(currentLock);
			return isHeldByOther ? null : { lock: EMPTY_SURVEY_LOCK };
		});
	} catch (err) {
		console.warn("Could not release survey lock:", err);
		return null;
	}
}
