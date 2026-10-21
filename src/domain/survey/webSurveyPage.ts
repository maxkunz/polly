import { DEFAULT_SURVEY_LANGUAGE, NPS_SCALE_MAX, NPS_SCALE_MIN, SURVEY_LANGUAGES } from "./flowTypes";
import type { SurveyLanguage } from "./flowTypes";
import { getReachableQuestions, isFlowAnswers, pruneFlowAnswers } from "./flowNavigation";
import type { FlowAnswerError, FlowAnswerErrorCode, FlowAnswers } from "./flowNavigation";
import type { WebNpsQuestion, WebQuestion, WebRatingQuestion, WebSurvey } from "./webSurveyTypes";
import { sanitizeWebThemeTokens } from "../webTheme/webTheme";
import type { WebThemeTokens } from "../webTheme/webTheme";

/**
 * Reine Logik der öffentlichen Umfrageseite (`survey.html`, `src/webSurvey/`), siehe
 * `documentation/polly_web.md`: Token aus der URL lesen, Sprache wählen, Antworten der API
 * einordnen und prüfen, Folgefragen einrücken. Ohne Vue und DOM, getestet in `test/webSurveyPage.test.ts`.
 *
 * Aliasfrei, weil die Lambda `web_survey` die Token-Grenze von hier übernimmt.
 */

/** Pfad der Umfrageseite mit Token: `/s/<jwt>`. */
export const WEB_SURVEY_TOKEN_PATH_PREFIX = "/s/";

/** Größte akzeptierte Länge eines Tokens (Zeichen); echte Einladungen sind rund 300 Zeichen lang. */
export const WEB_SURVEY_MAX_TOKEN_CHARS = 2048;

/** Wartezeit vor dem einen automatischen Wiederholungsversuch nach `429`. */
export const WEB_SURVEY_THROTTLE_RETRY_DELAY_MS = 2000;

/**
 * Größte dargestellte Skala bei rating (Anzahl Werte). Der Editor erlaubt deutlich weniger; die Grenze
 * schützt nur vor einer in Genesys von Hand verfälschten Zeile mit riesigem Bereich.
 */
const MAX_SCALE_VALUES = 101;

/** Ein JWT besteht aus drei Base64url-Teilen, getrennt durch Punkte. */
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** `true`, wenn der Text wie ein JWT aufgebaut ist und die Längengrenze einhält (Signatur prüft das Backend). */
export function isPlausibleToken(value: string): boolean {
	return value.length <= WEB_SURVEY_MAX_TOKEN_CHARS && JWT_PATTERN.test(value);
}

function decodePathSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return "";
	}
}

/**
 * Token der Einladung aus `/s/<jwt>` oder `?token=<jwt>` (der Pfad hat Vorrang). Leer, wenn keiner
 * vorhanden ist oder der Text kein JWT sein kann: Dann zeigt die Seite „Einladung ist ungültig“,
 * ohne das Backend zu fragen.
 */
export function readInvitationToken(pathname: string, search: string): string {
	let token = "";
	if (pathname.startsWith(WEB_SURVEY_TOKEN_PATH_PREFIX)) {
		token = decodePathSegment(pathname.slice(WEB_SURVEY_TOKEN_PATH_PREFIX.length).replace(/\/+$/, ""));
	}
	if (!token) {
		token = new URLSearchParams(search).get("token") ?? "";
	}
	token = token.trim();
	return isPlausibleToken(token) ? token : "";
}

function isSurveyLanguage(value: unknown): value is SurveyLanguage {
	return (SURVEY_LANGUAGES as readonly unknown[]).includes(value);
}

/**
 * Sprache der Seite, solange noch keine Umfrage geladen ist (Laden, Fehlerseiten): erste unterstützte
 * Browsersprache (`de-AT` → `de`), sonst `de`.
 */
