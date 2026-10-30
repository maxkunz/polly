import { OneRowDataTable, updateDataTableRow } from "@/services/genesys/dataTable";
import { Meta } from "@/domain/Meta";

/** Liest die Zeile `__meta` frisch; `draft` ist das geparste Feld `Draft` (immer ein Objekt). */
async function readMetaRow(datatableId: string): Promise<{ row: Record<string, any>; draft: Record<string, any> }> {
	const row: Record<string, any> = await OneRowDataTable(datatableId, "__meta");
	let draft: unknown = {};
	try {
		draft = typeof row?.Draft === "string" ? JSON.parse(row.Draft) : (row?.Draft ?? {});
	} catch {
		throw new Error("__meta konnte nicht gelesen werden");
	}
	if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error("__meta konnte nicht gelesen werden");
	return { row, draft: draft as Record<string, any> };
}

/** Aktuelle Web-Einstellungen aus `__meta` (frisch gelesen, z. B. vor dem Erzeugen von Einladungslinks). */
export async function loadWebSettings(datatableId: string): Promise<Meta["web"]> {
	const { draft } = await readMetaRow(datatableId);
	return Meta.fromJSON(draft).web;
}

/**
 * Speichert die Standard-Basis-URL für Web-Umfragen in der Zeile `__meta` (Feld `Draft`, Schlüssel `web`).
 * Die Zeile wird vorher frisch gelesen und nur `web.defaultBaseUrl` geändert, alle anderen Schlüssel
 * (auch unbekannte unter `web`) bleiben unverändert. Gibt die neue `Meta` zurück.
 */
export async function saveWebDefaultBaseUrl(datatableId: string, baseUrl: string): Promise<Meta> {
	const { row, draft } = await readMetaRow(datatableId);
	const value = baseUrl.trim();
	const web: Record<string, unknown> =
		draft.web && typeof draft.web === "object" && !Array.isArray(draft.web) ? { ...draft.web } : {};
	if (value) web.defaultBaseUrl = value;
	else delete web.defaultBaseUrl;
	// Leeres `web` nicht schreiben, damit bestehende Installationen unverändert bleiben
	const next: Record<string, unknown> = { ...draft };
	if (Object.keys(web).length) next.web = web;
	else delete next.web;

	await updateDataTableRow(datatableId, "__meta", { ...row, Draft: JSON.stringify(next) });
	return Meta.fromJSON(next);
}
