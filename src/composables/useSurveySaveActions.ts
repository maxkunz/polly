import { ref, nextTick, type Ref } from "vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import type { Survey } from "@/domain/survey/surveyTypes";
import { ensureSurveyTechnicalNames } from "@/domain/survey/surveyTypes";
import { saveSurveyDetail, fetchSurveyDetail, deleteSurvey } from "@/services/surveyService";

export interface SurveySaveActionsOptions {
	draftSurvey: Ref<Survey | null>;
	isDirty: Ref<boolean>;
	isValid: Ref<boolean>;
	validationErrors: Ref<Array<{ message: string; fieldId?: string }>>;
	reset: () => void;
	markClean: (survey: Survey) => void;
	datatableId?: string;
	surveyId: string;
	existingRow?: Ref<Record<string, any> | null>;
	isNew?: boolean;
	onRowRefreshed?: (freshRow: Record<string, any>) => void;
	onSaved?: (updated: Survey, freshRow?: Record<string, any>) => void;
	onDiscarded?: () => void;
	onDeleted?: () => void;
	emit: {
		(e: "saved", updated: Survey, freshRow?: Record<string, any>): void;
		(e: "back"): void;
		(e: "deleted"): void;
	};
}

export function useSurveySaveActions(options: SurveySaveActionsOptions) {
	const toast = useToast();
	const confirm = useConfirm();

	const isSaving = ref<boolean>(false);
	const isDeleting = ref<boolean>(false);
	const saveAttempted = ref<boolean>(false);

	async function handleSave() {
		saveAttempted.value = true;
		if (!options.isValid.value || !options.draftSurvey.value) {
			toast.add({
				severity: "error",
				summary: "Validierungsfehler",
				detail: "Bitte beheben Sie die markierten Fehler vor dem Speichern.",
				life: 5000
			});

			const firstError = options.validationErrors.value.find(e => e.fieldId);
			if (firstError?.fieldId) {
				await nextTick();
				const el = document.getElementById(firstError.fieldId);
				if (el) {
					el.scrollIntoView({ behavior: "smooth", block: "center" });
					el.focus();
				}
			}
			return;
		}

		ensureSurveyTechnicalNames(options.draftSurvey.value);

		isSaving.value = true;
		try {
			const updated = await saveSurveyDetail(
				options.datatableId,
				options.surveyId,
				options.draftSurvey.value,
				options.existingRow?.value ?? undefined,
				options.isNew
			);
			options.markClean(updated);
			saveAttempted.value = false;

			let freshRow: Record<string, any> | undefined;
			try {
				const res = await fetchSurveyDetail(options.datatableId, options.surveyId);
				freshRow = res.rawRow;
				if (options.existingRow) {
					options.existingRow.value = freshRow;
				}
				if (options.onRowRefreshed) {
					options.onRowRefreshed(freshRow);
				}
			} catch (fetchErr) {
				console.warn("Could not refresh raw row after save:", fetchErr);
			}

			toast.add({
				severity: "success",
				summary: "Erfolgreich gespeichert",
				detail: `Umfrage „${updated.title}“ wurde in der Data Table aktualisiert.`,
				life: 3500
			});

			if (options.onSaved) {
				options.onSaved(updated, freshRow);
			}

			options.emit("saved", updated, freshRow);
		} catch (err: any) {
			console.error("Save survey error:", err);
			toast.add({
				severity: "error",
				summary: "Speicherfehler",
				detail: err?.message || "Fehler beim Speichern der Umfrage in der Data Table.",
				life: 5000
			});
		} finally {
			isSaving.value = false;
		}
	}

	function handleDiscard() {
		if (!options.isDirty.value) return;

		confirm.require({
			header: "Änderungen verwerfen",
			message: "Möchten Sie alle nicht gespeicherten Änderungen wirklich verwerfen?",
			icon: "pi pi-exclamation-triangle",
			acceptLabel: "Ja, verwerfen",
			rejectLabel: "Abbrechen",
			acceptClass: "p-button-danger",
			accept: () => {
				options.reset();
				saveAttempted.value = false;
				if (options.onDiscarded) {
					options.onDiscarded();
				}
				toast.add({
					severity: "info",
					summary: "Zurückgesetzt",
					detail: "Änderungen wurden verworfen.",
					life: 2500
				});
			}
		});
	}

	function handleDelete() {
		const title = options.draftSurvey.value?.title || options.surveyId;
		confirm.require({
			header: "Umfrage löschen",
			message: `Möchten Sie die Umfrage „${title}“ wirklich unwiderruflich löschen?`,
			icon: "pi pi-exclamation-triangle",
			acceptLabel: "Ja, löschen",
			rejectLabel: "Abbrechen",
			acceptClass: "p-button-danger",
			accept: async () => {
				isDeleting.value = true;
				try {
					await deleteSurvey(options.datatableId, options.surveyId);
					toast.add({
						severity: "success",
						summary: "Umfrage gelöscht",
						detail: `Die Umfrage „${title}“ wurde erfolgreich gelöscht.`,
						life: 3500
					});
					if (options.onDeleted) {
						options.onDeleted();
					}
					options.emit("deleted");
				} catch (err: any) {
					console.error("Delete survey error:", err);
					toast.add({
						severity: "error",
						summary: "Fehler beim Löschen",
						detail: err?.message || "Fehler beim Löschen der Umfrage aus der Data Table.",
						life: 5000
					});
				} finally {
					isDeleting.value = false;
				}
			}
		});
	}

	function handleBack() {
		options.emit("back");
	}

	return {
		isSaving,
		isDeleting,
		saveAttempted,
		handleSave,
		handleDiscard,
		handleDelete,
		handleBack
	};
}
