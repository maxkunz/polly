import { ref, watch, onMounted, onBeforeUnmount, type Ref } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useAppStore } from "@/stores/appStore";
import {
	parseSurveyLock,
	checkSurveyLockConflict,
	acquireSurveyLock,
	releaseSurveyLock,
	type SurveyLockData
} from "@/services/surveyService";

export interface UseSurveyLockOptions {
	datatableId?: string;
	surveyId: string;
	existingRow: Ref<Record<string, any> | null>;
	isDirty: Ref<boolean>;
	isNew?: boolean;
	onRowRefreshed?: (freshRow: Record<string, any>) => void;
	onBack?: () => void;
}

export function useSurveyLock(options: UseSurveyLockOptions) {
	const confirm = useConfirm();
	const appStore = useAppStore();

	const isLockedByMe = ref<boolean>(false);
	const isConflictDismissed = ref<boolean>(false);
	const isCheckingConflict = ref<boolean>(false);
	const currentLockData = ref<SurveyLockData | null>(null);

	async function getCurrentUsername(): Promise<string> {
		if (appStore.currentUser?.name) {
			return appStore.currentUser.name;
		}
		appStore.initGenesysClients();
		if (appStore.genesys?.usersApi) {
			try {
				const me = await appStore.genesys.usersApi.getUsersMe();
				if (me) {
					appStore.currentUser = {
						id: String(me.id ?? ""),
						name: String(me.name ?? me.username ?? "Unknown User"),
						email: me.email
					};
					return appStore.currentUser.name;
				}
			} catch (err) {
				console.warn("Could not fetch current user from Genesys API:", err);
			}
		}
		return "Unknown User";
	}

	function formatLockDate(dateStr?: string): string {
		if (!dateStr) return "";
		try {
			const d = new Date(dateStr);
			if (Number.isNaN(d.getTime())) return dateStr;
			return new Intl.DateTimeFormat("de-DE", {
				dateStyle: "medium",
				timeStyle: "short"
			}).format(d);
		} catch {
			return dateStr;
		}
	}

	async function checkInitialConflict(): Promise<void> {
		if (options.isNew) return;

		isCheckingConflict.value = true;
		try {
			const rawLock = options.existingRow.value?.lock;
			const lock = parseSurveyLock(rawLock);
			currentLockData.value = lock;

			const username = await getCurrentUsername();
			const conflict = checkSurveyLockConflict(lock, username);

			if (conflict.hasConflict && !isConflictDismissed.value) {
				const formattedDate = formatLockDate(lock.locked_since);
				confirm.require({
					header: "Umfrage wird bereits bearbeitet",
					message: `Diese Umfrage wird seit ${formattedDate} von „${lock.locked_by}“ bearbeitet. Möchten Sie die Sperre ignorieren oder abbrechen?`,
					icon: "pi pi-exclamation-triangle",
					acceptLabel: "Trotzdem bearbeiten",
					rejectLabel: "Abbrechen",
					acceptClass: "p-button-warning",
					rejectClass: "p-button-secondary",
					accept: () => {
						isConflictDismissed.value = true;
					},
					reject: () => {
						if (options.onBack) {
							options.onBack();
						}
					}
				});
			}
		} catch (err) {
			console.warn("Failed to check survey lock conflict:", err);
		} finally {
			isCheckingConflict.value = false;
		}
	}

	async function acquireLock(force = false): Promise<boolean> {
		if (options.isNew) return true;
		if (isLockedByMe.value && !force) return true;

		try {
			const username = await getCurrentUsername();
			const updatedRow = await acquireSurveyLock(
				options.datatableId,
				options.surveyId,
				username,
				options.existingRow.value ?? undefined
			);

			if (updatedRow) {
				options.existingRow.value = updatedRow;
				currentLockData.value = parseSurveyLock(updatedRow.lock);
				if (options.onRowRefreshed) {
					options.onRowRefreshed(updatedRow);
				}
			}

			isLockedByMe.value = true;
			return true;
		} catch (err) {
			console.error("Failed to acquire survey lock:", err);
			return false;
		}
	}

	async function releaseLock(): Promise<void> {
		if (options.isNew || !isLockedByMe.value) return;

		try {
			const username = await getCurrentUsername();
			const updatedRow = await releaseSurveyLock(
				options.datatableId,
				options.surveyId,
				username,
				options.existingRow.value ?? undefined
			);

			if (updatedRow) {
				options.existingRow.value = updatedRow;
				currentLockData.value = parseSurveyLock(updatedRow.lock);
				if (options.onRowRefreshed) {
					options.onRowRefreshed(updatedRow);
				}
			}
		} catch (err) {
			console.warn("Failed to release survey lock:", err);
		} finally {
			isLockedByMe.value = false;
		}
	}

	function markLockReleased(): void {
		isLockedByMe.value = false;
	}

	// Watch for dirty changes -> lock on first change
	watch(
		() => options.isDirty.value,
		async isDirty => {
			if (isDirty && !isLockedByMe.value && !options.isNew) {
				await acquireLock();
			}
		}
	);

	// Check conflict when existingRow arrives or changes
	watch(
		() => options.existingRow.value,
		() => {
			if (!isLockedByMe.value && !isConflictDismissed.value) {
				checkInitialConflict();
			}
		},
		{ immediate: false }
	);

	onMounted(() => {
		checkInitialConflict();
	});

	onBeforeUnmount(() => {
		releaseLock();
	});

	return {
		isLockedByMe,
		isConflictDismissed,
		isCheckingConflict,
		currentLockData,
		acquireLock,
		releaseLock,
		markLockReleased,
		checkInitialConflict
	};
}
