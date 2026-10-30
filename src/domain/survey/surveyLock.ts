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