export function pickBrowserLanguage(languages: readonly string[]): SurveyLanguage {
	for (const language of languages) {
		const primary = String(language).toLowerCase().split("-")[0];
		if (isSurveyLanguage(primary)) return primary;
	}
	return DEFAULT_SURVEY_LANGUAGE;
}

// ---------------------------------------------------------------------------
// Antworten der API prüfen
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
	return value === null || typeof value === "string";
}

function hasConditions(question: Record<string, any>): boolean {
	return Array.isArray(question.conditional_next_question)
		&& question.conditional_next_question.every((condition: unknown) =>
			isRecord(condition)
			&& typeof condition.operator === "string"
			&& typeof condition.value === "number"
			&& isNullableString(condition.next_question_id));
}

function isOptionalString(value: unknown): boolean {
	return value === undefined || typeof value === "string";
}

function isWebQuestion(question: unknown): question is WebQuestion {
	if (!isRecord(question)) return false;
	if (typeof question.id !== "string" || !question.id) return false;
	if (typeof question.prompt !== "string" || typeof question.description !== "string") return false;
	if (typeof question.mandatory !== "boolean" || !isNullableString(question.default_next_question_id)) return false;

	switch (question.type) {
		case "comment":
			return true;
		case "yes_no":
			return isRecord(question.options)
				&& isNullableString(question.options.yes_next_question_id)
				&& isNullableString(question.options.no_next_question_id);
		case "choice":
			return Array.isArray(question.labels)
				&& question.labels.every((label: unknown) => typeof label === "string")
				&& Array.isArray(question.next_question_ids)
				&& question.next_question_ids.every(isNullableString);
		case "rating":
			return isRecord(question.options)
				&& Number.isInteger(question.options.min_value)
				&& Number.isInteger(question.options.max_value)
				&& question.options.min_value <= question.options.max_value
				&& question.options.max_value - question.options.min_value < MAX_SCALE_VALUES
				&& Array.isArray(question.options.values)
				&& isOptionalString(question.options.min_label)
				&& isOptionalString(question.options.max_label)
				&& hasConditions(question);
		case "nps":
			return (question.options === undefined
				|| (isRecord(question.options)
					&& isOptionalString(question.options.min_label)
					&& isOptionalString(question.options.max_label)))
				&& hasConditions(question);
		default:
			return false;
	}
}

/**
 * Prüft das bereinigte Flow-JSON aus `GET /web-survey` bzw. `409 survey_changed`, bevor die Seite es
 * darstellt. Die Lambda liefert es bereits geprüft; die Seite soll bei einer unerwarteten Antwort
 * trotzdem eine Fehlermeldung zeigen statt abzustürzen.
 */
export function isWebSurvey(value: unknown): value is WebSurvey {
	if (!isRecord(value)) return false;
	if (typeof value.id !== "string" || typeof value.title !== "string") return false;
	if (typeof value.greeting_prompt !== "string" || typeof value.closing_prompt !== "string") return false;
	if (!isSurveyLanguage(value.language) || !Number.isInteger(value.version)) return false;
	if (!isNullableString(value.start_question_id)) return false;
	if (!Array.isArray(value.questions) || value.questions.length === 0) return false;
	return value.questions.every(isWebQuestion);
}

/** Zustände nach einer Einladungs- oder Verfügbarkeitsprüfung, die die Seite als eigene Meldung zeigt. */
export type WebSurveyBlockingStatus = "invalid" | "expired" | "used" | "unavailable";

const BLOCKING_STATUSES: readonly string[] = ["invalid", "expired", "used", "unavailable"];

function isBlockingStatus(value: unknown): value is WebSurveyBlockingStatus {
	return BLOCKING_STATUSES.includes(value as string);
}

/**
 * `theme` = bereinigtes Design aus der Antwort; fehlt, wenn die Antwort keines oder ein ungültiges
 * enthält (dann gilt das eingebaute Design, das ist kein Fehler).
 * `preview` = Webvorschau des Stage-Stands: Antworten werden beim Absenden nicht gespeichert.
 */
