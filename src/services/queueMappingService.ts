import { updateDataTableRow, addDataTableRow, deleteDataTableRow, listAllDataTableRows } from "@/services/genesys/dataTable";
import type { QueueMappingData, QueueMappingEntry } from "@/domain/queueMapping/queueMappingTypes";
import { useAppStore } from "@/stores/appStore";

/**
 * Queue-Mapping in der eigenen Data Table <projectTag>_polly_mapping: eine Zeile pro Queue
 * (Key = Queue-Name) mit SurveyId und DeliveryRate, siehe documentation/datatablerow_queue_mapping.md.
 */

async function resolveMappingDataTableId(): Promise<string> {
	return await useAppStore().ensureMappingDataTableId();
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
