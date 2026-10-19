// Pfad-Präfix für Aufrufe des eigenen Backends. Amplify Hosting leitet das Präfix per Rewrite-Regel
// auf das API Gateway weiter. Die Regeln gelten app-weit; damit mehrere Branches einer Amplify-App
// je ein eigenes Backend nutzen können, setzt die Branch-Umgebungsvariable VITE_API_PREFIX
// (z. B. "/api_websurveys") beim Build ein eigenes Präfix. Default "/api".
const DEFAULT_API_PREFIX = "/api";

function normalizeApiPrefix(value: string | undefined): string {
	const trimmed = (value ?? "").trim().replace(/\/+$/, "");
	if (!trimmed) return DEFAULT_API_PREFIX;
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export const API_PREFIX: string = normalizeApiPrefix(import.meta.env.VITE_API_PREFIX);