export type WebSurveyLoadResult =
	| { kind: "ok"; survey: WebSurvey; theme?: WebThemeTokens; preview: boolean }
	| { kind: WebSurveyBlockingStatus; theme?: WebThemeTokens }
	| { kind: "throttled" }
	| { kind: "error" };

export type WebSurveySubmitResult =
	| { kind: "ok" }
	| { kind: WebSurveyBlockingStatus; theme?: WebThemeTokens }
	| { kind: "throttled" }
	| { kind: "error" }
	/** `survey` = neue Fassung aus der Antwort; `null`, wenn sie fehlt oder unbrauchbar ist (dann neu laden). */
	| { kind: "survey_changed"; survey: WebSurvey | null; theme?: WebThemeTokens }
	| { kind: "invalid_answers"; errors: FlowAnswerError[] };

/** `{ theme }` nur bei gültigem Design, damit die Ergebnisse ohne Design kein leeres Feld tragen. */
function themeOf(record: Record<string, unknown>): { theme?: WebThemeTokens } {
	if (record.theme === undefined) return {};
	const theme = sanitizeWebThemeTokens(record.theme);
	return theme ? { theme } : {};
}

/**
 * Ordnet die Antwort von `GET /web-survey` ein. `429` gilt immer als Drosselung: API Gateway liefert
 * dann einen Body ohne `status`.
 */
export function classifyLoadResponse(httpStatus: number, body: unknown): WebSurveyLoadResult {
	if (httpStatus === 429) return { kind: "throttled" };
	const record = isRecord(body) ? body : {};
	const status = record.status;
	if (httpStatus === 200 && status === "ok") {
		return isWebSurvey(record.survey)
			? { kind: "ok", survey: record.survey, ...themeOf(record), preview: record.preview === true }
			: { kind: "error" };
	}
	if (isBlockingStatus(status)) return { kind: status, ...themeOf(record) };
	if (status === "throttled") return { kind: "throttled" };
	return { kind: "error" };
}

const ANSWER_ERROR_CODES: readonly FlowAnswerErrorCode[] = [
	"required",
	"invalid_value",
	"not_reachable",
	"unknown_question",
	"invalid_answers"
];

function toAnswerErrors(value: unknown): FlowAnswerError[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((error): error is FlowAnswerError => isRecord(error)
			&& isNullableString(error.questionId)
			&& ANSWER_ERROR_CODES.includes(error.code))
		.map(error => ({ questionId: error.questionId, code: error.code }));
}

/** Ordnet die Antwort von `POST /web-survey/submit` ein (Statuscodes siehe `polly_web.md`). */
export function classifySubmitResponse(httpStatus: number, body: unknown): WebSurveySubmitResult {
	if (httpStatus === 429) return { kind: "throttled" };
	const record = isRecord(body) ? body : {};
	const status = record.status;
	if (httpStatus === 200 && status === "ok") return { kind: "ok" };
	if (isBlockingStatus(status)) return { kind: status, ...themeOf(record) };
	if (status === "survey_changed") {
		return { kind: "survey_changed", survey: isWebSurvey(record.survey) ? record.survey : null, ...themeOf(record) };
	}
	if (status === "invalid_answers") return { kind: "invalid_answers", errors: toAnswerErrors(record.errors) };
	if (status === "throttled") return { kind: "throttled" };
	// invalid_request, payload_too_large, error, 5xx und unbekannte Antworten
	return { kind: "error" };
}

/**
 * ID einer Absendung (UUID v4): einmal pro Seitenaufruf erzeugt und bei jeder Wiederholung mitgeschickt,
 * damit die Lambda eine schon gespeicherte Absendung erkennt (Idempotenz, siehe `documentation/polly_web.md`).
 * Über `getRandomValues`, weil `crypto.randomUUID` in älteren Browsern fehlt.
 */
