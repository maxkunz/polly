import { OneRowDataTable, updateDataTableRow, addDataTableRow, deleteDataTableRow } from "@/services/genesys/dataTable";
import type { Survey } from "@/domain/survey/surveyTypes";
import { collectTechnicalNames, ensureSurveyTechnicalNames } from "@/domain/survey/surveyTypes";
import {
	EMPTY_SURVEY_LOCK,
	SURVEY_LIST_ROW_KEY,
	buildSurveyListPayload,
	buildSurveyRowPayload,
	parseSurveyDraft,
	readFieldVersion,
	surveyRowKey,
	withSurveyListItem,
	type SurveyListItem,
	type SurveyRowPatch
} from "@/domain/survey/surveyRow";
import { useAppStore } from "@/stores/appStore";
import { isSurveyLockOwnedBy, isSurveyLockStale, parseSurveyLock, type SurveyLockData } from "@/domain/survey/surveyLock";
import { translateSurveyForFlow } from "./surveyFlowTranslator";
import { evaluateFlowPayloadSize } from "./flowPayloadBudget";
import { getErrorStatus } from "./genesys/retry";
import { i18n, currentLocaleTag } from "@/i18n";

/** ID der Umfrage-Data-Table (aus meta.setup bzw. der Start-URL) */
export async function surveyTableId(): Promise<string> {
	return await useAppStore().ensureDataTableId();
}

export interface LoadSurveyResult {
	survey: Survey;
	rawRow: Record<string, any>;
}

export type { SurveyListItem };

export async function fetchSurveyDetail(surveyId: string): Promise<LoadSurveyResult> {
	const resolvedTableId = await surveyTableId();
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
	const rowPayload = buildSurveyListPayload(items, listRow);

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

async function syncSurveyInList(datatableId: string, survey: Survey): Promise<SurveyListItem[]> {
	const { items: currentList, row: listRow } = await readSurveyList(datatableId);

	const displayName = survey.title?.trim() || survey.name?.trim() || i18n.global.t("surveys.list.unnamedSurvey");
	const updatedList = withSurveyListItem(currentList, { id: survey.id, title: displayName }) ?? currentList;

	await writeSurveyList(datatableId, updatedList, listRow);
	return updatedList;
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
	surveyId: string,
	change: (currentRow: Record<string, any>) => SurveyRowPatch | null
): Promise<Record<string, any>> {
	const resolvedTableId = await surveyTableId();
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
	surveyId: string,
	target: DeployTarget,
	expectedDraftVersion: number | null
): Promise<void> {
	await updateSurveyRow(surveyId, currentRow => {
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
export async function rollbackSurvey(surveyId: string, expectedProdVersion: number | null): Promise<void> {
	await updateSurveyRow(surveyId, currentRow => {
		if (readFieldVersion(currentRow.Prod) !== expectedProdVersion) {
			throw new Error(i18n.global.t("deployment.prodChanged"));
		}
		return { Prod: currentRow.Backup ?? "{}" };
	});
}

/** Der gespeicherte Draft hat eine andere Version als die, auf der der Editor-Stand beruht. */
export class SurveyDraftConflictError extends Error {
	constructor(
		public readonly expectedVersion: number | null,
		public readonly currentVersion: number | null
	) {
		super(`Draft changed (expected v${expectedVersion ?? "–"}, current v${currentVersion ?? "–"})`);
		this.name = "SurveyDraftConflictError";
	}
}

/**
 * Speichert den Draft und gibt dabei das Umfrage-Lock frei. Stage/Prod/Backup bleiben auf dem
 * aktuellen Stand der Zeile.
 *
 * `expectedDraftVersion` ist die Version, auf der der Editor-Stand beruht. Weicht der gespeicherte
 * Draft ab (z. B. hat jemand trotz Lock zwischenzeitlich gespeichert), wird mit
 * `SurveyDraftConflictError` abgebrochen. `undefined` überspringt die Prüfung (Überschreiben).
 */
export async function saveSurveyDetail(
	survey: Survey,
	isNew?: boolean,
	expectedDraftVersion?: number | null
): Promise<Survey> {
	const resolvedTableId = await surveyTableId();

	const updatedSurvey: Survey = JSON.parse(JSON.stringify(survey));
	updatedSurvey.updated_at = new Date().toISOString();

	if (isNew) {
		ensureSurveyTechnicalNames(updatedSurvey);
		updatedSurvey.version = (survey.version ?? 0) + 1;
		const patch = { Draft: JSON.stringify(updatedSurvey), lock: EMPTY_SURVEY_LOCK };
		await addDataTableRow(resolvedTableId, buildSurveyRowPayload(survey.id, null, patch));
	} else {
		await updateSurveyRow(survey.id, currentRow => {
			const currentVersion = readFieldVersion(currentRow.Draft);
			if (expectedDraftVersion !== undefined && currentVersion !== expectedDraftVersion) {
				throw new SurveyDraftConflictError(expectedDraftVersion, currentVersion);
			}
			const savedDraft = parseSurveyDraft(currentRow.Draft);
			// Bereits gespeicherte technische Namen sind Reporting-Schlüssel und werden unverändert
			// übernommen; nur neu hinzugekommene Fragen erhalten einmalig einen Namen aus dem Titel.
			ensureSurveyTechnicalNames(updatedSurvey, collectTechnicalNames(savedDraft));
			// Von der höheren Version aus zählen: Hat jemand zwischenzeitlich gespeichert, bekäme
			// ein anderer Inhalt sonst dieselbe Versionsnummer (Deploy-Prüfungen vergleichen Versionen).
			const latest = Math.max(survey.version ?? 0, currentVersion ?? 0);
			updatedSurvey.version = latest + 1;
			return { Draft: JSON.stringify(updatedSurvey), lock: EMPTY_SURVEY_LOCK };
		});
	}

	await syncSurveyInList(resolvedTableId, updatedSurvey);
	return updatedSurvey;
}

export async function deleteSurvey(surveyId: string): Promise<void> {
	const resolvedTableId = await surveyTableId();
	const rowKey = surveyRowKey(surveyId);

	// Liste zuerst lesen: Ist sie nicht lesbar, wird abgebrochen, bevor etwas gelöscht ist
	const { items: currentList, row: listRow } = await readSurveyList(resolvedTableId);

	await deleteDataTableRow(resolvedTableId, rowKey);

	const updatedList = currentList.filter(item => item.id !== surveyId);
	await writeSurveyList(resolvedTableId, updatedList, listRow);
}

export async function acquireSurveyLock(surveyId: string, username: string): Promise<Record<string, any>> {
	const newLock: SurveyLockData = {
		locked_by: username,
		locked_since: new Date().toISOString(),
		via: "ui"
	};
	return await updateSurveyRow(surveyId, () => ({ lock: JSON.stringify(newLock) }));
}

/** Gibt das Lock frei, sofern es nicht inzwischen von jemand anderem gehalten wird. */
export async function releaseSurveyLock(surveyId: string, username?: string): Promise<Record<string, any> | null> {
	try {
		return await updateSurveyRow(surveyId, currentRow => {
			const currentLock = parseSurveyLock(currentRow.lock);
			const isHeldByOther =
				username &&
				currentLock.locked_by &&
				!isSurveyLockOwnedBy(currentLock, username) &&
				!isSurveyLockStale(currentLock);
			return isHeldByOther ? null : { lock: EMPTY_SURVEY_LOCK };
		});
	} catch (err) {
		console.warn("Could not release survey lock:", err);
		return null;
	}
}
