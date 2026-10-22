/**
 * Web-Designs der öffentlichen Umfrageseite (siehe `documentation/implementationsplan_web_designs.md`
 * und `documentation/polly_web.md`): Ein Design besteht nur aus Tokens (Hex-Farben, Zahlen,
 * Enum-Schlüssel), nie aus freiem CSS. Dieselbe Prüfung (`sanitizeWebThemeTokens`) läuft beim
 * Speichern und Ausliefern in den Lambdas und noch einmal auf der Seite.
 *
 * Rein und aliasfrei (kein `@/`), weil Lambdas, App und Umfrageseite das Modul gemeinsam nutzen.
 * Getestet in `test/webTheme.test.ts`.
 */

/** Feste Schrift-Stacks des Systems; es werden keine Schriftdateien geladen (CSP `font-src 'self'`). */
export const FONT_STACKS = {
	system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
	sans: '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif',
	serif: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, "Times New Roman", serif',
	humanist: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
	rounded: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif'
} as const;

export type WebThemeFont = keyof typeof FONT_STACKS;

export const WEB_THEME_FONTS = Object.keys(FONT_STACKS) as WebThemeFont[];

/** Textarten der Seite, in der Reihenfolge der Tabelle „Textstile“ im Editor. */
export const WEB_TEXT_ROLES = [
	"heading", // h1: Umfragetitel, Überschrift der Status-/Fehlerseiten
	"subheading", // h2: Überschrift der Fehlerübersicht
	"body", // Begrüßung, Verabschiedung, Meldungstexte, Grundschrift
	"questionTitle", // legend/label der Frage
	"description", // Beschreibung der Frage
	"option", // Antwortoptionen, Skalenwerte, Eingabe im Textfeld
	"scaleLabel", // Min-/Max-Labels der Skala
	"hint", // Zeichenzähler, Hinweise, Pflichtfeld-Erklärung
	"error", // Fehlertexte an Feldern
	"button"
] as const;

export type WebTextRole = (typeof WEB_TEXT_ROLES)[number];

export const WEB_TEXT_WEIGHTS = [400, 500, 600, 700] as const;

export type WebTextWeight = (typeof WEB_TEXT_WEIGHTS)[number];

export interface WebTextStyle {
	/** Schriftgröße in px (ganzzahlig), ausgegeben als `rem` (px / 16). */
	size: number;
	weight: WebTextWeight;
	/** Zeilenhöhe als Faktor, höchstens zwei Nachkommastellen. */
	lineHeight: number;
}

export const WEB_THEME_COLOR_KEYS = [
	"background",
	"surface",
	"text",
	"heading",
	"textMuted",
	"primary",
	"onPrimary",
	"border",
	"error"
] as const;

export type WebThemeColorKey = (typeof WEB_THEME_COLOR_KEYS)[number];

export type WebThemeColors = Record<WebThemeColorKey, string>;

export const WEB_THEME_SCHEMA_VERSION = 1;

export interface WebThemeTokens {
	schemaVersion: typeof WEB_THEME_SCHEMA_VERSION;
	fontFamily: WebThemeFont;
	text: Record<WebTextRole, WebTextStyle>;
	/** Nur `#rrggbb` (klein geschrieben nach der Bereinigung). */
	colors: WebThemeColors;
	/** Für iframes: Seitenhintergrund transparent (Karten behalten `surface`). */
	transparentBackground?: boolean;
}

/** Gespeichertes Design eines Mandanten (Tabelle `WebSurveyThemesTable`). */
export interface WebTheme {
	id: string;
	name: string;
	isDefault: boolean;
	tokens: WebThemeTokens;
	updatedAt: string;
	updatedBy?: string;
}

const WEB_THEME_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Design-IDs sind UUIDs (in der App erzeugt); geprüft im Validator des Drafts und in der Lambda. */
export function isWebThemeId(value: unknown): value is string {
	return typeof value === "string" && WEB_THEME_ID_PATTERN.test(value);
}

/** Länge des Namens eines Designs (Zeichen). */
export const WEB_THEME_NAME_MAX_CHARS = 60;

/** Höchstzahl Designs pro Mandant (prüft die Lambda `web_themes`). */
export const WEB_THEME_MAX_PER_TENANT = 50;

/** Grenzen der Schriftgröße pro Rolle in px (inklusive). */
export const WEB_TEXT_SIZE_LIMITS: Record<WebTextRole, { min: number; max: number }> = {
	heading: { min: 16, max: 48 },
	subheading: { min: 14, max: 36 },
	body: { min: 12, max: 24 },
	questionTitle: { min: 12, max: 32 },
	description: { min: 12, max: 24 },
	option: { min: 12, max: 24 },
	scaleLabel: { min: 10, max: 20 },
	hint: { min: 10, max: 20 },
	error: { min: 12, max: 24 },
	button: { min: 12, max: 24 }
};

