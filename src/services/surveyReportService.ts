import { apiFetch } from "@/services/pollyApi";

export interface ReportRange {
	surveyId: string;
	/** ISO-8601 (UTC) */
	from: string;
	/** ISO-8601 (UTC) */
	to: string;
}

export interface ReportSummary {
	sessions: number;
	answers: number;
	statusCounts: Record<string, number>;
	/** Survey-Version → Anzahl Sitzungen */
	versions: Record<string, number>;
}

export interface ReportCallOptions {
	signal?: AbortSignal;
}

function buildQuery(range: ReportRange, extra: Record<string, string | undefined> = {}): string {
	const params = new URLSearchParams({ surveyId: range.surveyId, from: range.from, to: range.to });
	for (const [key, value] of Object.entries(extra)) {
		if (value !== undefined && value !== "") params.set(key, value);
	}
	return params.toString();
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
	for (const [key, count] of Object.entries(source ?? {})) {
		target[key] = (target[key] ?? 0) + count;
	}
}

/**
 * Lädt die Vorschau in Teilen (Cursor) und führt die Teil-Aggregate zusammen.
 * onProgress liefert den Zwischenstand.
 */
export async function loadReportSummary(
	range: ReportRange,
	options: ReportCallOptions & { onProgress?: (partial: ReportSummary) => void } = {}
): Promise<ReportSummary> {
	const summary: ReportSummary = { sessions: 0, answers: 0, statusCounts: {}, versions: {} };
	let cursor: string | undefined;

	do {
		const response = await apiFetch(`/survey-responses/export/summary?${buildQuery(range, { cursor })}`, {
			signal: options.signal
		});
		const part = await response.json();
		summary.sessions += part.sessions ?? 0;
		summary.answers += part.answers ?? 0;
		mergeCounts(summary.statusCounts, part.statusCounts);
		mergeCounts(summary.versions, part.versions);
		cursor = part.nextCursor ?? undefined;
		options.onProgress?.({ ...summary });
	} while (cursor);

	return summary;
}

export interface ExportProgress {
	sessions: number;
	rows: number;
}

/**
 * Lädt die CSV in Teilstücken und setzt sie zu einem Blob zusammen (UTF-8 mit BOM für Excel).
 * Die Kopfzeile liefert der Server nur im ersten Teilstück.
 */
export async function exportReportCsv(
	range: ReportRange,
	options: ReportCallOptions & { version?: number | null; onProgress?: (progress: ExportProgress) => void } = {}
): Promise<Blob> {
	const parts: BlobPart[] = ["﻿"];
	const progress: ExportProgress = { sessions: 0, rows: 0 };
	let cursor: string | undefined;

	do {
		const response = await apiFetch(
			`/survey-responses/export?${buildQuery(range, {
				version: options.version != null ? String(options.version) : undefined,
				cursor
			})}`,
			{ signal: options.signal }
		);
		// Header statt Body, damit der CSV-Text unverändert zusammengesetzt werden kann.
		parts.push(await response.text());
		progress.sessions += Number(response.headers.get("x-sessions") ?? 0);
		progress.rows += Number(response.headers.get("x-rows") ?? 0);
		cursor = response.headers.get("x-next-cursor") ?? undefined;
		options.onProgress?.({ ...progress });
	} while (cursor);

	return new Blob(parts, { type: "text/csv;charset=utf-8" });
}