export function createSubmissionId(random: Pick<Crypto, "getRandomValues"> = globalThis.crypto): string {
	const bytes = random.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Führt `request` aus und wiederholt es bei Drosselung genau einmal nach `delayMs`
 * (Entscheidung 13: danach Meldung mit „Erneut versuchen“).
 */
export async function retryOnceWhenThrottled<T extends { kind: string }>(
	request: () => Promise<T>,
	wait: (ms: number) => Promise<void>,
	delayMs = WEB_SURVEY_THROTTLE_RETRY_DELAY_MS
): Promise<T> {
	const first = await request();
	if (first.kind !== "throttled") return first;
	await wait(delayMs);
	return request();
}

// ---------------------------------------------------------------------------
// Formular
// ---------------------------------------------------------------------------

/** Antworten mit Kommentaren ohne Leerzeichen am Rand (so werden sie geprüft und gesendet). */
export function trimAnswers(answers: FlowAnswers): FlowAnswers {
	const trimmed: FlowAnswers = {};
	if (!isFlowAnswers(answers)) return trimmed;
	for (const [questionId, value] of Object.entries(answers)) {
		trimmed[questionId] = typeof value === "string" ? value.trim() : value;
	}
	return trimmed;
}

/**
 * Antworten zum Absenden: getrimmt, danach nur beantwortete, gültige Antworten auf erreichbare
 * Fragen (`pruneFlowAnswers`, gleiche Regel wie im Backend).
 */
export function answersForSubmit(survey: WebSurvey, answers: FlowAnswers): FlowAnswers {
	return pruneFlowAnswers(survey, trimAnswers(answers));
}

/** IDs der Fragen, deren Antwort verworfen wird, weil sie nicht mehr erreichbar sind (weggefallene Folgefragen). */
export function unreachableAnswerIds(survey: WebSurvey, answers: FlowAnswers): string[] {
	const reachable = new Set(getReachableQuestions(survey, answers).map(question => question.id));
	return Object.keys(answers).filter(questionId => !reachable.has(questionId));
}

/**
 * Einrücktiefe der erreichbaren Fragen: Hauptfragen (Kette über `default_next_question_id` ab der
 * Startfrage) 0, Folgefragen eine Stufe tiefer als die Frage davor. Die Navigation reiht Folgefragen
 * direkt hinter ihre Elternfrage; Verschachtelungen ergeben so mehrere Stufen.
 */
export function questionDepths(survey: WebSurvey, reachable: readonly WebQuestion[]): Map<string, number> {
	const byId = new Map(survey.questions.map(question => [question.id, question]));
	const mainIds = new Set<string>();
	let currentId = survey.start_question_id;
	while (currentId !== null && !mainIds.has(currentId)) {
		const question = byId.get(currentId);
		if (!question) break;
		mainIds.add(currentId);
		currentId = question.default_next_question_id;
	}

	const depths = new Map<string, number>();
	let previousDepth = 0;
	for (const question of reachable) {
		const depth = mainIds.has(question.id) ? 0 : previousDepth + 1;
		depths.set(question.id, depth);
		previousDepth = depth;
	}
	return depths;
}

/**
 * Auswählbare Werte einer Skala: bei rating die Werte aus `options.values` im Bereich min..max
 * (aufsteigend, ohne Doppelte), fehlen sie, der ganze Bereich; bei nps immer 0..10.
 */
export function scaleValues(question: WebRatingQuestion | WebNpsQuestion): number[] {
	const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => min + index);
	if (question.type === "nps") return range(NPS_SCALE_MIN, NPS_SCALE_MAX);

	const { min_value: min, max_value: max } = question.options;
	const values = [...new Set(question.options.values)]
		.filter(value => Number.isInteger(value) && value >= min && value <= max)
		.sort((a, b) => a - b);
	return values.length > 0 ? values : range(min, max);
}
