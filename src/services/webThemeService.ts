import { apiFetch } from "@/services/pollyApi";
import { parseWebTheme, type WebTheme, type WebThemeTokens } from "@/domain/webTheme/webTheme";

/**
 * Aufrufe der Lambda `web_themes` (siehe `documentation/polly_web.md`, „Designs“). Lesen darf jeder
 * App-Nutzer, Schreiben prüft die Lambda serverseitig gegen `polly_deploy`.
 * Wirft PollyApiError bzw. MissingTokenError.
 */

export interface WebThemeInput {
	name: string;
	isDefault: boolean;
	tokens: WebThemeTokens;
	/** `updatedAt` des geladenen Stands; `null` = neues Design. Abweichung ergibt 409 `conflict`. */
	expectedUpdatedAt: string | null;
}

export async function listWebThemes(): Promise<WebTheme[]> {
	const response = await apiFetch("/web-themes", { method: "GET", headers: { Accept: "application/json" } });
	const body = await response.json();
	const items: unknown[] = Array.isArray(body?.themes) ? body.themes : [];
	// Designs mit unbrauchbaren Tokens werden ausgelassen
	return items.map(parseWebTheme).filter((theme): theme is WebTheme => theme !== null);
}

/** Legt das Design an oder ändert es (`PUT /web-themes/{id}`). */
export async function saveWebTheme(id: string, input: WebThemeInput): Promise<WebTheme | null> {
	const response = await apiFetch(`/web-themes/${encodeURIComponent(id)}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify(input)
	});
	const body = await response.json();
	return parseWebTheme(body?.theme);
}

export async function deleteWebTheme(id: string): Promise<void> {
	await apiFetch(`/web-themes/${encodeURIComponent(id)}`, { method: "DELETE" });
}
