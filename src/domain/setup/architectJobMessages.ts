// Fasst die Meldungen eines gescheiterten Architect-Import-Jobs (GET /api/v2/flows/jobs/{id})
// zu einer lesbaren Fehlermeldung zusammen. Archy liefert dieselbe Ursache mehrfach und mit
// Rauschen („exit code: 100“, „Error(s) encountered.“ …); gezeigt wird nur die eigentliche Ursache.

export interface ArchitectJobMessage {
	type?: string;
	text?: string;
	details?: Array<{ responseBody?: string }>;
}

const MAX_REASONS = 3;

// Reine Statuszeilen ohne Aussage über die Ursache
const NOISE_PATTERNS = [
	/^setting the Archy exit code/i,
	/^exit code:/i,
	/^Error\(s\) encountered\.?$/i,
	/^Architect Scripting errors will be listed above\.?$/i
];

function responseBodyMessage(body: string | undefined): string | null {
	if (!body) return null;
	try {
		const parsed = JSON.parse(body) as { message?: unknown };
		return typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim() : null;
	} catch {
		return null;
	}
}

function cleanText(text: string): string {
	return text
		.replace(/^promise tracked by async tracker rejected\.\s*Error:\s*/i, "")
		.replace(/\s*--\s*\[Arch[A-Za-z]*\]\s*$/, "")
		.replace(/\s+/g, " ")
		.trim();
}

function unique(values: string[]): string[] {
	return [...new Set(values)].slice(0, MAX_REASONS);
}

export function summarizeArchitectJobMessages(messages: ArchitectJobMessage[] | null | undefined): string {
	const errors = (messages ?? []).filter(m => !m.type || m.type.toLowerCase() === "error");

	// Bevorzugt: Fehlertext der Genesys-API aus den Netzwerkdiagnosen (z. B. fehlende Berechtigung)
	const apiMessages = errors.flatMap(m => (m.details ?? []).map(d => responseBodyMessage(d.responseBody)))
		.filter((m): m is string => !!m);
	if (apiMessages.length) return unique(apiMessages).join("\n");

	const texts = errors.map(m => cleanText(m.text ?? ""))
		.filter(t => t && !NOISE_PATTERNS.some(p => p.test(t)));
	if (texts.length) return unique(texts).join("\n");

	return "Unknown error";
}
