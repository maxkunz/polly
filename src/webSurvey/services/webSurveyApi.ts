import { API_PREFIX } from "@/constants/apiConstants";
import type { FlowAnswers } from "@/domain/survey/flowNavigation";
import {
	classifyLoadResponse,
	classifySubmitResponse,
	type WebSurveyLoadResult,
	type WebSurveySubmitResult
} from "@/domain/survey/webSurveyPage";

/**
 * Aufrufe der öffentlichen Lambda `web_survey` (siehe `documentation/polly_web.md`). Gleicher Origin
 * wie die Seite über `API_PREFIX`; ohne Cookies und ohne Referrer, damit der Token nur im Request selbst steht.
 * Netzwerkfehler und Zeitüberschreitung ergeben `error`, die Seite bietet dann „Erneut versuchen“ an.
 */

/**
 * Länger als die Integration des API Gateway (30 s, Lambda selbst 20 s): Die Seite bricht nie ab, solange
 * das Backend noch antworten kann. Läuft es trotzdem in einen Fehler, obwohl gespeichert wurde, fängt die
 * `submissionId` die Wiederholung ab.
 */
const REQUEST_TIMEOUT_MS = 35_000;

async function requestJson(path: string, init: RequestInit): Promise<{ status: number; body: unknown } | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(`${API_PREFIX}${path}`, {
			...init,
			credentials: "omit",
			cache: "no-store",
			referrerPolicy: "no-referrer",
			signal: controller.signal
		});
		const body = await response.json().catch(() => null);
		return { status: response.status, body };
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function loadWebSurvey(token: string): Promise<WebSurveyLoadResult> {
	const result = await requestJson(`/web-survey?token=${encodeURIComponent(token)}`, {
		method: "GET",
		headers: { Accept: "application/json" }
	});
	return result ? classifyLoadResponse(result.status, result.body) : { kind: "error" };
}

export async function submitWebSurvey(
	token: string,
	surveyVersion: number,
	answers: FlowAnswers,
	submissionId: string
): Promise<WebSurveySubmitResult> {
	const result = await requestJson("/web-survey/submit", {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify({ token, surveyVersion, answers, submissionId })
	});
	return result ? classifySubmitResponse(result.status, result.body) : { kind: "error" };
}
