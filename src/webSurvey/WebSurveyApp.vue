<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { getReachableQuestions, pruneFlowAnswers, validateFlowAnswers } from "@/domain/survey/flowNavigation";
import type { FlowAnswerError, FlowAnswers } from "@/domain/survey/flowNavigation";
import type { WebQuestion as WebQuestionModel, WebSurvey } from "@/domain/survey/webSurveyTypes";
import {
	answersForSubmit,
	createSubmissionId,
	questionDepths,
	readInvitationToken,
	retryOnceWhenThrottled,
	trimAnswers,
	unreachableAnswerIds,
	type WebSurveyBlockingStatus,
	type WebSurveySubmitResult
} from "@/domain/survey/webSurveyPage";
import type { SurveyLanguage } from "@/domain/survey/flowTypes";
import WebQuestion from "./components/WebQuestion.vue";
import { loadWebSurvey, submitWebSurvey } from "./services/webSurveyApi";
import { applyTheme } from "./applyTheme";
import { previewAnswers, previewSurvey } from "./previewSurvey";
import { setLanguage, t } from "./i18n";

/**
 * Öffentliche Umfrageseite (Einstieg `survey.html`, Spezifikation `documentation/polly_web.md`).
 * Zustände: loading → invalid | expired | used | unavailable | form → (Absenden) → done | error.
 * `throttled`/`error` beim Laden zeigen „Erneut versuchen“; Fehler beim Absenden erscheinen als
 * Hinweis über dem Formular, die Antworten bleiben erhalten.
 *
 * Das Design des Mandanten (`theme` der Antwort) setzt `applyTheme` beim Laden und bei
 * `survey_changed`. Mit `previewLanguage` (Design-Vorschau der App) zeigt die Seite stattdessen die
 * Beispielumfrage samt Fehlern und Hinweis; Absenden ist dann ohne Wirkung.
 *
 * Webvorschau (`preview` in der Antwort, Link aus der Deployment-Ansicht): zeigt den Stage-Stand mit
 * Hinweisbalken; das Absenden läuft normal, das Backend speichert aber nichts.
 */

const props = defineProps<{ previewLanguage?: SurveyLanguage | null }>();

type StatusPhase = WebSurveyBlockingStatus | "throttled" | "error";
type Phase = "loading" | "form" | "done" | StatusPhase;
type Notice = "surveyChanged" | "throttled" | "error";

const token = readInvitationToken(window.location.pathname, window.location.search);
/** Gleich für alle Absendeversuche dieses Seitenaufrufs: Eine Wiederholung nach Fehler speichert nicht doppelt. */
const submissionId = createSubmissionId();

const phase = ref<Phase>("loading");
const survey = shallowRef<WebSurvey | null>(null);
const answers = ref<FlowAnswers>({});
const submitting = ref(false);
const notice = ref<Notice | null>(null);
/** Webvorschau des Stage-Stands (vom Backend gemeldet): Hinweis im Formular und auf der Endseite. */
const isStagePreview = ref(false);
/** Fehler am Feld erst nach dem ersten Absenden zeigen, danach live aktualisieren. */
const showErrors = ref(false);
/** Fehler aus `400 invalid_answers`; gelten bis zur nächsten Änderung. */
const serverErrors = ref<FlowAnswerError[]>([]);
/** Text der unsichtbaren Live-Region (eingeblendete Folgefragen, Senden). */
const liveMessage = ref("");

const pageHeading = ref<HTMLElement | null>(null);
const errorSummary = ref<HTMLElement | null>(null);
const noticeBox = ref<HTMLElement | null>(null);

const statusPhase = computed<StatusPhase | null>(() =>
	phase.value === "loading" || phase.value === "form" || phase.value === "done" ? null : phase.value);

const reachable = computed<WebQuestionModel[]>(() =>
	survey.value ? getReachableQuestions(survey.value, answers.value) : []);

const depths = computed(() => (survey.value ? questionDepths(survey.value, reachable.value) : new Map<string, number>()));

