<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import DatePicker from "primevue/datepicker";
import Message from "primevue/message";
import ProgressBar from "primevue/progressbar";
import Select from "primevue/select";
import Tooltip from "primevue/tooltip";
import type { Survey } from "@/domain/survey/surveyTypes";
import { MissingTokenError } from "@/services/pollyApi";
import {
	exportReportCsv,
	loadReportSummary,
	type ExportProgress,
	type ReportSummary
} from "@/services/surveyReportService";
import { downloadBlob } from "@/utils/download";
import { useAppStore } from "@/stores/appStore";

const props = defineProps<{
	survey: Survey;
	surveyId: string;
}>();

const emit = defineEmits<{
	(e: "back"): void;
}>();

const { t } = useI18n();
const vTooltip = Tooltip;
const app = useAppStore();

const SUMMARY_DEBOUNCE_MS = 400;
const LIVE_REFRESH_MS = 60_000;
const DEFAULT_RANGE_DAYS = 30;

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function daysAgo(days: number): Date {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date;
}

const fromDate = ref<Date | null>(startOfDay(daysAgo(DEFAULT_RANGE_DAYS - 1)));
const toDate = ref<Date | null>(endOfDay(new Date()));
const selectedVersion = ref<number | null>(null);

const summary = ref<ReportSummary | null>(null);
/** Erhöht sich bei jeder Live-Aktualisierung mit tatsächlich geänderten Werten; über :key an der
 *  Vorschau löst das einen kurzen Puls aus (siehe <style> unten). */
const summaryPulseKey = ref<number>(0);
const isLoadingSummary = ref<boolean>(false);
const isLiveRefreshing = ref<boolean>(false);
const isDownloading = ref<boolean>(false);
const downloadProgress = ref<ExportProgress | null>(null);
const errorMessage = ref<string>("");

let summaryAbort: AbortController | null = null;
let downloadAbort: AbortController | null = null;
let summaryTimer: ReturnType<typeof setTimeout> | null = null;
let liveRefreshTimer: ReturnType<typeof setInterval> | null = null;

const isRangeValid = computed(
	() => !!fromDate.value && !!toDate.value && startOfDay(fromDate.value) <= endOfDay(toDate.value)
);

const quickRanges = computed(() => [
	{
		key: "today",
		label: t("report.quickRanges.today"),
		range: () => [startOfDay(new Date()), endOfDay(new Date())] as const
	},
	{
		key: "last7Days",
		label: t("report.quickRanges.last7Days"),
		range: () => [startOfDay(daysAgo(6)), endOfDay(new Date())] as const
	},
	{
		key: "last30Days",
		label: t("report.quickRanges.last30Days"),
		range: () => [startOfDay(daysAgo(29)), endOfDay(new Date())] as const
	},
	{
		key: "currentMonth",
		label: t("report.quickRanges.currentMonth"),
		range: () => {
			const now = new Date();
			return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)] as const;
		}
	},
	{
		key: "lastMonth",
		label: t("report.quickRanges.lastMonth"),
		range: () => {
			const now = new Date();
			return [
				new Date(now.getFullYear(), now.getMonth() - 1, 1),
				endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
			] as const;
		}
	}
]);

function applyQuickRange(range: () => readonly [Date, Date]): void {
	const [from, to] = range();
	fromDate.value = from;
	toDate.value = to;
}

/** Platzhalterwert für „Alle Versionen“ im Dropdown: PrimeVue-Select zeigt bei `null` keinen Text an. */
const ALL_VERSIONS = "all" as const;

/** Bindung des Dropdowns; intern bleibt `selectedVersion` bei `null` für „alle Versionen“. */
const versionSelectValue = computed<number | typeof ALL_VERSIONS>({
	get: () => selectedVersion.value ?? ALL_VERSIONS,
	set: value => {
		selectedVersion.value = value === ALL_VERSIONS ? null : value;
	}
});

const versionOptions = computed(() => {
	const versions = Object.entries(summary.value?.versions ?? {})
		.map(([version, sessions]) => ({ version: Number(version), sessions }))
		.sort((a, b) => b.version - a.version);
	return [
		{ label: t("report.allVersions"), value: ALL_VERSIONS as number | typeof ALL_VERSIONS },
		...versions.map(entry => ({
			label: t("report.versionOption", { version: entry.version, sessions: entry.sessions }),
			value: entry.version as number | typeof ALL_VERSIONS
		}))
	];
});

/** Anzahl der zu ladenden Sitzungen (für den Fortschrittsbalken), abhängig vom Versionsfilter. */
const expectedSessions = computed(() => {
	if (!summary.value) return 0;
	if (selectedVersion.value === null) return summary.value.sessions;
	return summary.value.versions[String(selectedVersion.value)] ?? 0;
});

