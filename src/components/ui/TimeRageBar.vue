<!-- src/components/ui/TimeRangeBar.vue -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import Button from "primevue/button";

// NOTE: Tooltip is typically registered globally in PrimeVue.
// If you use v-tooltip, ensure the Tooltip directive is enabled in your app.
// Otherwise, the button still works via aria-label/title.
type Interval = { start: number; end: number };

defineOptions({ inheritAttrs: false });

const props = withDefaults(
	defineProps<{
		/** Display label (e.g. "Montag") */
		label?: string;

		/**
		 * v-model as string intervals (directly bindable to AnnouncementSchedule.<weekday>).
		 * Recommended canonical format emitted by this component: "HH:mm-HH:mm"
		 * Parsing is tolerant (spaces, en-dash, etc.).
		 */
		modelValue: string[];

		/** 15 by default */
		stepMinutes?: number;

		/** Bar height in px */
		barHeight?: number;

		/** Horizontal inner padding so 00:00 / 24:00 are not too close to the edge */
		insetPx?: number;

		/** Show hour labels above the bar */
		showTimeLabels?: boolean;

		/** Hour label spacing (e.g. 2 => 00:00, 02:00, ...) */
		labelEveryHours?: number;

		/** Allow single click to add one step (never deletes). */
		clickAddsSlot?: boolean;

		/** Disable interaction */
		disabled?: boolean;

		/** Readonly (renders but no editing) */
		readonly?: boolean;
	}>(),
	{
		label: "Montag",
		stepMinutes: 15,
		barHeight: 32,
		insetPx: 16,
		showTimeLabels: true,
		labelEveryHours: 2,
		clickAddsSlot: true,
		disabled: false,
		readonly: false
	}
);

const emit = defineEmits<{
	(e: "update:modelValue", v: string[]): void;
	(e: "change", v: string[]): void;
	(e: "change:intervals", v: Interval[]): void;
}>();

const MIN = 0;
const MAX = 24 * 60;

const elBar = ref<HTMLElement | null>(null);

const isBlocked = computed(() => Boolean(props.disabled || props.readonly));

function clamp(v: number, a: number, b: number): number {
	return Math.max(a, Math.min(b, v));
}

