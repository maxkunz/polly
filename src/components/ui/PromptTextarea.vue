<!-- Mehrzeiliges Eingabefeld für Ansagetexte: startet mit 2 Zeilen, wächst bis 10 Zeilen, danach scrollbar -->
<script setup lang="ts">
import { computed, ref, useAttrs, watch } from "vue";
import { useI18n } from "vue-i18n";
import Textarea from "primevue/textarea";
import { TTS_TEXT_MAX_CHARS, TTS_TEXT_COUNTER_RATIO } from "@/constants/surveyConstants";
import { currentLocaleTag } from "@/i18n";

// Attribute landen auf dem Textarea, nicht auf dem umschließenden div
defineOptions({ inheritAttrs: false });

const props = withDefaults(
	defineProps<{
		/** Text wird per TTS gesprochen – Zeichenlimit anzeigen und Überschreitung markieren */
		ttsLimit?: boolean;
	}>(),
	{ ttsLimit: false }
);

// id, aria-*, placeholder, disabled, invalid usw. werden unverändert an das Textarea durchgereicht
const model = defineModel<string | null | undefined>();
const attrs = useAttrs();
const { t } = useI18n();

const length = computed(() => model.value?.length ?? 0);
const isTooLong = computed(() => props.ttsLimit && length.value > TTS_TEXT_MAX_CHARS);
const showCounter = computed(
	() => props.ttsLimit && length.value >= TTS_TEXT_MAX_CHARS * TTS_TEXT_COUNTER_RATIO
);

const hintId = computed(() => (attrs.id ? `${attrs.id}_tts_hint` : undefined));

const formatParams = computed(() => {
	const format = new Intl.NumberFormat(currentLocaleTag());
	return { length: format.format(length.value), max: format.format(TTS_TEXT_MAX_CHARS) };
});

// Eigene Beschreibung an evtl. vorhandene aria-describedby anhängen
const describedBy = computed(() => {
	const ids = [attrs["aria-describedby"], props.ttsLimit ? hintId.value : undefined].filter(Boolean);
	return ids.length ? ids.join(" ") : undefined;
});

const isInvalid = computed(() => Boolean(attrs.invalid) || isTooLong.value);
const isAriaInvalid = computed(() => {
	const external = attrs["aria-invalid"];
	return external === true || external === "true" || isTooLong.value;
});

// Screenreader-Ansage nur beim Über- bzw. Unterschreiten des Limits, nicht bei jedem Zeichen
const announcement = ref("");
watch(isTooLong, tooLong => {
	announcement.value = tooLong
		? t("promptTextarea.ttsAnnounceTooLong", formatParams.value)
		: t("promptTextarea.ttsAnnounceOk");
});
</script>

<template>
	<div>
		<Textarea
			v-bind="attrs"
			v-model="model"
			class="prompt-textarea w-full"
			rows="2"
			autoResize
			:invalid="isInvalid"
			:aria-invalid="isAriaInvalid"
			:aria-describedby="describedBy"
		/>

		<template v-if="ttsLimit">
			<!-- Per aria-describedby verknüpft: Screenreader nennen das Limit beim Fokussieren des Feldes -->
			<div :id="hintId" class="text-xs mt-1">
				<span v-if="isTooLong" class="font-medium text-red-700">
					{{ t("promptTextarea.ttsTooLong", formatParams) }}
				</span>
				<span v-else-if="showCounter" class="text-[var(--p-text-muted-color)]">
					{{ t("promptTextarea.ttsCounter", formatParams) }}
				</span>
				<span v-else class="sr-only">
					{{ t("promptTextarea.ttsLimitHint", formatParams) }}
				</span>
			</div>
			<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
		</template>
	</div>
</template>

<style scoped>
/* autoResize setzt overflow: hidden – ab der Maximalhöhe muss der Inhalt scrollbar bleiben */
.p-textarea.prompt-textarea {
	max-height: calc(10 * 1.5em + 2 * var(--p-textarea-padding-y) + 2px);
	max-height: calc(10lh + 2 * var(--p-textarea-padding-y) + 2px);
	overflow-y: auto;
}
</style>