const progressPercent = computed(() => {
	if (!downloadProgress.value || expectedSessions.value <= 0) return 0;
	return Math.min(100, Math.round((downloadProgress.value.sessions / expectedSessions.value) * 100));
});

const canDownload = computed(
	() =>
		app.canExport &&
		isRangeValid.value &&
		!isLoadingSummary.value &&
		!isDownloading.value &&
		!!summary.value &&
		summary.value.sessions > 0
);

function formatDateParam(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof MissingTokenError) return t("report.errors.missingToken");
	if (error instanceof Error && error.message) return `${t("report.errors.generic")}: ${error.message}`;
	return t("report.errors.generic");
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

function recordsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
	const keysA = Object.keys(a);
	if (keysA.length !== Object.keys(b).length) return false;
	return keysA.every(key => a[key] === b[key]);
}

/** Inhaltlicher Vergleich, unabhängig von der Einfüge-Reihenfolge der statusCounts/versions-Keys
 *  (die kann sich zwischen zwei Abfragen unterscheiden, auch wenn sich die Werte nicht geändert haben,
 *  weil die Backend-Zeitabschnitte parallel statt in fester Reihenfolge abgefragt werden). */
function summariesEqual(a: ReportSummary | null, b: ReportSummary): boolean {
	if (!a) return false;
	return a.sessions === b.sessions && recordsEqual(a.statusCounts, b.statusCounts) && recordsEqual(a.versions, b.versions);
}

function currentRange() {
	return {
		surveyId: props.surveyId,
		from: startOfDay(fromDate.value!).toISOString(),
		to: endOfDay(toDate.value!).toISOString()
	};
}

async function refreshSummary(): Promise<void> {
	summaryAbort?.abort();
	summary.value = null;
	errorMessage.value = "";

	if (!isRangeValid.value) {
		isLoadingSummary.value = false;
		return;
	}

	const controller = new AbortController();
	summaryAbort = controller;
	isLoadingSummary.value = true;
	try {
		const result = await loadReportSummary(currentRange(), {
			signal: controller.signal,
			onProgress: partial => {
				if (summaryAbort === controller) summary.value = partial;
			}
		});
		if (summaryAbort !== controller) return;
		summary.value = result;
		// Eine Version, die im neuen Zeitraum nicht mehr vorkommt, zurücksetzen.
		if (selectedVersion.value !== null && !(String(selectedVersion.value) in result.versions)) {
			selectedVersion.value = null;
		}
	} catch (error) {
		if (isAbortError(error) || summaryAbort !== controller) return;
		errorMessage.value = toErrorMessage(error);
	} finally {
		if (summaryAbort === controller) isLoadingSummary.value = false;
	}
}

/**
 * Live-Aktualisierung: holt im Hintergrund die aktuellen Zahlen, ohne die Anzeige kurz zu leeren
 * oder den großen Lade-Spinner zu zeigen (das bliebe sonst bei jedem Tick sichtbar). Pausiert,
 * solange ein manueller Ladevorgang oder ein Download läuft – Letzterer liest `summary.versions`
 * für den Fortschrittsbalken, ein Zwischenstand würde ihn verfälschen – und während der Tab im
 * Hintergrund ist, um nicht unnötig DynamoDB-Lesekapazität zu verbrauchen.
 */
async function refreshSummaryLive(): Promise<void> {
	// isLiveRefreshing schützt zusätzlich gegen zwei überlappende Ticks, falls ein Aufruf bei sehr
	// großen Zeiträumen einmal länger als LIVE_REFRESH_MS dauern sollte.
	if (!isRangeValid.value || isLoadingSummary.value || isDownloading.value || isLiveRefreshing.value) return;
	if (typeof document !== "undefined" && document.hidden) return;

	const controller = new AbortController();
	summaryAbort = controller;
	isLiveRefreshing.value = true;
	try {
		const result = await loadReportSummary(currentRange(), { signal: controller.signal });
		if (summaryAbort !== controller) return;
		if (!summariesEqual(summary.value, result)) summaryPulseKey.value++;
		summary.value = result;
		if (selectedVersion.value !== null && !(String(selectedVersion.value) in result.versions)) {
			selectedVersion.value = null;
		}
	} catch (error) {
		// Fehler bei der automatischen Aktualisierung nicht anzeigen – das würde die Meldung eines
		// vorherigen manuellen Ladevorgangs überschreiben. Beim nächsten Tick wird es erneut versucht.
		if (!isAbortError(error)) console.warn("[report] Live-Aktualisierung fehlgeschlagen", error);
	} finally {
		if (summaryAbort === controller) summaryAbort = null;
		isLiveRefreshing.value = false;
	}
}

