import { ref, nextTick, type Ref } from "vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useI18n } from "vue-i18n";
import type { Survey } from "@/domain/survey/surveyTypes";
import { ensureSurveyTechnicalNames } from "@/domain/survey/surveyTypes";
import { saveSurveyDetail, fetchSurveyDetail, deleteSurvey, resolveDataTableId } from "@/services/surveyService";
import { requestSurveyResultsDeletion } from "@/services/surveyResultsDeletionService";
import { useAppStore } from "@/stores/appStore";

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
	const { t } = useI18n();
	const app = useAppStore();

	const isSaving = ref<boolean>(false);
	const isDeleting = ref<boolean>(false);
	const saveAttempted = ref<boolean>(false);

	async function handleSave() {
		// Zweite Absicherung neben den deaktivierten Buttons
		await app.refreshRoles();
		if (!app.canWrite) return;
		saveAttempted.value = true;
		if (!options.isValid.value || !options.draftSurvey.value) {
			const errors = options.validationErrors.value;
			toast.add({
				severity: "error",
				summary: t("surveyEditor.save.validationErrorSummary"),
				detail: errors.length === 1
					? errors[0].message
					: t("surveyEditor.save.validationErrorFallback"),
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
				summary: t("surveyEditor.save.successSummary"),
				detail: t("surveyEditor.save.successDetail", { title: updated.title }),
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
				summary: t("surveyEditor.save.errorSummary"),
				detail: err?.message || t("surveyEditor.save.errorFallback"),
				life: 5000
			});
		} finally {
			isSaving.value = false;
		}
	}

	function handleDiscard() {
		if (!options.isDirty.value) return;

		confirm.require({
			header: t("surveyEditor.discardConfirm.header"),
			message: t("surveyEditor.discardConfirm.message"),
			icon: "pi pi-exclamation-triangle",
			acceptLabel: t("surveyEditor.discardConfirm.acceptLabel"),
			rejectLabel: t("surveyEditor.discardConfirm.rejectLabel"),
			acceptClass: "p-button-danger",
			// Fokus auf "Abbrechen", damit Enter nicht versehentlich bestätigt (Barrierefreiheit)
			defaultFocus: "reject",
			accept: () => {
				options.reset();
				saveAttempted.value = false;
				if (options.onDiscarded) {
					options.onDiscarded();
				}
				toast.add({
					severity: "info",
					summary: t("surveyEditor.discardConfirm.toastSummary"),
					detail: t("surveyEditor.discardConfirm.toastDetail"),
					life: 2500
				});
			}
		});
	}

	async function handleDelete() {
		await app.refreshRoles();
		if (!app.canWrite) return;
		const title = options.draftSurvey.value?.title || options.surveyId;
		confirm.require({
			header: t("surveyEditor.deleteConfirm.header"),
			message: t("surveyEditor.deleteConfirm.message", { title }),
			icon: "pi pi-exclamation-triangle",
			acceptLabel: t("surveyEditor.deleteConfirm.acceptLabel"),
			rejectLabel: t("surveyEditor.deleteConfirm.rejectLabel"),
			acceptClass: "p-button-danger",
			// Fokus auf "Abbrechen", damit Enter nicht versehentlich bestätigt (Barrierefreiheit)
			defaultFocus: "reject",
			accept: async () => {
				isDeleting.value = true;
				try {
					await deleteSurvey(options.datatableId, options.surveyId);
					toast.add({
						severity: "success",
						summary: t("surveyEditor.deleteConfirm.successSummary"),
						detail: t("surveyEditor.deleteConfirm.successDetail", { title }),
						life: 3500
					});
					// Erst nach dem Entfernen aus der Data Table: das Backend löscht nur Ergebnisse nicht mehr existierender Umfragen
					try {
						const tableId = await resolveDataTableId(options.datatableId);
						await requestSurveyResultsDeletion(options.surveyId, tableId);
						toast.add({
							severity: "info",
							summary: t("surveyEditor.deleteConfirm.resultsSummary"),
							detail: t("surveyEditor.deleteConfirm.resultsDetail"),
							life: 5000
						});
					} catch (resultsErr: any) {
						console.error("Delete survey results error:", resultsErr);
						toast.add({
							severity: "warn",
							summary: t("surveyEditor.deleteConfirm.resultsErrorSummary"),
							detail: resultsErr?.message || t("surveyEditor.deleteConfirm.resultsErrorFallback"),
							life: 8000
						});
					}
					if (options.onDeleted) {
						options.onDeleted();
					}
					options.emit("deleted");
				} catch (err: any) {
					console.error("Delete survey error:", err);
					toast.add({
						severity: "error",
						summary: t("surveyEditor.deleteConfirm.errorSummary"),
						detail: err?.message || t("surveyEditor.deleteConfirm.errorFallback"),
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
