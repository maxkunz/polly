import { computed, ref } from "vue";
import { i18n } from "@/i18n";
import { MissingTokenError, PollyApiError } from "@/services/pollyApi";
import { deleteWebTheme, listWebThemes, saveWebTheme, type WebThemeInput } from "@/services/webThemeService";
import { listAllDataTableRows } from "@/services/genesys/dataTable";
import { surveyTableId } from "@/services/surveyService";
import type { WebTheme } from "@/domain/webTheme/webTheme";

/**
 * Web-Designs des Mandanten (Einstellungen → Web-Designs, Auswahl im Umfrage-Editor). Die Liste ist
 * modulweit geteilt: Einstellungen und Editor sehen nach dem Speichern denselben Stand, ohne erneut zu laden.
 */

const themes = ref<WebTheme[]>([]);
const loaded = ref(false);
const loading = ref(false);
const loadError = ref("");
let pending: Promise<void> | null = null;

/** Zeilen `survey_<uuid>` der Umfrage-Data-Table (nicht `survey_list`, `__meta`, `__lock`). */
const SURVEY_ROW_KEY = /^survey_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `web_theme_id` und Titel aus einer Zelle (Draft/Prod) mit einem einzigen `JSON.parse`. */
function readCell(raw: unknown): { themeId?: string; title: string } {
	if (typeof raw !== "string" || !raw.trim()) return { title: "" };
	try {
		const parsed = JSON.parse(raw);
		return {
			themeId: typeof parsed?.web_theme_id === "string" ? parsed.web_theme_id : undefined,
			title: typeof parsed?.title === "string" ? parsed.title : ""
		};
	} catch {
		return { title: "" };
	}
}

export function webThemeErrorMessage(error: unknown): string {
	const { t } = i18n.global;
	if (error instanceof MissingTokenError) return t("webThemes.errors.missingToken");
	if (error instanceof PollyApiError) {
		if (error.status === 403) return t("webThemes.errors.missingRole");
		if (error.code === "limit_reached") return t("webThemes.errors.limitReached");
		if (error.status === 409) return t("webThemes.errors.conflict");
		if (error.status === 429) return t("webThemes.errors.throttled");
		return `${t("webThemes.errors.generic")}: ${error.message}`;
	}
	if (error instanceof Error && error.message) return `${t("webThemes.errors.generic")}: ${error.message}`;
	return t("webThemes.errors.generic");
}

export function useWebThemes() {
	async function load(force = false): Promise<void> {
		if (pending) {
			// Läuft schon eine Abfrage, kann sie vor einer eben gespeicherten Änderung gestartet sein:
			// Bei `force` danach noch einmal laden, sonst würde der alte Stand übernommen
			if (!force) return pending;
			await pending;
			return load(true);
		}
		if (loaded.value && !force) return;
		loading.value = true;
		loadError.value = "";
		pending = (async () => {
			try {
				themes.value = await listWebThemes();
				loaded.value = true;
			} catch (error) {
				loadError.value = webThemeErrorMessage(error);
			} finally {
				loading.value = false;
				pending = null;
			}
		})();
		return pending;
	}

	/** Speichert und lädt danach neu (ein neues Standard-Design nimmt dem bisherigen die Markierung). */
	async function save(id: string, input: WebThemeInput): Promise<void> {
		// Bei 409 (zwischenzeitlich geändert/gelöscht) wirft saveWebTheme; die Aufrufer laden dann neu
		await saveWebTheme(id, input);
		await load(true);
	}

	async function remove(id: string): Promise<void> {
		await deleteWebTheme(id);
		themes.value = themes.value.filter(theme => theme.id !== id);
	}

	/**
	 * Titel der Umfragen, deren Entwurf oder Prod-Stand das Design nutzt (Hinweis vor dem Löschen).
	 * Liest die Umfrage-Data-Table einmal komplett (die Umfrageliste kennt das Design nicht); nur beim
	 * Löschen, deshalb vertretbar. Jede Zelle wird höchstens einmal geparst.
	 */
	async function findSurveysUsingTheme(themeId: string): Promise<string[]> {
		const rows = await listAllDataTableRows(await surveyTableId());
		const titles: string[] = [];
		for (const row of rows) {
			const key = String(row?.key ?? "");
			if (!SURVEY_ROW_KEY.test(key)) continue;
			const draft = readCell(row?.Draft);
			const prod = draft.themeId === themeId ? null : readCell(row?.Prod);
			if (draft.themeId === themeId || prod?.themeId === themeId) {
				titles.push(draft.title || prod?.title || key);
			}
		}
		return titles;
	}

	const defaultTheme = computed(() => themes.value.find(theme => theme.isDefault) ?? null);

	return {
		themes,
		loaded,
		loading,
		loadError,
		defaultTheme,
		load,
		save,
		remove,
		findSurveysUsingTheme
	};
}