function scheduleSummary(): void {
	if (summaryTimer) clearTimeout(summaryTimer);
	// Ladezustand sofort anzeigen, damit der Download nicht auf veralteten Zahlen aktiv bleibt.
	summaryAbort?.abort();
	summary.value = null;
	isLoadingSummary.value = isRangeValid.value;
	summaryTimer = setTimeout(refreshSummary, SUMMARY_DEBOUNCE_MS);
}

async function handleDownload(): Promise<void> {
	if (!canDownload.value) return;
	const controller = new AbortController();
	downloadAbort = controller;
	isDownloading.value = true;
	downloadProgress.value = { sessions: 0, rows: 0 };
	errorMessage.value = "";

	try {
		const range = currentRange();
		const blob = await exportReportCsv(range, {
			signal: controller.signal,
			version: selectedVersion.value,
			onProgress: progress => {
				downloadProgress.value = progress;
			}
		});
		const versionSuffix = selectedVersion.value !== null ? `_v${selectedVersion.value}` : "";
		const filename = `${props.survey.name}_${formatDateParam(fromDate.value!)}_${formatDateParam(toDate.value!)}${versionSuffix}.csv`;
		downloadBlob(blob, filename);
	} catch (error) {
		if (!isAbortError(error)) errorMessage.value = toErrorMessage(error);
	} finally {
		isDownloading.value = false;
		downloadProgress.value = null;
		downloadAbort = null;
	}
}

function handleCancelDownload(): void {
	downloadAbort?.abort();
}

watch([fromDate, toDate], scheduleSummary);

onMounted(() => {
	refreshSummary();
	liveRefreshTimer = setInterval(refreshSummaryLive, LIVE_REFRESH_MS);
});

onBeforeUnmount(() => {
	if (summaryTimer) clearTimeout(summaryTimer);
	if (liveRefreshTimer) clearInterval(liveRefreshTimer);
	summaryAbort?.abort();
	downloadAbort?.abort();
});
</script>

