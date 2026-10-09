<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import Message from "primevue/message";
import type { FlowPayloadLevel, FlowPayloadSize } from "@/services/flowPayloadBudget";
import { currentLocaleTag } from "@/i18n";

const props = defineProps<{
	size: FlowPayloadSize | null;
}>();

const { t } = useI18n();

const level = computed<FlowPayloadLevel>(() => props.size?.level ?? "ok");

const params = computed(() => {
	const format = new Intl.NumberFormat(currentLocaleTag());
	return {
		percent: props.size?.percent ?? 0,
		length: format.format(props.size?.length ?? 0),
		max: format.format(props.size?.max ?? 0)
	};
});

// Screenreader-Ansage nur beim Wechsel der Stufe, nicht bei jeder Prozentänderung,
// damit beim Tippen keine Daueransagen entstehen. Beim Öffnen wird nichts angesagt,
// der sichtbare Hinweis steht dann in der Lesereihenfolge vor dem Formular.
const announcement = ref("");
watch(level, (current, previous) => {
	if (current === "exceeded") {
		announcement.value = t("surveyEditor.flowSize.announceExceeded");
	} else if (current === "warn") {
		announcement.value = t("surveyEditor.flowSize.announceWarn", params.value);
	} else if (previous !== "ok") {
		announcement.value = t("surveyEditor.flowSize.announceOk");
	}
});
</script>

<template>
	<div>
		<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</div>

		<Message
			v-if="level !== 'ok'"
			:severity="level === 'exceeded' ? 'error' : 'warn'"
			:closable="false"
		>
			<div class="space-y-1">
				<div class="font-bold text-sm">
					{{ level === "exceeded" ? t("surveyEditor.flowSize.exceededTitle") : t("surveyEditor.flowSize.warnTitle") }}
				</div>
				<div class="text-xs">
					{{ level === "exceeded" ? t("surveyEditor.flowSize.exceededDetail", params) : t("surveyEditor.flowSize.warnDetail", params) }}
				</div>
			</div>
		</Message>
	</div>
</template>
