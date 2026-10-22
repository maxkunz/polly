/**
 * Reine CSV-Hilfsfunktionen (Trennzeichen `;`, RFC-4180-Quoting, Formelschutz für Excel).
 * Aliasfrei, weil auch die Lambda `survey_responses_export` sie bündelt (siehe CLAUDE.md).
 */

export const CSV_SEPARATOR = ";";

/** Byte Order Mark, damit Excel die Datei als UTF-8 erkennt. */
export const CSV_BOM = "\uFEFF";

/**
 * Schützt vor Formel-Injection in Excel: Strings, die mit =, +, -, @, Tab oder CR beginnen,
 * bekommen ein Hochkomma vorangestellt.
 */
export function neutralizeFormula(text: string): string {
	return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Quotet ein Feld nach RFC 4180, wenn es Trennzeichen, Anführungszeichen oder Zeilenumbrüche enthält. */
export function escapeCsvField(text: string): string {
	if (/[;"\r\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

/** Textfeld mit Formelschutz und Quoting; null/undefined ergeben ein leeres Feld. */
export function formatCsvText(value: unknown): string {
	if (value === null || value === undefined) return "";
	return escapeCsvField(neutralizeFormula(String(value)));
}
