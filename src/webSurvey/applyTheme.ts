import { toCssVariables, type WebThemeTokens } from "@/domain/webTheme/webTheme";

/**
 * Setzt ein Web-Design als CSS-Custom-Properties am Root (`style.setProperty`). Die CSP
 * `style-src 'self'` sperrt nur Inline-`<style>` und `style`-Attribute im Markup, CSSOM-Zugriffe sind
 * erlaubt. Ohne Design (`undefined`/`null`) gelten wieder die Defaults aus `webSurvey.css`.
 * Erwartet bereinigte Tokens (`sanitizeWebThemeTokens`).
 */
export function applyTheme(tokens: WebThemeTokens | null | undefined, root: HTMLElement = document.documentElement): void {
	const style = root.style;
	const previous: string[] = [];
	for (let index = 0; index < style.length; index++) {
		const name = style.item(index);
		if (name.startsWith("--ws-")) previous.push(name);
	}
	for (const name of previous) style.removeProperty(name);

	if (!tokens) return;
	for (const [name, value] of Object.entries(toCssVariables(tokens))) {
		style.setProperty(name, value);
	}
}
