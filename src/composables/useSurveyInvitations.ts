import { computed, onBeforeUnmount, ref } from "vue";
import type { Ref } from "vue";
import { i18n } from "@/i18n";
import { useAppStore } from "@/stores/appStore";
import { MissingTokenError, PollyApiError } from "@/services/pollyApi";
import { createInvitations } from "@/services/invitationService";
import { readFieldVersion } from "@/domain/survey/surveyRow";
import type { Survey } from "@/domain/survey/surveyTypes";
import {
	INVITATION_COUNT_MAX,
	INVITATION_COUNT_MIN,
	buildInvitationCsv,
	buildInvitationUrl,
	expirationFromDate
} from "@/domain/survey/invitationLinks";
import { downloadBlob } from "@/utils/download";

export interface UseSurveyInvitationsOptions {
	survey: Ref<Survey>;
	surveyId: string;
	/** Rohzeile `survey_<id>`; daraus wird der Prod-Stand erkannt. */
	existingRow: Ref<Record<string, any> | null>;
}

/** Prod-Feld vorhanden und lesbar (auch ältere Stände ohne `version`). */
function hasFlowContent(raw: unknown): boolean {
	if (!raw || raw === "{}") return false;
	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		return !!parsed && typeof parsed === "object" && Object.keys(parsed).length > 0;
	} catch {
		return false;
	}
}

function formatDateParam(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfToday(): Date {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function useSurveyInvitations({ survey, surveyId, existingRow }: UseSurveyInvitationsOptions) {
	const { t } = i18n.global;
	const app = useAppStore();

	const count = ref<number | null>(1);
	const expiryDate = ref<Date | null>(null);
	const multi = ref<boolean>(false);
	const isGenerating = ref<boolean>(false);
	const errorMessage = ref<string>("");
	/** Anzahl der zuletzt erzeugten Links (Erfolgsmeldung). */
	const lastGeneratedCount = ref<number | null>(null);

	let abortController: AbortController | null = null;

	const minExpiryDate = computed(() => startOfToday());
	const hasProd = computed(() => hasFlowContent(existingRow.value?.Prod));
	const prodVersion = computed(() => readFieldVersion(existingRow.value?.Prod));

	/** Basis-URL aus dem gespeicherten Draft; leer = Polly-Umfrageseite. */
	const baseUrl = computed(() => (survey.value.base_url ?? "").trim());
	const fallbackOrigin = computed(() => window.location.origin);
	/** Beispiel-Link zur Anzeige (Platzhalter statt echtem Token). */
	const exampleUrl = computed(() => buildInvitationUrl(baseUrl.value, "<token>", fallbackOrigin.value));

	const isCountValid = computed(
		() =>
			typeof count.value === "number" &&
			Number.isInteger(count.value) &&
			count.value >= INVITATION_COUNT_MIN &&
			count.value <= INVITATION_COUNT_MAX
	);
	const isExpiryValid = computed(() => !expiryDate.value || expiryDate.value >= minExpiryDate.value);

	const canGenerate = computed(
		() => app.canDeploy && hasProd.value && isCountValid.value && isExpiryValid.value && !isGenerating.value
	);

	function toErrorMessage(error: unknown): string {
		if (error instanceof MissingTokenError) return t("invitations.errors.missingToken");
		if (error instanceof PollyApiError) {
			if (error.status === 403) return t("invitations.errors.missingRole");
			if (error.status === 409) return t("invitations.errors.noProd");
			if (error.status === 429) return t("invitations.errors.throttled");
			return `${t("invitations.errors.generic")}: ${error.message}`;
		}
		if (error instanceof Error && error.message) return `${t("invitations.errors.generic")}: ${error.message}`;
		return t("invitations.errors.generic");
	}

	async function generate(): Promise<void> {
		// Zweite Absicherung neben dem deaktivierten Button; serverseitig prüft die Lambda selbst
		await app.refreshRoles();
		if (!canGenerate.value) return;

		const exp = expiryDate.value ? expirationFromDate(expiryDate.value) : undefined;
		if (exp !== undefined && exp <= Math.floor(Date.now() / 1000)) {
			errorMessage.value = t("invitations.errors.expiryInPast");
			return;
		}

		const controller = new AbortController();
		abortController = controller;
		isGenerating.value = true;
		errorMessage.value = "";
		lastGeneratedCount.value = null;
		try {
			const tokens = await createInvitations(
				{ surveyId, count: count.value!, multi: multi.value, ...(exp !== undefined ? { exp } : {}) },
				controller.signal
			);
			const csv = buildInvitationCsv(
				tokens.map(token => ({
					exp: token.exp,
					multi: token.multi,
					url: buildInvitationUrl(baseUrl.value, token.jwt, fallbackOrigin.value)
				}))
			);
			const filename = `${survey.value.name || surveyId}_invitations_${formatDateParam(new Date())}.csv`;
			downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
			lastGeneratedCount.value = tokens.length;
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError")) {
				errorMessage.value = toErrorMessage(error);
			}
		} finally {
			if (abortController === controller) abortController = null;
			isGenerating.value = false;
		}
	}

	onBeforeUnmount(() => abortController?.abort());

	return {
		count,
		expiryDate,
		multi,
		isGenerating,
		errorMessage,
		lastGeneratedCount,
		minExpiryDate,
		hasProd,
		prodVersion,
		baseUrl,
		exampleUrl,
		isCountValid,
		isExpiryValid,
		canGenerate,
		generate
	};
}
