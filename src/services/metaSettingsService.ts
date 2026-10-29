import { OneRowDataTable, updateDataTableRow } from "@/services/genesys/dataTable";
import { Meta } from "@/domain/Meta";

/**
 * Speichert die Standard-Basis-URL für Web-Umfragen in der Zeile `__meta` (Feld `Draft`, Schlüssel `web`).
 * Die Zeile wird vorher frisch gelesen, damit `setup`, `features` und unbekannte Schlüssel erhalten bleiben.
 * Gibt die neue `Meta` zurück.
 */
export async function saveWebDefaultBaseUrl(datatableId: string, baseUrl: string): Promise<Meta> {
	const row: Record<string, any> = await OneRowDataTable(datatableId, "__meta");
	let raw: unknown = {};
	try {
		raw = typeof row?.Draft === "string" ? JSON.parse(row.Draft) : (row?.Draft ?? {});
	} catch {
		throw new Error("__meta konnte nicht gelesen werden");
	}
	const meta = Meta.fromJSON(raw);
	meta.web = { defaultBaseUrl: baseUrl.trim() };

	await updateDataTableRow(datatableId, "__meta", { ...row, Draft: JSON.stringify(meta.toJSON()) });
	return meta;
}