export const WEB_TEXT_LINE_HEIGHT_MIN = 1;
export const WEB_TEXT_LINE_HEIGHT_MAX = 2;

/**
 * Eingebautes Polly-Design = heutiger Stand von `webSurvey.css` und der Tailwind-Klassen in den
 * Templates. Zeilenhöhen von `subheading` (`text-lg`: 28/18) und `hint` (`text-sm`: 20/14) auf zwei
 * Stellen gerundet.
 */
export const DEFAULT_WEB_THEME_TOKENS: WebThemeTokens = {
	schemaVersion: WEB_THEME_SCHEMA_VERSION,
	fontFamily: "system",
	text: {
		heading: { size: 28, weight: 700, lineHeight: 1.25 },
		subheading: { size: 18, weight: 600, lineHeight: 1.56 },
		body: { size: 16, weight: 400, lineHeight: 1.5 },
		questionTitle: { size: 17, weight: 600, lineHeight: 1.5 },
		description: { size: 16, weight: 400, lineHeight: 1.5 },
		option: { size: 16, weight: 400, lineHeight: 1.5 },
		scaleLabel: { size: 14, weight: 400, lineHeight: 1.5 },
		hint: { size: 14, weight: 400, lineHeight: 1.43 },
		error: { size: 16, weight: 600, lineHeight: 1.5 },
		button: { size: 16, weight: 600, lineHeight: 1.5 }
	},
	colors: {
		background: "#f8fafc",
		surface: "#ffffff",
		text: "#0f172a",
		heading: "#0f172a",
		textMuted: "#334155",
		primary: "#14387f",
		onPrimary: "#ffffff",
		border: "#64748b",
		error: "#b91c1c"
	},
	transparentBackground: false
};

/** Tiefe Kopie der Defaults, z. B. als Startwert eines neuen Designs im Editor. */
export function defaultWebThemeTokens(): WebThemeTokens {
	return {
		...DEFAULT_WEB_THEME_TOKENS,
		text: Object.fromEntries(
			WEB_TEXT_ROLES.map((role) => [role, { ...DEFAULT_WEB_THEME_TOKENS.text[role] }])
		) as Record<WebTextRole, WebTextStyle>,
		colors: { ...DEFAULT_WEB_THEME_TOKENS.colors }
	};
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(record: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
}

function sanitizeTextStyle(role: WebTextRole, input: unknown): WebTextStyle | null {
	const fallback = DEFAULT_WEB_THEME_TOKENS.text[role];
	if (input === undefined) {
		return { ...fallback };
	}
	if (!isRecord(input)) {
		return null;
	}
	const { min, max } = WEB_TEXT_SIZE_LIMITS[role];
	const size = has(input, "size") ? input.size : fallback.size;
	if (typeof size !== "number" || !Number.isInteger(size) || size < min || size > max) {
		return null;
	}
	const weight = has(input, "weight") ? input.weight : fallback.weight;
	if (!WEB_TEXT_WEIGHTS.includes(weight as WebTextWeight)) {
		return null;
	}
	const lineHeight = has(input, "lineHeight") ? input.lineHeight : fallback.lineHeight;
	if (
		typeof lineHeight !== "number" ||
		!Number.isFinite(lineHeight) ||
		lineHeight < WEB_TEXT_LINE_HEIGHT_MIN ||
		lineHeight > WEB_TEXT_LINE_HEIGHT_MAX ||
		Math.abs(lineHeight * 100 - Math.round(lineHeight * 100)) > 1e-9
	) {
		return null;
	}
	return { size, weight: weight as WebTextWeight, lineHeight };
}

/**
 * Prüft ein Design als Whitelist: unbekannte Felder und Rollen werden verworfen, fehlende Rollen,
 * Felder und Farben mit den Defaults aufgefüllt (so bleiben gespeicherte Designs gültig, wenn später
 * Rollen dazukommen). Werte außerhalb der Grenzen, unbekannte Schriften, Farben außer `#rrggbb` und
 * eine andere `schemaVersion` machen das Design ungültig (`null`); es gibt keine stillen Korrekturen.
 */
export function sanitizeWebThemeTokens(input: unknown): WebThemeTokens | null {
	if (!isRecord(input)) {
		return null;
	}
	if (has(input, "schemaVersion") && input.schemaVersion !== WEB_THEME_SCHEMA_VERSION) {
		return null;
	}

	const fontFamily = has(input, "fontFamily") ? input.fontFamily : DEFAULT_WEB_THEME_TOKENS.fontFamily;
	if (typeof fontFamily !== "string" || !(WEB_THEME_FONTS as string[]).includes(fontFamily)) {
		return null;
	}

	const textInput = has(input, "text") ? input.text : {};
	if (!isRecord(textInput)) {
		return null;
	}
	const text = {} as Record<WebTextRole, WebTextStyle>;
	for (const role of WEB_TEXT_ROLES) {
		const style = sanitizeTextStyle(role, has(textInput, role) ? textInput[role] : undefined);
		if (!style) {
			return null;
		}
		text[role] = style;
	}

	const colorsInput = has(input, "colors") ? input.colors : {};
	if (!isRecord(colorsInput)) {
		return null;
	}
	const colors = {} as WebThemeColors;
	for (const key of WEB_THEME_COLOR_KEYS) {
		const value = has(colorsInput, key) ? colorsInput[key] : DEFAULT_WEB_THEME_TOKENS.colors[key];
		if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) {
			return null;
		}
		colors[key] = value.toLowerCase();
	}

	const transparentBackground = has(input, "transparentBackground") ? input.transparentBackground : false;
	if (typeof transparentBackground !== "boolean") {
		return null;
	}

	return {
		schemaVersion: WEB_THEME_SCHEMA_VERSION,
		fontFamily: fontFamily as WebThemeFont,
		text,
		colors,
		transparentBackground
	};
}

