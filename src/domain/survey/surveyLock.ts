import { SURVEY_LOCK_TTL_MINUTES } from "../../constants/surveyConstants";

/**
 * Regeln für das Umfrage-Lock im Feld `lock` der Zeile survey_<id> (nicht zu verwechseln mit
 * dem App-weiten Lock in __lock, siehe services/lockingService.ts). Lesen und Schreiben der
 * Zeile übernimmt surveyService. Aliasfrei, damit auch die Lambdas (MCP) es nutzen können.
 */

/** Herkunft eines Locks: App-Editor oder KI-Client über MCP. Fehlt bei älteren Locks. */
export type SurveyLockVia = "ui" | "mcp";

export interface SurveyLockData {
	locked_by: string;
	locked_since: string;
	via?: SurveyLockVia;
}

function toSurveyLock(raw: any): SurveyLockData {
	const lock: SurveyLockData = {
		locked_by: String(raw?.locked_by ?? "").trim(),
		locked_since: String(raw?.locked_since ?? "").trim()
	};
	// Unbekannte Werte werden verworfen, nicht übernommen
	if (raw?.via === "ui" || raw?.via === "mcp") lock.via = raw.via;
	return lock;
}

export function parseSurveyLock(lockRaw: unknown): SurveyLockData {
	const defaultLock: SurveyLockData = { locked_by: "", locked_since: "" };
	if (!lockRaw) return defaultLock;
	if (typeof lockRaw === "object") {
		return toSurveyLock(lockRaw);
	}
	if (typeof lockRaw === "string") {
		try {
			return toSurveyLock(JSON.parse(lockRaw));
		} catch {
			return defaultLock;
		}
	}
	return defaultLock;
}

/** Lock gehört der Person: Name getrimmt und ohne Groß-/Kleinschreibung verglichen. */
export function isSurveyLockOwnedBy(lock: SurveyLockData, username: string): boolean {
	const cleanCurrent = username.trim().toLowerCase();
	return Boolean(cleanCurrent && lock.locked_by.trim().toLowerCase() === cleanCurrent);
}

/** Ablaufzeitpunkt (ms) oder null, wenn `locked_since` fehlt bzw. unlesbar ist. */
export function surveyLockExpiresAtMs(
	lock: SurveyLockData,
	ttlMinutes: number = SURVEY_LOCK_TTL_MINUTES
): number | null {
	if (!lock.locked_since) return null;
	const lockedAt = new Date(lock.locked_since).getTime();
	return Number.isNaN(lockedAt) ? null : lockedAt + ttlMinutes * 60 * 1000;
}

/** `now` in ms; Standard ist die aktuelle Zeit (der Server übergibt seine eigene Uhr, siehe survey_store.ts). */
export function isSurveyLockStale(
	lock: SurveyLockData,
	ttlMinutes: number = SURVEY_LOCK_TTL_MINUTES,
	now: number = Date.now()
): boolean {
	if (!lock.locked_by) {
		return true;
	}
	const expiresAt = surveyLockExpiresAtMs(lock, ttlMinutes);
	return expiresAt === null || now >= expiresAt;
}

export function checkSurveyLockConflict(
	lock: SurveyLockData,
	currentUsername: string,
	ttlMinutes: number = SURVEY_LOCK_TTL_MINUTES,
	now: number = Date.now()
): { hasConflict: boolean; lock: SurveyLockData } {
	if (isSurveyLockStale(lock, ttlMinutes, now)) {
		return { hasConflict: false, lock };
	}
	return {
		hasConflict: !isSurveyLockOwnedBy(lock, currentUsername),
		lock
	};
}
