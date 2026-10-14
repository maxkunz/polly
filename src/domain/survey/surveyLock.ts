import { SURVEY_LOCK_TTL_MINUTES } from "@/constants/surveyConstants";

/**
 * Regeln für das Umfrage-Lock im Feld `lock` der Zeile survey_<id> (nicht zu verwechseln mit
 * dem App-weiten Lock in __lock, siehe services/lockingService.ts). Lesen und Schreiben der
 * Zeile übernimmt surveyService.
 */

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
