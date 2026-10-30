import { ref, watch, onMounted, onBeforeUnmount, type Ref } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useI18n } from "vue-i18n";
import { useAppStore } from "@/stores/appStore";
import { currentLocaleTag } from "@/i18n";
import { parseSurveyLock, checkSurveyLockConflict, type SurveyLockVia } from "@/domain/survey/surveyLock";
import { acquireSurveyLock, releaseSurveyLock } from "@/services/surveyService";

export interface UseSurveyLockOptions {
	surveyId: string;
	/** Rohzeile der Umfrage; wird nach Lock-Änderungen mit dem frischen Stand überschrieben */
	existingRow: Ref<Record<string, any> | null>;
	isDirty: Ref<boolean>;
	isNew?: boolean;
	// Read-only (fehlende Rolle polly_write): kein Lock nehmen, kein Konflikt-Dialog
	readOnly?: Ref<boolean>;
	/** Nutzer schließt den Konfliktdialog (X/Escape) → zurück zur Übersicht */
	onBack?: () => void;
}

export function useSurveyLock(options: UseSurveyLockOptions) {
	const confirm = useConfirm();
	const appStore = useAppStore();
	const { t } = useI18n();

	const isLockedByMe = ref<boolean>(false);
	const isConflictDismissed = ref<boolean>(false);
	/** Nutzer hat im Konfliktdialog „Nur lesen“ gewählt: Editor gesperrt, kein Lock nehmen */
	const isLockReadOnly = ref<boolean>(false);
	const conflictLockedBy = ref<string>("");
	/** Herkunft des fremden Locks im Konfliktfall (KI-Client über MCP oder App) */
	const conflictVia = ref<SurveyLockVia>("ui");

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
						roles: appStore.currentUser?.roles ?? [],
						id: String(me.id ?? ""),
						name: String(me.name ?? me.username ?? t("surveyLock.unknownUser")),
						email: me.email
					};
					return appStore.currentUser.name;
				}
			} catch (err) {
				console.warn("Could not fetch current user from Genesys API:", err);
			}
		}
		return t("surveyLock.unknownUser");
	}

	function formatLockDate(dateStr?: string): string {
		if (!dateStr) return "";
		try {
			const d = new Date(dateStr);
			if (Number.isNaN(d.getTime())) return dateStr;
			return new Intl.DateTimeFormat(currentLocaleTag(), {
				dateStyle: "medium",
				timeStyle: "short"
			}).format(d);
		} catch {
			return dateStr;
		}
	}

	async function checkInitialConflict(): Promise<void> {
		if (options.isNew || options.readOnly?.value || isLockReadOnly.value) return;

		try {
			const lock = parseSurveyLock(options.existingRow.value?.lock);

			const username = await getCurrentUsername();
			const conflict = checkSurveyLockConflict(lock, username);

			if (conflict.hasConflict && !isConflictDismissed.value) {
				const formattedDate = formatLockDate(lock.locked_since);
				confirm.require({
					header: t("surveyLock.conflict.header"),
					message: t(lock.via === "mcp" ? "surveyLock.conflict.messageMcp" : "surveyLock.conflict.message", {
						date: formattedDate,
						user: lock.locked_by
					}),
					icon: "pi pi-exclamation-triangle",
					acceptLabel: t("surveyLock.conflict.acceptLabel"),
					rejectLabel: t("surveyLock.conflict.rejectLabel"),
					acceptClass: "p-button-danger",
					rejectClass: "p-button-secondary",
					accept: () => {
						isConflictDismissed.value = true;
					},
					reject: () => {
						conflictLockedBy.value = lock.locked_by ?? "";
						conflictVia.value = lock.via ?? "ui";
						isLockReadOnly.value = true;
					},
					// Schließen per X/Escape (nicht bei accept/reject)
					onHide: () => {
						options.onBack?.();
					}
				});
			}
		} catch (err) {
			console.warn("Failed to check survey lock conflict:", err);
		}
	}

	async function acquireLock(): Promise<void> {
		if (options.isNew || options.readOnly?.value || isLockReadOnly.value || isLockedByMe.value) return;

		try {
			const username = await getCurrentUsername();
			options.existingRow.value = await acquireSurveyLock(options.surveyId, username);
			isLockedByMe.value = true;
		} catch (err) {
			console.error("Failed to acquire survey lock:", err);
		}
	}

	async function releaseLock(): Promise<void> {
		if (options.isNew || !isLockedByMe.value) return;

		try {
			const username = await getCurrentUsername();
			const updatedRow = await releaseSurveyLock(options.surveyId, username);
			if (updatedRow) {
				options.existingRow.value = updatedRow;
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

	/** Aus dem Lesemodus heraus doch bearbeiten (entspricht „Trotzdem bearbeiten“ im Dialog) */
	function editAnyway(): void {
		isLockReadOnly.value = false;
		isConflictDismissed.value = true;
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
			if (!isLockedByMe.value && !isConflictDismissed.value && !isLockReadOnly.value) {
				checkInitialConflict();
			}
		},
		{ immediate: false }
	);

	// Rollen werden ggf. erst nach dem Mount geladen – Konfliktprüfung dann nachholen
	watch(
		() => options.readOnly?.value,
		(readOnly, wasReadOnly) => {
			if (!readOnly && wasReadOnly && !isLockedByMe.value && !isConflictDismissed.value) {
				checkInitialConflict();
			}
		}
	);

	onMounted(() => {
		checkInitialConflict();
	});

	onBeforeUnmount(() => {
		releaseLock();
	});

	return {
		releaseLock,
		markLockReleased,
		isLockReadOnly,
		conflictLockedBy,
		conflictVia,
		editAnyway
	};
}
