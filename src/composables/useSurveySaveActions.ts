import { ref, nextTick, type Ref } from "vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useI18n } from "vue-i18n";
import type { Survey } from "@/domain/survey/surveyTypes";
import { saveSurveyDetail, fetchSurveyDetail, deleteSurvey, surveyTableId } from "@/services/surveyService";
import { requestSurveyResultsDeletion } from "@/services/surveyResultsDeletionService";
import { useAppStore } from "@/stores/appStore";
import { focusField, focusTopmostField } from "@/composables/useFieldErrors";
import { surveyFieldIds } from "@/domain/survey/surveyFieldIds";

export interface SurveySaveActionsOptions {
	draftSurvey: Ref<Survey | null>;
	isDirty: Ref<boolean>;
	isValid: Ref<boolean>;
	validationErrors: Ref<Array<{ message: string; fieldId?: string }>>;
	reset: () => void;
	markClean: (survey: Survey) => void;
	surveyId: string;
	/** Rohzeile der Umfrage; wird nach dem Speichern mit dem frischen Stand überschrieben */
	existingRow: Ref<Record<string, any> | null>;
	isNew?: boolean;
}

/**
 * Speichern, Verwerfen und Löschen im Editor inkl. Rückfragen und Toasts.
 * Die Funktionen melden per Rückgabewert, ob die Aktion ausgeführt wurde; was danach
 * passiert (Lock, Navigation), entscheidet der Editor.
 */
export function useSurveySaveActions(options: SurveySaveActionsOptions) {
	const toast = useToast();
	const confirm = useConfirm();
	const { t } = useI18n();
	const app = useAppStore();

	const isSaving = ref<boolean>(false);
	const isDeleting = ref<boolean>(false);
	const saveAttempted = ref<boolean>(false);

	/** Bestätigungsdialog als Promise; Schließen ohne Auswahl gilt als Ablehnen. */
	function askConfirm(keyPrefix: string, params: Record<string, unknown> = {}): Promise<boolean> {
		return new Promise(resolve => {
			let resolved = false;
			const finish = (result: boolean) => {
				if (!resolved) {
					resolved = true;
					resolve(result);
				}
			};
			confirm.require({
				header: t(`${keyPrefix}.header`),
				message: t(`${keyPrefix}.message`, params),
				icon: "pi pi-exclamation-triangle",
				acceptLabel: t(`${keyPrefix}.acceptLabel`),
				rejectLabel: t(`${keyPrefix}.rejectLabel`),
				acceptClass: "p-button-danger",
				// Fokus auf "Abbrechen", damit Enter nicht versehentlich bestätigt (Barrierefreiheit)
				defaultFocus: "reject",
				accept: () => finish(true),
				reject: () => finish(false),
				onHide: () => finish(false)
			});
		});
	}

	/** Speichert den Entwurf. Liefert die gespeicherte Umfrage oder null (ungültig, keine Rechte, Fehler). */
	async function save(): Promise<Survey | null> {
		// Zweite Absicherung neben den deaktivierten Buttons
		await app.refreshRoles();
		if (!app.canWrite) return null;
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

			// Zum obersten fehlerhaften Feld springen; ohne passendes Feld zur Fehlerübersicht
			await nextTick();
			const fieldIds = errors.flatMap(e => (e.fieldId ? [e.fieldId] : []));
			if (!focusTopmostField(fieldIds)) {
				focusField(surveyFieldIds.validationSummary);
			}
			return null;
		}

		isSaving.value = true;
		try {
			const updated = await saveSurveyDetail(options.draftSurvey.value, options.isNew);
			options.markClean(updated);
			saveAttempted.value = false;

			try {
				options.existingRow.value = (await fetchSurveyDetail(options.surveyId)).rawRow;
			} catch (fetchErr) {
				console.warn("Could not refresh raw row after save:", fetchErr);
			}

			toast.add({
				severity: "success",
				summary: t("surveyEditor.save.successSummary"),
				detail: t("surveyEditor.save.successDetail", { title: updated.title }),
				life: 3500
			});
			return updated;
		} catch (err: any) {
			console.error("Save survey error:", err);
			toast.add({
				severity: "error",
				summary: t("surveyEditor.save.errorSummary"),
				detail: err?.message || t("surveyEditor.save.errorFallback"),
				life: 5000
			});
			return null;
		} finally {
			isSaving.value = false;
		}
	}

	/** Verwirft ungespeicherte Änderungen nach Rückfrage. true, wenn verworfen wurde. */
	async function discard(): Promise<boolean> {
		if (!options.isDirty.value) return false;
		if (!(await askConfirm("surveyEditor.discardConfirm"))) return false;

		options.reset();
		saveAttempted.value = false;
		toast.add({
			severity: "info",
			summary: t("surveyEditor.discardConfirm.toastSummary"),
			detail: t("surveyEditor.discardConfirm.toastDetail"),
			life: 2500
		});
		return true;
	}

	/** Löscht die Umfrage nach Rückfrage und stößt das Löschen der Ergebnisse an. true, wenn gelöscht wurde. */
	async function remove(): Promise<boolean> {
		await app.refreshRoles();
		if (!app.canWrite) return false;
		const title = options.draftSurvey.value?.title || options.surveyId;
		if (!(await askConfirm("surveyEditor.deleteConfirm", { title }))) return false;

		isDeleting.value = true;
		try {
			await deleteSurvey(options.surveyId);
			toast.add({
				severity: "success",
				summary: t("surveyEditor.deleteConfirm.successSummary"),
				detail: t("surveyEditor.deleteConfirm.successDetail", { title }),
				life: 3500
			});
		} catch (err: any) {
			console.error("Delete survey error:", err);
			toast.add({
				severity: "error",
				summary: t("surveyEditor.deleteConfirm.errorSummary"),
				detail: err?.message || t("surveyEditor.deleteConfirm.errorFallback"),
				life: 5000
			});
			return false;
		} finally {
			isDeleting.value = false;
		}

		// Erst nach dem Entfernen aus der Data Table: das Backend löscht nur Ergebnisse nicht mehr existierender Umfragen
		try {
			await requestSurveyResultsDeletion(options.surveyId, await surveyTableId());
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
		return true;
	}

	return {
		isSaving,
		isDeleting,
		saveAttempted,
		save,
		discard,
		remove
	};
}
