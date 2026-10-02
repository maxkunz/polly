import type { ExportSession } from "./csv";

export interface ExportSummary {
  sessions: number;
  statusCounts: Record<string, number>;
  versions: Record<string, number>;
}

export function createSummary(): ExportSummary {
  return { sessions: 0, statusCounts: {}, versions: {} };
}

/** Zählt eine Session in die Teil-Zusammenfassung ein. */
export function addToSummary(summary: ExportSummary, session: ExportSession): void {
  summary.sessions += 1;

  const status = session.status ?? "unknown";
  summary.statusCounts[status] = (summary.statusCounts[status] ?? 0) + 1;

  const version = String(session.surveyVersion ?? 1);
  summary.versions[version] = (summary.versions[version] ?? 0) + 1;
}