function snap(v: number): number {
	const step = Math.max(1, props.stepMinutes);
	return Math.round(v / step) * step;
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function fmtMinutes(m: number): string {
	const mm = clamp(Math.round(m), MIN, MAX);
	const h = Math.floor(mm / 60);
	const mi = mm % 60;
	return `${pad2(h)}:${pad2(mi)}`;
}

function parseTimeToMinutes(s: string): number | null {
	const m = (s ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	const hh = Number(m[1]);
	const mm = Number(m[2]);
	if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
	if (hh < 0 || hh > 24) return null;
	if (mm < 0 || mm > 59) return null;
	if (hh === 24 && mm !== 0) return null;
	return hh * 60 + mm;
}

function parseIntervalString(raw: string): Interval | null {
	// Accept: "09:00-12:30", "09:00 - 12:30", "09:00–12:30"
	const s = (raw ?? "")
		.trim()
		.replace(/[–—]/g, "-")
		.replace(/\s+/g, " ");

	const parts = s.split("-").map(x => x.trim());
	if (parts.length !== 2) return null;

	const a = parseTimeToMinutes(parts[0]);
	const b = parseTimeToMinutes(parts[1]);
	if (a == null || b == null) return null;

	const start = clamp(snap(a), MIN, MAX);
	const end = clamp(snap(b), MIN, MAX);
	if (end <= start) return null;

	return { start, end };
}

function toIntervalString(iv: Interval): string {
	// Canonical format emitted:
	return `${fmtMinutes(iv.start)}-${fmtMinutes(iv.end)}`;
}

function normalize(list: Interval[]): Interval[] {
	const a = (list ?? [])
		.filter(iv => iv && Number.isFinite(iv.start) && Number.isFinite(iv.end))
		.map(iv => ({
			start: clamp(snap(iv.start), MIN, MAX),
			end: clamp(snap(iv.end), MIN, MAX)
		}))
		.filter(iv => iv.end > iv.start)
		.sort((x, y) => x.start - y.start);

	const merged: Interval[] = [];
	for (const iv of a) {
		const last = merged[merged.length - 1];
		if (!last) {
			merged.push({ ...iv });
			continue;
		}
		if (iv.start <= last.end) last.end = Math.max(last.end, iv.end);
		else merged.push({ ...iv });
	}
	return merged;
}

function subtractOne(iv: Interval, cut: Interval): Interval[] {
	if (cut.end <= iv.start || cut.start >= iv.end) return [iv];
	const out: Interval[] = [];
	if (cut.start > iv.start) out.push({ start: iv.start, end: cut.start });
	if (cut.end < iv.end) out.push({ start: cut.end, end: iv.end });
	return out;
}

const intervals = computed<Interval[]>(() => {
	const parsed = (props.modelValue ?? [])
		.map(parseIntervalString)
		.filter((x): x is Interval => Boolean(x));
	return normalize(parsed);
});

function commit(nextIntervals: Interval[]) {
	const next = normalize(nextIntervals);
	const nextStrings = next.map(toIntervalString);

	emit("update:modelValue", nextStrings);
	emit("change", nextStrings);
	emit("change:intervals", next);
}

function addInterval(a: number, b: number) {
	const start = Math.min(a, b);
	const end = Math.max(a, b);
	commit([...(intervals.value ?? []), { start, end }]);
}

function removeInterval(a: number, b: number) {
	const start = Math.min(a, b);
	const end = Math.max(a, b);
	const cut: Interval = { start, end };

	const next = normalize(
		(intervals.value ?? []).flatMap(iv => subtractOne(iv, cut))
	);
	commit(next);
}

function clearAll() {
	if (isBlocked.value) return;
	commit([]);
}

function minutesFromClientX(clientX: number): number {
	const r = elBar.value?.getBoundingClientRect();
	if (!r) return 0;
	const x = clamp(clientX - r.left, 0, r.width);
	const ratio = r.width ? x / r.width : 0;
	return clamp(snap(ratio * MAX), MIN, MAX);
}

// ---- Drag interaction + preview ----
const drag = ref<null | { start: number; mode: "add" | "remove" }>(null);
const preview = ref<null | Interval>(null);

function onPointerDown(e: PointerEvent): void {
	if (isBlocked.value) return;
	const start = minutesFromClientX(e.clientX);
	drag.value = { start, mode: e.shiftKey ? "remove" : "add" };
	preview.value = null;
	(elBar.value as any)?.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
	if (!drag.value || isBlocked.value) return;

	const cur = minutesFromClientX(e.clientX);
	const start = Math.min(drag.value.start, cur);
	const end = Math.max(drag.value.start, cur);

	if (end <= start) {
		preview.value = null;
		return;
	}

	preview.value = { start, end };
}

function onPointerUp(e: PointerEvent): void {
	if (!drag.value || isBlocked.value) return;

	const cur = minutesFromClientX(e.clientX);
	const start = Math.min(drag.value.start, cur);
	const end = Math.max(drag.value.start, cur);

	preview.value = null;

	if (end > start) {
		if (drag.value.mode === "add") addInterval(start, end);
		else removeInterval(start, end);
	} else {
		// Click (no drag): never delete. Optionally add one step.
		if (drag.value.mode === "add" && props.clickAddsSlot) {
			const a = start;
			const b = clamp(a + props.stepMinutes, MIN, MAX);
			const hit = intervals.value.some(iv => a >= iv.start && a < iv.end);
			if (!hit) addInterval(a, b);
		}
	}

	drag.value = null;
}

function onPointerCancel(): void {
	drag.value = null;
	preview.value = null;
}

// ---- Labels above the bar ----
type Label = { key: string; leftPct: number; text: string; align: "left" | "center" | "right" };

const timeLabels = computed<Label[]>(() => {
	if (!props.showTimeLabels) return [];
	const stepH = Math.max(1, props.labelEveryHours);
	const out: Label[] = [];

	for (let h = 0; h <= 24; h += stepH) {
		const leftPct = (h / 24) * 100;
		const text = `${pad2(h)}:00`;
		const align: Label["align"] = h === 0 ? "left" : h === 24 ? "right" : "center";
		out.push({ key: `${h}`, leftPct, text, align });
	}
	return out;
});

// ---- Tick marks (SVG overlay): hour (long), half hour (short); skip first/last ----
type Tick = { x: number; y2: number; alpha: number };

const ticks = computed<Tick[]>(() => {
	const H = props.barHeight;
	const hourLen = Math.round(H * 0.52);
	const halfLen = Math.round(H * 0.30);

	const out: Tick[] = [];
	for (let i = 1; i < 48; i++) {
		const isHour = i % 2 === 0;
		out.push({
			x: (i / 48) * 1000,
			y2: isHour ? hourLen : halfLen,
			alpha: isHour ? 0.70 : 0.55
		});
	}
	return out;
});

onBeforeUnmount(() => {
	drag.value = null;
	preview.value = null;
});
</script>

<template>
	<div class="trb" :class="{ 'is-blocked': isBlocked }">
		<div class="trb__header">
			<div class="trb__label">{{ props.label }}</div>
		</div>

		<div class="trb__body" :style="{ '--inset': props.insetPx + 'px' }">
			<div v-if="props.showTimeLabels" class="trb__labels" aria-hidden="true">
				<span
					v-for="l in timeLabels"
					:key="l.key"
					class="trb__time"
					:class="`is-${l.align}`"
					:style="{ left: l.leftPct + '%' }"
				>
					{{ l.text }}
				</span>
			</div>

			<div class="trb__scale">
				<svg
					class="trb__ticks"
					:style="{ height: props.barHeight + 'px' }"
					:viewBox="`0 0 1000 ${props.barHeight}`"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<line
						v-for="(t, idx) in ticks"
						:key="idx"
						:x1="t.x"
						y1="0"
						:x2="t.x"
						:y2="t.y2"
						:stroke="`rgba(107,114,128,${t.alpha})`"
						stroke-width="1"
					/>
				</svg>

				<div
					ref="elBar"
					class="trb__bar"
					:style="{ height: props.barHeight + 'px' }"
					:aria-label="`Zeitleiste ${props.label}`"
					role="application"
					@pointerdown.prevent="onPointerDown"
					@pointermove.prevent="onPointerMove"
					@pointerup.prevent="onPointerUp"
					@pointercancel="onPointerCancel"
				/>

				<!-- Existing intervals -->
				<div
					v-for="iv in intervals"
					:key="iv.start + '-' + iv.end"
					class="trb__range"
					:title="fmtMinutes(iv.start) + ' – ' + fmtMinutes(iv.end)"
					:style="{
						left: (iv.start / (24 * 60)) * 100 + '%',
						width: ((iv.end - iv.start) / (24 * 60)) * 100 + '%',
						height: props.barHeight + 'px'
					}"
				/>

				<!-- Preview while dragging -->
				<div
					v-if="preview"
					class="trb__range trb__preview"
					:style="{
						left: (preview.start / (24 * 60)) * 100 + '%',
						width: ((preview.end - preview.start) / (24 * 60)) * 100 + '%',
						height: props.barHeight + 'px'
					}"
				/>
			</div>

			<div class="trb__footer">
				<div class="trb__summary">
					<div class="trb__summaryText" :title="intervals.length ? (intervals.map(i => fmtMinutes(i.start) + '-' + fmtMinutes(i.end)).join(' | ')) : '—'">
						{{
							intervals.length
								? intervals.map(i => fmtMinutes(i.start) + "-" + fmtMinutes(i.end)).join("   |   ")
								: "—"
						}}
					</div>

					<Button
						class="trb__clear"
						icon="pi pi-trash"
						severity="secondary"
						text
						rounded
						:disabled="isBlocked || !intervals.length"
						:title="'Alles löschen'"
						aria-label="Alles löschen"
						@click="clearAll"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.trb {
	border: 1px solid var(--p-content-border-color, #e5e7eb);
	border-radius: 14px;
	overflow: hidden;
	background: var(--p-surface-50, #f3f4f6);
	box-shadow: 0 1px 2px rgba(0,0,0,.06);
}

.trb__header {
	padding: 8px 16px;
	background: var(--p-surface-50, #f3f4f6);
}

.trb__label {
	font-weight: 650;
	font-size: 13px;
	color: var(--p-text-color, #374151);
	letter-spacing: .2px;
}

.trb__body {
	padding: 8px var(--inset) 10px;
	background: var(--p-surface-50, #f3f4f6);
}

.trb__labels {
	position: relative;
	height: 14px;
	margin-bottom: 2px;
	user-select: none;
}

.trb__time {
	position: absolute;
	top: 0;
	font-size: 10px;
	color: var(--p-text-muted-color, #6b7280);
	white-space: nowrap;
}

.trb__time.is-center { transform: translateX(-50%); }
.trb__time.is-left   { transform: translateX(0%); }
.trb__time.is-right  { transform: translateX(-100%); }

/* Scale: subtle 15-min grid */
.trb__scale {
	position: relative;
	border: 1px solid var(--p-content-border-color, #e5e7eb);
	border-radius: 12px;
	overflow: hidden;
	background:
		linear-gradient(to right, rgba(17, 24, 39, .06) 0, rgba(17, 24, 39, .06) 1px, transparent 1px)
		0 0 / calc(100% / 96) 100% repeat-x;
}

.trb__ticks {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	pointer-events: none;
	z-index: 2;
}

.trb__bar {
	background: var(--p-surface-100, #eef2f7);
	cursor: crosshair;
	user-select: none;
	touch-action: none;
}

.trb__bar:hover {
	background: color-mix(in srgb, var(--p-surface-100, #eef2f7) 70%, #ffffff);
}

.trb.is-blocked .trb__bar {
	cursor: not-allowed;
	opacity: 0.75;
}

/* Ranges */
.trb__range {
	position: absolute;
	top: 0;
	background: var(--p-green-500, #10b981);
	border-radius: 10px;
	box-shadow: inset 0 0 0 1px rgba(255,255,255,.35);
	pointer-events: none; /* interaction only via bar */
	z-index: 1;
}

.trb__preview {
	opacity: 0.55;
}

.trb__footer {
	margin-top: 6px;
	display: flex;
	justify-content: flex-end;
}

.trb__summary {
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-height: 22px;
}

.trb__summaryText {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
	font-size: 12px;
	color: var(--p-text-color, #111827);
}

/* PrimeVue button: remove frame by default, show subtle frame on hover */
:deep(.trb__clear.p-button) {
	border: 1px solid transparent !important;
	background: transparent !important;
}

:deep(.trb__clear.p-button:hover:not(:disabled)) {
	border-color: var(--p-content-border-color, #e5e7eb) !important;
	background: rgba(255,255,255,.85) !important;
}

:deep(.trb__clear.p-button:disabled) {
	opacity: 0.35;
}
</style>