/** DOM-IDs über die Position in der Umfrage: Frage-IDs stammen aus der Data Table und sind nicht als ID geprüft. */
const domIds = computed(() => new Map((survey.value?.questions ?? []).map((question, index) => [question.id, `q-${index}`])));

const clientErrors = computed<FlowAnswerError[]>(() =>
	survey.value ? validateFlowAnswers(survey.value, trimAnswers(answers.value)) : []);

const visibleErrors = computed<FlowAnswerError[]>(() => {
	if (!showErrors.value) return [];
	const seen = new Set(clientErrors.value.map(error => `${error.questionId}:${error.code}`));
	return [...clientErrors.value, ...serverErrors.value.filter(error => !seen.has(`${error.questionId}:${error.code}`))];
});

function errorMessage(error: FlowAnswerError): string {
	if (error.code === "required") return t("errorSummary.required");
	if (error.code === "invalid_value") return t("errorSummary.invalid_value");
	return t("errorSummary.general");
}

const fieldErrors = computed(() => {
	const reachableIds = new Set(reachable.value.map(question => question.id));
	const byQuestion = new Map<string, string>();
	for (const error of visibleErrors.value) {
		if (error.questionId && reachableIds.has(error.questionId) && !byQuestion.has(error.questionId)) {
			byQuestion.set(error.questionId, errorMessage(error));
		}
	}
	return byQuestion;
});

interface SummaryItem {
	key: string;
	text: string;
	questionId: string | null;
}

const summaryItems = computed<SummaryItem[]>(() => {
	const items: SummaryItem[] = reachable.value
		.filter(question => fieldErrors.value.has(question.id))
		.map(question => ({
			key: question.id,
			text: `${question.prompt}: ${fieldErrors.value.get(question.id)}`,
			questionId: question.id
		}));
	// Fehler ohne sichtbares Feld (nicht erreichbar, unbekannt) nur einmal allgemein
	const hasGeneral = visibleErrors.value.some(error => !error.questionId || !fieldErrors.value.has(error.questionId));
	if (hasGeneral) items.push({ key: "general", text: t("errorSummary.general"), questionId: null });
	return items;
});