/**
 * Gespeichertes Design (API-Antwort oder DynamoDB-Eintrag mit `id`) prüfen. Die Tokens laufen noch
 * einmal durch `sanitizeWebThemeTokens` (neue Rollen werden so mit Defaults aufgefüllt); `null` bei
 * unbrauchbarem Eintrag. Gemeinsam für App und Lambdas.
 */
export function parseWebTheme(value: unknown): WebTheme | null {
	if (!isRecord(value) || !isWebThemeId(value.id) || typeof value.name !== "string") {
		return null;
	}
	const tokens = sanitizeWebThemeTokens(value.tokens);
	if (!tokens) {
		return null;
	}
	return {
		id: value.id,
		name: value.name,
		isDefault: value.isDefault === true,
		tokens,
		updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
		...(typeof value.updatedBy === "string" && value.updatedBy ? { updatedBy: value.updatedBy } : {})
	};
}

/** Rolle → Teil des Variablennamens: `questionTitle` → `question-title`. */
function kebab(value: string): string {
	return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** CSS-Variablen der Farben; `heading` heißt `--ws-heading-color`, weil `--ws-heading-*` die Textrolle ist. */
const COLOR_VARIABLES: Record<WebThemeColorKey, string> = {
	background: "--ws-background",
	surface: "--ws-surface",
	text: "--ws-text",
	heading: "--ws-heading-color",
	textMuted: "--ws-text-muted",
	primary: "--ws-primary",
	onPrimary: "--ws-on-primary",
	border: "--ws-border",
	error: "--ws-error"
};

function pxToRem(px: number): string {
	return `${Number((px / 16).toFixed(4))}rem`;
}

/**
 * Tokens → CSS-Custom-Properties für `style.setProperty` auf der Umfrageseite: `--ws-font-family`,
 * je Rolle `--ws-<rolle>-size/-weight/-line-height`, die Farben und `--ws-page-background`
 * (`transparent` oder die Hintergrundfarbe). Größen in `rem`, damit Zoom und eine größere
 * Grundschrift des Nutzers weiter wirken (WCAG 1.4.4). Erwartet bereinigte Tokens.
 */
export function toCssVariables(tokens: WebThemeTokens): Record<string, string> {
	const variables: Record<string, string> = {
		"--ws-font-family": FONT_STACKS[tokens.fontFamily]
	};
	for (const role of WEB_TEXT_ROLES) {
		const style = tokens.text[role];
		const prefix = `--ws-${kebab(role)}`;
		variables[`${prefix}-size`] = pxToRem(style.size);
		variables[`${prefix}-weight`] = String(style.weight);
		variables[`${prefix}-line-height`] = String(style.lineHeight);
	}
	for (const key of WEB_THEME_COLOR_KEYS) {
		variables[COLOR_VARIABLES[key]] = tokens.colors[key];
	}
	variables["--ws-page-background"] = tokens.transparentBackground ? "transparent" : tokens.colors.background;
	return variables;
}

function channelToLinear(channel: number): number {
	const value = channel / 255;
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Relative Luminanz nach WCAG 2.x für `#rrggbb`. */
export function relativeLuminance(hex: string): number {
	const red = channelToLinear(parseInt(hex.slice(1, 3), 16));
	const green = channelToLinear(parseInt(hex.slice(3, 5), 16));
	const blue = channelToLinear(parseInt(hex.slice(5, 7), 16));
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Kontrastverhältnis zweier Farben (1 bis 21). */
export function contrastRatio(first: string, second: string): number {
	const a = relativeLuminance(first);
	const b = relativeLuminance(second);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const WCAG_TEXT_CONTRAST_MIN = 4.5;
export const WCAG_NON_TEXT_CONTRAST_MIN = 3;

export interface ContrastWarning {
	foreground: WebThemeColorKey;
	background: WebThemeColorKey;
	ratio: number;
	minimum: number;
}

/** Geprüfte Farbpaare: Text 4.5:1, Rahmen und Fokus (primary auf background) 3:1. */
const CONTRAST_PAIRS: { foreground: WebThemeColorKey; background: WebThemeColorKey; minimum: number }[] = [
	{ foreground: "text", background: "background", minimum: WCAG_TEXT_CONTRAST_MIN },
	{ foreground: "text", background: "surface", minimum: WCAG_TEXT_CONTRAST_MIN },
	{ foreground: "heading", background: "surface", minimum: WCAG_TEXT_CONTRAST_MIN },
	{ foreground: "textMuted", background: "surface", minimum: WCAG_TEXT_CONTRAST_MIN },
	{ foreground: "primary", background: "surface", minimum: WCAG_TEXT_CONTRAST_MIN },
	{ foreground: "onPrimary", background: "primary", minimum: WCAG_TEXT_CONTRAST_MIN },
	{ foreground: "error", background: "surface", minimum: WCAG_TEXT_CONTRAST_MIN },
	{ foreground: "border", background: "surface", minimum: WCAG_NON_TEXT_CONTRAST_MIN },
	{ foreground: "primary", background: "background", minimum: WCAG_NON_TEXT_CONTRAST_MIN }
];

/**
 * Farbpaare unter WCAG AA. Nur eine Warnung im Editor, gespeichert werden kann trotzdem; AA ist nur
 * ohne Warnung zugesichert. Erwartet bereinigte Tokens.
 */
export function checkThemeContrast(tokens: WebThemeTokens): ContrastWarning[] {
	const warnings: ContrastWarning[] = [];
	for (const pair of CONTRAST_PAIRS) {
		const ratio = contrastRatio(tokens.colors[pair.foreground], tokens.colors[pair.background]);
		if (ratio < pair.minimum) {
			warnings.push({ ...pair, ratio });
		}
	}
	return warnings;
}

/**
 * Nachrichten der Design-Vorschau (`survey.html?preview=1` im iframe der App, gleicher Origin):
 * - Seite → App: `polly:preview-ready`, sobald sie Nachrichten annimmt (dann schickt die App das Design)
 * - App → Seite: `polly:theme` mit den Tokens, `polly:highlight` mit der hervorzuhebenden Rolle (`null` = keine)
 * Die Seite nimmt nur Nachrichten vom eigenen Origin und vom einbettenden Fenster an.
 */
export const WEB_THEME_PREVIEW_READY = "polly:preview-ready";
export const WEB_THEME_PREVIEW_THEME = "polly:theme";
export const WEB_THEME_PREVIEW_HIGHLIGHT = "polly:highlight";

export type WebThemePreviewMessage =
	| { type: typeof WEB_THEME_PREVIEW_THEME; tokens: WebThemeTokens }
	| { type: typeof WEB_THEME_PREVIEW_HIGHLIGHT; role: WebTextRole | null };

/** Prüft eine empfangene Vorschau-Nachricht; Tokens laufen durch `sanitizeWebThemeTokens`. */
export function parsePreviewMessage(data: unknown): WebThemePreviewMessage | null {
	if (!isRecord(data)) {
		return null;
	}
	if (data.type === WEB_THEME_PREVIEW_THEME) {
		const tokens = sanitizeWebThemeTokens(data.tokens);
		return tokens ? { type: WEB_THEME_PREVIEW_THEME, tokens } : null;
	}
	if (data.type === WEB_THEME_PREVIEW_HIGHLIGHT) {
		if (data.role === null || data.role === undefined) {
			return { type: WEB_THEME_PREVIEW_HIGHLIGHT, role: null };
		}
		return (WEB_TEXT_ROLES as readonly unknown[]).includes(data.role)
			? { type: WEB_THEME_PREVIEW_HIGHLIGHT, role: data.role as WebTextRole }
			: null;
	}
	return null;
}
