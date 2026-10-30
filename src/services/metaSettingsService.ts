import { OneRowDataTable, updateDataTableRow } from "@/services/genesys/dataTable";
import { Meta } from "@/domain/Meta";

/** `__meta` fehlt oder das Feld `Draft` ist kein JSON-Objekt; Meldung übersetzen die Aufrufer. */
export class MetaUnreadableError extends Error {
	constructor() {
		super("__meta unreadable");
		this.name = "MetaUnreadableError";
	}
}

/** Liest die Zeile `__meta` frisch; `draft` ist das geparste Feld `Draft` (immer ein Objekt). */
async function readMetaRow(datatableId: string): Promise<{ row: Record<string, any>; draft: Record<string, any> }> {
	const row: Record<string, any> = await OneRowDataTable(datatableId, "__meta");
	let draft: unknown = {};
	try {
		draft = typeof row?.Draft === "string" ? JSON.parse(row.Draft) : (row?.Draft ?? {});
	} catch {
		throw new MetaUnreadableError();
	}
	if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new MetaUnreadableError();
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

/** Der in `meta.setup.mcpClient` gemerkte Genesys-Client der MCP-Anmeldung (frisch gelesen), sonst `null`. */
export async function loadSetupMcpClient(datatableId: string): Promise<{ id: string; name: string } | null> {
	const { draft } = await readMetaRow(datatableId);
	const client = draft.setup?.mcpClient;
	return client && typeof client.id === "string" && client.id ? { id: client.id, name: String(client.name ?? "") } : null;
}

/**
 * Merkt den Genesys-Client der MCP-Anmeldung in `meta.setup.mcpClient` (oder entfernt ihn mit `null`), damit
 * Deaktivieren und Uninstall ihn wieder löschen können. Die Zeile wird frisch gelesen, nur dieser Schlüssel ändert sich.
 */
export async function saveSetupMcpClient(datatableId: string, client: { id: string; name: string } | null): Promise<Meta> {
	const { row, draft } = await readMetaRow(datatableId);
	const setup: Record<string, unknown> =
		draft.setup && typeof draft.setup === "object" && !Array.isArray(draft.setup) ? { ...draft.setup } : {};
	if (client) setup.mcpClient = { id: client.id, name: client.name };
	else delete setup.mcpClient;

	const next = { ...draft, setup };
	await updateDataTableRow(datatableId, "__meta", { ...row, Draft: JSON.stringify(next) });
	return Meta.fromJSON(next);
}
