<!-- src/components/HoldButton.vue -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useAttrs } from "vue";
import Button from "primevue/button";

defineOptions({ inheritAttrs: false });

type ConfirmFn = () => void | Promise<void>;

const props = withDefaults(
	defineProps<{
		/** Fires when hold duration is reached */
		onConfirm: ConfirmFn;

		/** Hold duration in ms */
		holdMs?: number;

		/** Keep filled state after confirm (ms) */
		persistMs?: number;

		/** Optional: block interaction (in addition to forwarded disabled/loading) */
		disabled?: boolean;
		loading?: boolean;

		/** Optional a11y label (fallback: forwarded label if present) */
		ariaLabel?: string;
	}>(),
	{
		holdMs: 800,
		persistMs: 1800
	}
);

const emit = defineEmits<{
	(e: "start"): void;
	(e: "cancel"): void;
	(e: "progress", value: number): void; // 0..1
	(e: "confirm"): void;
}>();

const attrs = useAttrs();

const progress = ref(0); // 0..1
const active = ref(false);
const fired = ref(false);

let raf: number | null = null;
let resetTimer: number | null = null;
let startAt = 0;

const isBlocked = computed(() => {
	const a: any = attrs;
	return Boolean(
		props.disabled ||
			props.loading ||
			a.disabled === "" ||
			a.disabled === true ||
			a.loading === "" ||
			a.loading === true
	);
});

/**
 * Forward *all* PrimeVue Button props via attrs (label/icon/severity/size/outlined/...) without listing them here.
 * Remove interaction handlers to avoid double execution (e.g. parent @click).
 */
const passThrough = computed(() => {
	const a: Record<string, any> = { ...attrs };

	delete a.onClick;
	delete a.onPointerdown;
	delete a.onPointerup;
	delete a.onPointercancel;
	delete a.onPointerleave;
	delete a.onKeydown;
	delete a.onKeyup;

	return a;
});

function stopAll(): void {
	if (raf != null) cancelAnimationFrame(raf);
	raf = null;

	if (resetTimer != null) window.clearTimeout(resetTimer);
	resetTimer = null;
}

function reset(): void {
	stopAll();
	active.value = false;
	fired.value = false;
	progress.value = 0;
	emit("progress", 0);
}

async function confirm(): Promise<void> {
	if (fired.value) return;

	fired.value = true;
	progress.value = 1;
	emit("progress", 1);
	emit("confirm");

	try {
		await props.onConfirm();
	} catch (e) {
		console.error(e);
	}

	stopAll();
	resetTimer = window.setTimeout(() => reset(), props.persistMs);
}

function tick(now: number): void {
	const ms = Math.max(200, props.holdMs);
	const t = Math.max(0, Math.min(1, (now - startAt) / ms));

	progress.value = t;
	emit("progress", t);

	if (t >= 1) {
		raf = null;
		void confirm();
		return;
	}

	raf = requestAnimationFrame(tick);
}

function startHold(e?: PointerEvent | KeyboardEvent): void {
	if (isBlocked.value || active.value) return;

	stopAll();
	active.value = true;
	fired.value = false;
	startAt = performance.now();
	progress.value = 0;
	emit("start");
	emit("progress", 0);

	// Prevent text selection / scrolling side-effects on long press
	e?.preventDefault?.();

	raf = requestAnimationFrame(tick);
}

function endHold(): void {
	if (!active.value) return;

	// If not fired yet, cancel & reset immediately.
	if (!fired.value) {
		emit("cancel");
		reset();
		return;
	}

	// If fired: keep filled state until persistMs elapses.
	active.value = false;
}

function onPointerDown(e: PointerEvent): void {
	if (isBlocked.value) return;
	(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
	startHold(e);
}

function onKeyDown(e: KeyboardEvent): void {
	if (isBlocked.value) return;
	if (e.key === " " || e.key === "Enter") startHold(e);
}

function onKeyUp(e: KeyboardEvent): void {
	if (e.key === " " || e.key === "Enter") endHold();
}

onBeforeUnmount(() => reset());

const ariaLabel = computed(() => {
	const a: any = attrs;
	return props.ariaLabel ?? a["aria-label"] ?? a.label ?? "Hold to confirm";
});
</script>

<template>
	<Button
		v-bind="passThrough"
		class="hb-btn"
		:disabled="isBlocked"
		:loading="props.loading || (attrs as any).loading"
		role="progressbar"
		:aria-label="ariaLabel"
		aria-valuemin="0"
		aria-valuemax="100"
		:aria-valuenow="Math.round(progress * 100)"
		@click.prevent.stop
		@pointerdown="onPointerDown"
		@pointerup="endHold"
		@pointercancel="endHold"
		@pointerleave="!fired && endHold()"
		@keydown="onKeyDown"
		@keyup="onKeyUp"
	>
		<template #default>
			<span class="hb-content">
				<slot />
			</span>

			<span
				class="hb-fill"
				:style="{ width: (progress * 100).toFixed(1) + '%' }"
				aria-hidden="true"
			/>
		</template>
	</Button>
</template>

<style scoped>
:deep(.hb-btn.p-button) {
	position: relative;
	overflow: hidden;
	user-select: none;
}

.hb-content {
	position: relative;
	z-index: 1;
}

.hb-fill {
	position: absolute;
	inset: 0;
	width: 0%;
	pointer-events: none;
	background: color-mix(in srgb, var(--p-primary-color) 22%, transparent);
	transition: width 80ms linear;
}
</style>