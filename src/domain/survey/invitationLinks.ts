import { CSV_BOM, CSV_SEPARATOR, formatCsvText } from "../../utils/csv";

/**
 * Einladungslinks des Web-Kanals: Link-Aufbau und CSV-Download (siehe `documentation/polly_web.md`).
 * Rein und aliasfrei: Die Lambda `invitations` nutzt die Grenzen für die Anzahl mit.
 */

/** Anzahl der Links pro Erzeugung (Frontend und `POST /invitations`). */
export const INVITATION_COUNT_MIN = 1;
export const INVITATION_COUNT_MAX = 5000;

/** Gültigkeit eines Webvorschau-Links (Stage-Stand), vom Server fest gesetzt. */
export const PREVIEW_TOKEN_TTL_DAYS = 7;
export const PREVIEW_TOKEN_TTL_SECONDS = PREVIEW_TOKEN_TTL_DAYS * 24 * 60 * 60;

/** Platzhalter in der Basis-URL, an dessen Stelle der Token tritt. */
export const INVITATION_TOKEN_PLACEHOLDER = "{token}";

/** Pfad der Polly-Umfrageseite, wenn die Umfrage keine Basis-URL hat. */
export const WEB_SURVEY_PATH_PREFIX = "/s/";

/**
 * Maximale Länge der Basis-URL. Begrenzt die Antwort von `POST /ext/v1/invitations`: 5000 Links mit
 * je zweimal dem Token (~370 Zeichen) müssen unter dem Limit der Lambda-Antwort (6 MB) bleiben.
 */
export const BASE_URL_MAX_CHARS = 200;

/**
 * Prüft die Basis-URL der Einladungslinks: leer ist erlaubt, sonst eine absolute https://-URL
 * mit höchstens einem Platzhalter {token} und höchstens `BASE_URL_MAX_CHARS` Zeichen.
 * Liefert den Fehlerschlüssel unter `validation.*`. Auch serverseitig genutzt (Kunden-API).
 */
export function baseUrlError(baseUrl: string | null | undefined): "baseUrlTokenCount" | "baseUrlInvalid" | "baseUrlTooLong" | null {
	const value = baseUrl?.trim();
	if (!value) return null;
	if (value.length > BASE_URL_MAX_CHARS) return "baseUrlTooLong";
	if (value.split(INVITATION_TOKEN_PLACEHOLDER).length - 1 > 1) return "baseUrlTokenCount";
	if (/\s/.test(value)) return "baseUrlInvalid";
	try {
		const url = new URL(value.replace(INVITATION_TOKEN_PLACEHOLDER, "token"));
		return url.protocol === "https:" && url.hostname ? null : "baseUrlInvalid";
	} catch {
		return "baseUrlInvalid";
	}
}

export const INVITATION_CSV_HEADER = ["Expiration", "Multi use", "Complete URL"].join(CSV_SEPARATOR);

export interface InvitationCsvRow {
	/** Ablaufdatum der Einladung (Epoch-Sekunden); fehlt = läuft nie ab. */
	exp?: number;
	multi: boolean;
	url: string;
}

/**
 * Baut den Link einer Einladung:
 * - Basis-URL mit `{token}` → Platzhalter wird ersetzt
 * - Basis-URL ohne Platzhalter → `?token=` bzw. `&token=` (vor einem `#fragment`)
 * - ohne Basis-URL → `<fallbackOrigin>/s/<jwt>`
 * Ein JWT besteht nur aus Base64url-Zeichen und Punkten und braucht kein URL-Encoding.
 */
export function buildInvitationUrl(baseUrl: string | null | undefined, jwt: string, fallbackOrigin: string): string {
	const base = (baseUrl ?? "").trim();
	if (!base) return `${fallbackOrigin.replace(/\/+$/, "")}${WEB_SURVEY_PATH_PREFIX}${jwt}`;

	if (base.includes(INVITATION_TOKEN_PLACEHOLDER)) {
		return base.replace(INVITATION_TOKEN_PLACEHOLDER, jwt);
	}

	const hashIndex = base.indexOf("#");
	const path = hashIndex >= 0 ? base.slice(0, hashIndex) : base;
	const fragment = hashIndex >= 0 ? base.slice(hashIndex) : "";
	let separator = "";
	if (!path.includes("?")) separator = "?";
	else if (!path.endsWith("?") && !path.endsWith("&")) separator = "&";
	return `${path}${separator}token=${jwt}${fragment}`;
}

/** Link einer Webvorschau: immer die Polly-Umfrageseite, nie die Basis-URL der Umfrage. */
export function buildPreviewUrl(origin: string, jwt: string): string {
	return `${origin.replace(/\/+$/, "")}${WEB_SURVEY_PATH_PREFIX}${jwt}`;
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/**
 * Ablaufdatum als ISO 8601 in der lokalen Zeit des Erstellers mit Offset,
 * z. B. `2026-12-31T23:59:59+01:00` (so wie es im DatePicker gewählt wurde).
 */
export function formatInvitationExpiration(exp: number | undefined): string {
	if (exp === undefined || exp === null) return "";
	const date = new Date(exp * 1000);
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absOffset = Math.abs(offsetMinutes);
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
		`T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
		`${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`
	);
}

/** Ablaufdatum aus dem gewählten Tag: Tagesende 23:59:59 in lokaler Zeit, als Epoch-Sekunden. */
export function expirationFromDate(date: Date): number {
	const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 0);
	return Math.floor(endOfDay.getTime() / 1000);
}

/** CSV `Expiration;Multi use;Complete URL` mit BOM, Zeilenende CRLF, Escape und Formelschutz. */
export function buildInvitationCsv(rows: InvitationCsvRow[]): string {
	const lines = rows.map(row =>
		[
			formatCsvText(formatInvitationExpiration(row.exp)),
			row.multi ? "true" : "false",
			formatCsvText(row.url)
		].join(CSV_SEPARATOR)
	);
	return `${CSV_BOM}${[INVITATION_CSV_HEADER, ...lines].join("\r\n")}\r\n`;
}
