import * as genesys from "@/services/genesys_helper";
import { useAppStore, type CurrentUser } from "@/stores/appStore";

export type LockStatus = "editing" | "viewing";

const DEFAULT_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_SECONDS = 5 * 60;
const APP_LOCK_KEY = "app";
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
	"pointerdown",
	"keydown",
	"wheel",
	"scroll",
	"touchstart"
];

let activeTrackerStop: (() => void) | null = null;

export type LockObject = {
	status: LockStatus;
	userId: string;
	userName: string;
	sessionId: string;
	acquiredAt: string;
	expiresAt: string;
};

export type LockRow = {
	key: string;
	columns: Record<string, LockObject | null>;
};

export type LockConflict = {
	key: string;
	lock: LockObject;
};

export async function acquireLocks(params: {
	datatableId: string;
	user: CurrentUser;
	sessionId: string;
	ttlSeconds?: number;
	force?: boolean;
	status?: LockStatus;
	lockRowKey?: string;
}): Promise<{ ok: true } | { ok: false; conflicts: LockConflict[] }> {
	const {
		datatableId,
		user,
		sessionId,
		ttlSeconds = DEFAULT_TTL_SECONDS,
		force = false,
		status = "editing",
		lockRowKey = "__lock"
	} = params;

	const lockRow = await genesys.getLockRow(datatableId, lockRowKey);
	const existing = lockRow.columns[APP_LOCK_KEY] ?? null;

	if (existing) {
		const exp = Date.parse(existing.expiresAt);
		const isActive = !Number.isNaN(exp) && exp > Date.now();
		const ownedByMe = existing.userId === user.id && existing.sessionId === sessionId;
		if (isActive && !ownedByMe && !force) {
			return { ok: false, conflicts: [{ key: APP_LOCK_KEY, lock: existing }] };
		}
	}

	lockRow.columns[APP_LOCK_KEY] = {
		status,
		userId: user.id,
		userName: user.name,
		sessionId,
		acquiredAt: new Date().toISOString(),
		expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
	};

	await genesys.putLockRow(datatableId, lockRow);
	useAppStore().editMode = true;
	return { ok: true };
}

export async function extendLocks(params: {
	datatableId: string;
	user: CurrentUser;
	sessionId: string;
	ttlSeconds?: number;
	lockRowKey?: string;
}): Promise<{ ok: true } | { ok: false; conflicts: LockConflict[] }> {
	const {
		datatableId,
		user,
		sessionId,
		ttlSeconds = DEFAULT_TTL_SECONDS,
		lockRowKey = "__lock"
	} = params;

	const lockRow = await genesys.getLockRow(datatableId, lockRowKey);
	const existing = lockRow.columns[APP_LOCK_KEY] ?? null;

	if (!existing) return { ok: true };

	const ownedByMe = existing.userId === user.id && existing.sessionId === sessionId;
	if (!ownedByMe) {
		return { ok: false, conflicts: [{ key: APP_LOCK_KEY, lock: existing }] };
	}

	lockRow.columns[APP_LOCK_KEY] = {
		...existing,
		expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
	};

	await genesys.putLockRow(datatableId, lockRow);
	return { ok: true };
}

export async function releaseLocks(params: {
	datatableId: string;
	sessionId: string;
	force?: boolean;
	lockRowKey?: string;
}): Promise<void> {
	const {
		datatableId,
		sessionId,
		force = false,
		lockRowKey = "__lock"
	} = params;

	const lockRow = await genesys.getLockRow(datatableId, lockRowKey);
	const existing = lockRow.columns[APP_LOCK_KEY] ?? null;

	if (existing && (force || existing.sessionId === sessionId)) {
		lockRow.columns[APP_LOCK_KEY] = null;
	}

	await genesys.putLockRow(datatableId, lockRow);
	useAppStore().editMode = false;
}

export async function readLocks(params: {
	datatableId: string;
	lockRowKey?: string;
}): Promise<Record<string, LockObject | null>> {
	const { datatableId, lockRowKey = "__lock" } = params;
	const lockRow = await genesys.getLockRow(datatableId, lockRowKey);

	return {
		[APP_LOCK_KEY]: lockRow.columns[APP_LOCK_KEY] ?? null
	};
}

export async function hasValidLocks(params: {
	datatableId: string;
	sessionId: string;
	userId: string;
	lockRowKey?: string;
}): Promise<
	| { ok: true }
	| { ok: false; lock?: LockObject; reason?: "missing" | "expired" | "not_owner" }
> {
	const { datatableId, sessionId, userId, lockRowKey = "__lock" } = params;
	const locks = await readLocks({ datatableId, lockRowKey });
	const lock = locks[APP_LOCK_KEY];

	if (!lock) return { ok: false, reason: "missing" };

	const exp = Date.parse(lock.expiresAt);
	if (Number.isNaN(exp) || exp <= Date.now()) return { ok: false, lock, reason: "expired" };

	const ownedByMe = lock.userId === userId && lock.sessionId === sessionId;
	if (!ownedByMe) return { ok: false, lock, reason: "not_owner" };

	return { ok: true };
}

export function startLockActivityTracking(params: {
	datatableId: string;
	user: CurrentUser;
	sessionId: string;
	ttlSeconds?: number;
	refreshIntervalSeconds?: number;
	lockRowKey?: string;
}): void {
	const {
		datatableId,
		user,
		sessionId,
		ttlSeconds = DEFAULT_TTL_SECONDS,
		refreshIntervalSeconds = DEFAULT_REFRESH_SECONDS,
		lockRowKey = "__lock"
	} = params;

	if (typeof window === "undefined") return;

	if (activeTrackerStop) {
		activeTrackerStop();
		activeTrackerStop = null;
	}

	let lastActivityAt = Date.now();
	const refreshIntervalMs = refreshIntervalSeconds * 1000;

	const markActivity = () => {
		const now = Date.now();
		if (now - lastActivityAt > 1000) lastActivityAt = now;
	};

	const listenerOptions = { passive: true, capture: true } as const;
	for (const event of ACTIVITY_EVENTS) {
		window.addEventListener(event, markActivity, listenerOptions);
	}

	const intervalId = window.setInterval(async () => {
		if (document?.hidden) return;
		if (Date.now() - lastActivityAt > refreshIntervalMs) return;
		try {
			await extendLocks({
				datatableId,
				user,
				sessionId,
				ttlSeconds,
				lockRowKey
			});
		} catch (err) {
			console.error("extendLocks error:", err);
		}
	}, refreshIntervalMs);

	activeTrackerStop = () => {
		for (const event of ACTIVITY_EVENTS) {
			window.removeEventListener(event, markActivity, true);
		}
		window.clearInterval(intervalId);
	};
}

export function stopLockActivityTracking(): void {
	if (activeTrackerStop) {
		activeTrackerStop();
		activeTrackerStop = null;
	}
}
