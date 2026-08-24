import { ref, nextTick, type Ref } from "vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import type { Survey } from "@/domain/survey/surveyTypes";
import { ensureSurveyTechnicalNames } from "@/domain/survey/surveyTypes";
import { saveSurveyDetail, fetchSurveyDetail } from "@/services/surveyService";

export interface SurveySaveActionsOptions {
	draftSurvey: Ref<Survey | null>;
	isDirty: Ref<boolean>;
	isValid: Ref<boolean>;
	validationErrors: Ref<Array<{ message: string; fieldId?: string }>>;
	reset: () => void;
	markClean: (survey: Survey) => void;
	datatableId: string;
	surveyId: string;
	existingRow?: Ref<Record<string, any> | null>;
	onRowRefreshed?: (freshRow: Record<string, any>) => void;
	emit: {
		(e: "saved", updated: Survey, freshRow?: Record<string, any>): void;
		(e: "back"): void;
	};
}

export function useSurveySaveActions(options: SurveySaveActionsOptions) {
	const toast = useToast();
	const confirm = useConfirm();

	const isSaving = ref<boolean>(false);
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
				options.existingRow?.value ?? undefined
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
			acceptClass: "p-button-warning",
			accept: () => {
				options.reset();
				saveAttempted.value = false;
				toast.add({
					severity: "info",
					summary: "Zurückgesetzt",
					detail: "Änderungen wurden verworfen.",
					life: 2500
				});
			}
		});
	}

	function handleBack() {
		if (options.isDirty.value) {
			confirm.require({
				header: "Ungespeicherte Änderungen",
				message: "Sie haben ungespeicherte Änderungen. Möchten Sie die Seite wirklich verlassen?",
				icon: "pi pi-exclamation-triangle",
				acceptLabel: "Verlassen",
				rejectLabel: "Bleiben",
				acceptClass: "p-button-danger",
				accept: () => {
					options.emit("back");
				}
			});
		} else {
			options.emit("back");
		}
	}

	return {
		isSaving,
		saveAttempted,
		handleSave,
		handleDiscard,
		handleBack
	};
}