function wait(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function focusElement(target: () => HTMLElement | null): Promise<void> {
	await nextTick();
	target()?.focus();
}

function updateTitle(): void {
	const status = statusPhase.value;
	if (status) document.title = t(`status.${status}.title`);
	else if (phase.value === "done") document.title = t("done.title");
	else document.title = survey.value?.title.trim() || t("pageTitle");
}

watch([phase, survey], updateTitle);

function applySurvey(next: WebSurvey, carriedAnswers: FlowAnswers): void {
	setLanguage(next.language);
	survey.value = next;
	answers.value = pruneFlowAnswers(next, carriedAnswers);
	phase.value = "form";
	updateTitle();
}

async function load(moveFocus: boolean): Promise<void> {
	phase.value = "loading";
	if (!token) {
		phase.value = "invalid";
	} else {
		const result = await retryOnceWhenThrottled(() => loadWebSurvey(token), wait);
		// Bei throttled/error bleibt das bisherige Design (Wiederholung über „Erneut versuchen“)
		if (result.kind !== "throttled" && result.kind !== "error") applyTheme(result.theme);
		if (result.kind === "ok") {
			isStagePreview.value = result.preview;
			applySurvey(result.survey, {});
		}
		else phase.value = result.kind;
	}
	if (moveFocus) await focusElement(() => pageHeading.value);
}

/** Erst leeren, dann setzen: Screenreader sagen auch einen unveränderten Text erneut an. */
function announce(message: string): void {
	liveMessage.value = "";
	void nextTick(() => {
		liveMessage.value = message;
	});
}

function setAnswer(questionId: string, value: unknown): void {
	if (!survey.value) return;
	const next: FlowAnswers = { ...answers.value, [questionId]: value };
	// Antworten weggefallener Folgefragen verwerfen
	for (const id of unreachableAnswerIds(survey.value, next)) delete next[id];
	answers.value = next;
	serverErrors.value = [];
}

// Neu eingeblendete Folgefragen ansagen (aria-live="polite")
watch(reachable, (current, previous) => {
	if (!previous || phase.value !== "form") return;
	const before = new Set(previous.map(question => question.id));
	const added = current.filter(question => !before.has(question.id) && (depths.value.get(question.id) ?? 0) > 0);
	if (added.length > 0) announce(added.map(question => t("followUpShown", { prompt: question.prompt })).join(" "));
});

async function handleSubmitResult(result: WebSurveySubmitResult): Promise<void> {
	notice.value = null;
	switch (result.kind) {
		case "ok":
			phase.value = "done";
			await focusElement(() => pageHeading.value);
			return;
		case "invalid":
		case "expired":
		case "used":
		case "unavailable":
			phase.value = result.kind;
			await focusElement(() => pageHeading.value);
			return;
		case "survey_changed": {
			// Neue Fassung übernehmen (fehlt sie in der Antwort, neu laden); passende Antworten bleiben
			let next = result.survey;
			let theme = result.theme;
			if (!next) {
				const reloaded = await retryOnceWhenThrottled(() => loadWebSurvey(token), wait);
				if (reloaded.kind !== "ok") {
					if (reloaded.kind === "throttled" || reloaded.kind === "error") {
						notice.value = reloaded.kind;
						await focusElement(() => noticeBox.value);
					} else {
						phase.value = reloaded.kind;
						await focusElement(() => pageHeading.value);
					}
					return;
				}
				next = reloaded.survey;
				theme = reloaded.theme;
			}
			// Die neue Fassung kann ein anderes Design gewählt haben. Fehlt das Design in der Antwort (z. B.
			// Designs im Backend gerade nicht lesbar), bleibt das bisherige stehen statt auf Polly zurückzuspringen.
			if (theme) applyTheme(theme);
			applySurvey(next, answers.value);
			showErrors.value = false;
			notice.value = "surveyChanged";
			await focusElement(() => noticeBox.value);
			return;
		}
		case "invalid_answers":
			serverErrors.value = result.errors.length > 0 ? result.errors : [{ questionId: null, code: "invalid_answers" }];
			showErrors.value = true;
			await focusElement(() => errorSummary.value);
			return;
		case "throttled":
		case "error":
			notice.value = result.kind;
			await focusElement(() => noticeBox.value);
			return;
	}
}

async function submit(): Promise<void> {
	const current = survey.value;
	if (!current || submitting.value) return;

	// Ein offener Hinweis bleibt bis zum Ergebnis stehen, damit der Fokus auf „Erneut versuchen“ nicht verloren geht
	serverErrors.value = [];
	showErrors.value = true;
	if (props.previewLanguage) return;
	if (clientErrors.value.length > 0) {
		notice.value = null;
		await focusElement(() => errorSummary.value);
		return;
	}

	submitting.value = true;
	announce(t("submitting"));
	try {
		const payload = answersForSubmit(current, answers.value);
		const result = await retryOnceWhenThrottled(() => submitWebSurvey(token, current.version, payload, submissionId), wait);
		await handleSubmitResult(result);
	} finally {
		submitting.value = false;
		liveMessage.value = "";
	}
}

/** Link der Fehlerübersicht: Fokus auf das (gewählte oder erste) Eingabeelement der Frage. */
function focusQuestion(questionId: string): void {
	const container = document.getElementById(domIds.value.get(questionId) ?? "");
	const input = container?.querySelector<HTMLElement>("input:checked") ?? container?.querySelector<HTMLElement>("input, textarea");
	(input ?? container)?.focus();
}

const doneText = computed(() => survey.value?.closing_prompt.trim() || (isStagePreview.value ? "" : t("done.fallback")));

const noticeText = computed(() => {
	if (notice.value === "surveyChanged") return t("notice.surveyChanged");
	if (notice.value === "throttled") return t("notice.throttled");
	if (notice.value === "error") return t("notice.error");
	return "";
});

if (props.previewLanguage) {
	applySurvey(previewSurvey(props.previewLanguage), previewAnswers(props.previewLanguage));
	showErrors.value = true;
	notice.value = "error";
} else {
	void load(false);
}
</script>

<template>
	<main class="web-page">
		<p v-if="phase === 'loading'" role="status" class="web-loading">{{ t("loading") }}</p>

		<section v-else-if="statusPhase" class="web-card flex flex-col gap-4" aria-labelledby="page-heading">
			<h1 id="page-heading" ref="pageHeading" tabindex="-1" class="web-heading">{{ t(`status.${statusPhase}.title`) }}</h1>
			<p role="alert" class="web-intro">{{ t(`status.${statusPhase}.text`) }}</p>
			<div v-if="statusPhase === 'throttled' || statusPhase === 'error'">
				<button type="button" class="web-button" @click="load(true)">{{ t("retry") }}</button>
			</div>
		</section>

		<section v-else-if="phase === 'done'" class="web-card flex flex-col gap-4" aria-labelledby="page-heading">
			<h1 id="page-heading" ref="pageHeading" tabindex="-1" class="web-heading">{{ t("done.title") }}</h1>
			<!-- In der Vorschau passt der Standardtext „gespeichert“ nicht, dort steht nur die Verabschiedung -->
			<p v-if="doneText" class="web-intro whitespace-pre-line">{{ doneText }}</p>
			<p v-if="isStagePreview" role="status" class="web-preview-banner web-hint">{{ t("stagePreview.notSaved") }}</p>
		</section>

		<template v-else-if="phase === 'form' && survey">
			<p v-if="isStagePreview" class="web-preview-banner web-hint">{{ t("stagePreview.banner") }}</p>
			<header class="flex flex-col gap-3">
				<h1 id="page-heading" ref="pageHeading" tabindex="-1" class="web-heading">{{ survey.title }}</h1>
				<p v-if="survey.greeting_prompt.trim()" class="web-intro whitespace-pre-line">{{ survey.greeting_prompt }}</p>
				<p class="web-hint">{{ t("requiredHint") }}</p>
			</header>

			<div v-if="notice" ref="noticeBox" tabindex="-1" role="alert" class="web-notice">
				<p class="web-intro">{{ noticeText }}</p>
				<div v-if="notice !== 'surveyChanged'">
					<button type="button" class="web-button web-button--secondary" :aria-disabled="submitting ? 'true' : undefined" @click="submit">
						{{ t("retry") }}
					</button>
				</div>
			</div>

			<div
				v-if="summaryItems.length > 0"
				ref="errorSummary"
				tabindex="-1"
				class="web-error-summary"
				aria-labelledby="error-summary-heading"
			>
				<h2 id="error-summary-heading" class="web-subheading">{{ t("errorSummary.title", { count: summaryItems.length }) }}</h2>
				<ul class="list-disc pl-5">
					<li v-for="item in summaryItems" :key="item.key">
						<a
							v-if="item.questionId"
							:href="`#${domIds.get(item.questionId)}`"
							class="web-link"
							@click.prevent="focusQuestion(item.questionId)"
						>{{ item.text }}</a>
						<span v-else>{{ item.text }}</span>
					</li>
				</ul>
			</div>

			<form class="flex flex-col gap-4" novalidate :aria-busy="submitting ? 'true' : undefined" @submit.prevent="submit">
				<WebQuestion
					v-for="question in reachable"
					:key="question.id"
					:question="question"
					:model-value="answers[question.id]"
					:dom-id="domIds.get(question.id) ?? question.id"
					:depth="depths.get(question.id) ?? 0"
					:error="fieldErrors.get(question.id) ?? null"
					@update:model-value="setAnswer(question.id, $event)"
				/>
				<div>
					<button type="submit" class="web-button" :aria-disabled="submitting ? 'true' : undefined">
						{{ submitting ? t("submitting") : t("submit") }}
					</button>
				</div>
			</form>
		</template>

		<div class="sr-only" aria-live="polite">{{ liveMessage }}</div>
	</main>
</template>
