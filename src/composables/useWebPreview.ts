import { ref } from "vue";
import { i18n } from "@/i18n";
import { useAppStore } from "@/stores/appStore";
import { MissingTokenError, PollyApiError } from "@/services/pollyApi";
import { createPreviewInvitation } from "@/services/invitationService";
import { buildPreviewUrl } from "@/domain/survey/invitationLinks";

/**
 * Webvorschau des Stage-Stands (Deployment-Ansicht): Das Backend signiert einen Link mit `stage: true`
 * (7 Tage gültig), die Umfrageseite öffnet sich in einem neuen Tab und speichert beim Absenden nichts.
 */
export function useWebPreview(surveyId: string) {
	const { t } = i18n.global;
	const app = useAppStore();

	const isOpening = ref(false);
	const errorMessage = ref("");
	/** Link, falls der Browser das neue Fenster blockiert hat (zum manuellen Öffnen). */
	const blockedUrl = ref("");

	function toErrorMessage(error: unknown): string {
		if (error instanceof MissingTokenError) return t("deployment.webPreviewErrors.missingToken");
		if (error instanceof PollyApiError) {
			if (error.status === 403) return t("deployment.webPreviewErrors.missingRole");
			if (error.status === 409) return t("deployment.webPreviewErrors.noStage");
			if (error.status === 429) return t("deployment.webPreviewErrors.throttled");
			return `${t("deployment.webPreviewErrors.generic")}: ${error.message}`;
		}
		if (error instanceof Error && error.message) return `${t("deployment.webPreviewErrors.generic")}: ${error.message}`;
		return t("deployment.webPreviewErrors.generic");
	}

	async function openWebPreview(): Promise<void> {
		if (isOpening.value) return;
		// Fenster synchron im Klick öffnen: Nach dem (asynchronen) Abruf des Tokens würde der Popup-Blocker greifen
		const previewWindow = window.open("about:blank", "_blank");
		if (previewWindow) previewWindow.opener = null;

		isOpening.value = true;
		errorMessage.value = "";
		blockedUrl.value = "";
		try {
			// Zweite Absicherung neben dem deaktivierten Button; serverseitig prüft die Lambda selbst
			await app.refreshRoles();
			if (!app.canDeploy) {
				previewWindow?.close();
				errorMessage.value = t("deployment.webPreviewErrors.missingRole");
				return;
			}
			const { jwt } = await createPreviewInvitation(surveyId);
			const url = buildPreviewUrl(window.location.origin, jwt);
			if (previewWindow && !previewWindow.closed) previewWindow.location.href = url;
			else blockedUrl.value = url;
		} catch (error) {
			previewWindow?.close();
			errorMessage.value = toErrorMessage(error);
		} finally {
			isOpening.value = false;
		}
	}

	return { isOpening, errorMessage, blockedUrl, openWebPreview };
}