<template>
	<div class="space-y-6">
		<!-- Header -->
		<div class="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[var(--p-content-border-color)]">
			<div class="flex items-center gap-3">
				<Button
					size="small"
					severity="secondary"
					variant="text"
					icon="pi pi-arrow-left"
					:label="t('report.back')"
					:aria-label="t('report.backAriaLabel')"
					@click="emit('back')"
				/>
				<h2 class="text-base font-semibold text-[var(--p-text-color)]">
					{{ survey.title || survey.name }}
					<span class="text-[var(--p-text-muted-color)] font-normal">(v{{ survey.version ?? 1 }})</span>
				</h2>
			</div>
		</div>

		<Message v-if="errorMessage" severity="error" :closable="false">
			{{ errorMessage }}
		</Message>
		<Message v-else-if="!isRangeValid" severity="warn" :closable="false">
			{{ t("report.errors.invalidRange") }}
		</Message>

		<!-- Zeitraum -->
		<div class="space-y-3">
			<div class="flex flex-wrap items-end gap-4">
				<div class="flex flex-col gap-1">
					<label for="report-from" class="text-sm text-[var(--p-text-muted-color)]">{{ t("report.from") }}</label>
					<DatePicker
						v-model="fromDate"
						inputId="report-from"
						showIcon
						showButtonBar
						:maxDate="toDate ?? undefined"
						:disabled="isDownloading"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label for="report-to" class="text-sm text-[var(--p-text-muted-color)]">{{ t("report.to") }}</label>
					<DatePicker
						v-model="toDate"
						inputId="report-to"
						showIcon
						showButtonBar
						:minDate="fromDate ?? undefined"
						:disabled="isDownloading"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label for="report-version" class="text-sm text-[var(--p-text-muted-color)]">{{ t("report.version") }}</label>
					<Select
						v-model="versionSelectValue"
						inputId="report-version"
						:options="versionOptions"
						optionLabel="label"
						optionValue="value"
						:disabled="isDownloading || !summary || Object.keys(summary.versions).length === 0"
					/>
				</div>
			</div>

			<div class="flex flex-wrap gap-2">
				<Button
					v-for="quick in quickRanges"
					:key="quick.key"
					size="small"
					severity="secondary"
					variant="outlined"
					:label="quick.label"
					:disabled="isDownloading"
					@click="applyQuickRange(quick.range)"
				/>
			</div>
			<p class="text-xs text-[var(--p-text-muted-color)]">{{ t("report.hint") }}</p>
		</div>

		<!-- Vorschau -->
		<div class="space-y-2">
			<h3 class="text-sm font-semibold text-[var(--p-text-color)] flex items-center gap-2">
				{{ t("report.summary.title") }}
				<i
					v-if="isLiveRefreshing"
					class="pi pi-sync pi-spin text-xs text-[var(--p-text-muted-color)]"
					:title="t('report.summary.liveUpdating')"
					:aria-label="t('report.summary.liveUpdating')"
				/>
			</h3>
			<p v-if="isLoadingSummary" class="text-sm text-[var(--p-text-muted-color)]">
				<i class="pi pi-spin pi-spinner mr-1" aria-hidden="true" />
				{{ t("report.summary.loading", { sessions: summary?.sessions ?? 0 }) }}
			</p>
			<p v-else-if="summary && summary.sessions === 0" class="text-sm text-[var(--p-text-muted-color)]">
				{{ t("report.summary.empty") }}
			</p>
			<dl
				v-else-if="summary"
				:key="summaryPulseKey"
				class="report-summary-pulse grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm"
			>
				<div>
					<dt
						v-tooltip.top="t('report.summary.tooltips.sessions')"
						class="text-[var(--p-text-muted-color)] inline-flex items-center gap-1 cursor-help"
					>
						{{ t("report.summary.sessions") }}
						<i class="pi pi-info-circle text-xs" aria-hidden="true" />
					</dt>
					<dd class="font-semibold">{{ summary.sessions }}</dd>
				</div>
				<div>
					<dt
						v-tooltip.top="t('report.summary.tooltips.completed')"
						class="text-[var(--p-text-muted-color)] inline-flex items-center gap-1 cursor-help"
					>
						{{ t("report.summary.completed") }}
						<i class="pi pi-info-circle text-xs" aria-hidden="true" />
					</dt>
					<dd class="font-semibold">{{ summary.statusCounts.completed ?? 0 }}</dd>
				</div>
				<div>
					<dt
						v-tooltip.top="t('report.summary.tooltips.partial')"
						class="text-[var(--p-text-muted-color)] inline-flex items-center gap-1 cursor-help"
					>
						{{ t("report.summary.partial") }}
						<i class="pi pi-info-circle text-xs" aria-hidden="true" />
					</dt>
					<dd class="font-semibold">{{ summary.statusCounts.partial ?? 0 }}</dd>
				</div>
				<div>
					<dt
						v-tooltip.top="t('report.summary.tooltips.timedOut')"
						class="text-[var(--p-text-muted-color)] inline-flex items-center gap-1 cursor-help"
					>
						{{ t("report.summary.timedOut") }}
						<i class="pi pi-info-circle text-xs" aria-hidden="true" />
					</dt>
					<dd class="font-semibold">{{ summary.statusCounts.timed_out ?? 0 }}</dd>
				</div>
			</dl>
		</div>

		<!-- Download -->
		<div class="space-y-3 pt-2">
			<div class="flex flex-wrap gap-3">
				<span v-tooltip.top="app.canExport ? undefined : t('permissions.missingExport')">
					<Button
						icon="pi pi-download"
						:label="t('report.download')"
						:aria-label="t('report.downloadAriaLabel')"
						:loading="isDownloading"
						:disabled="!canDownload"
						@click="handleDownload"
					/>
				</span>
				<Button
					v-if="isDownloading"
					severity="secondary"
					variant="outlined"
					icon="pi pi-times"
					:label="t('report.cancel')"
					@click="handleCancelDownload"
				/>
			</div>
			<div v-if="isDownloading && downloadProgress" class="space-y-1">
				<ProgressBar :value="progressPercent" />
				<p class="text-xs text-[var(--p-text-muted-color)]">
					{{ t("report.progress", { sessions: downloadProgress.sessions, rows: downloadProgress.rows }) }}
				</p>
			</div>
		</div>
	</div>
</template>

<style scoped>
/* Kurzer Ripple-Puls, wenn die Live-Aktualisierung tatsächlich geänderte Werte liefert (siehe
   summaryPulseKey). Box-shadow statt Hintergrundfarbe, damit sich am Layout/Abstand nichts ändert. */
.report-summary-pulse {
	animation: report-summary-pulse 900ms ease-out;
	border-radius: 0.5rem;
}

@keyframes report-summary-pulse {
	0% {
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--p-primary-color) 45%, transparent);
	}
	100% {
		box-shadow: 0 0 0 10px color-mix(in srgb, var(--p-primary-color) 0%, transparent);
	}
}

@media (prefers-reduced-motion: reduce) {
	.report-summary-pulse {
		animation: none;
	}
}
</style>
