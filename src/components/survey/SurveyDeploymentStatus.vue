<script setup lang="ts">
import Tag from "primevue/tag";
import type { Survey } from "@/domain/survey/surveyTypes";

const props = withDefaults(
	defineProps<{
		label: string;
		survey: Survey | null;
		severity?: "info" | "success" | "warn" | "secondary";
	}>(),
	{ severity: "secondary" }
);

function formatDate(iso?: string): string {
	if (!iso) return "–";
	return new Date(iso).toLocaleString("de-DE", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit"
	});
}
</script>

<template>
	<div
		class="flex flex-col gap-3 p-4 rounded-2xl border border-[var(--p-content-border-color)] bg-[var(--p-surface-0)]"
		:class="{ 'ring-2 ring-[var(--p-primary-color)]': severity === 'success' }"
	>
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold uppercase tracking-wide text-[var(--p-text-muted-color)]">
				{{ label }}
			</span>
			<Tag :severity="severity" :value="label" />
		</div>

		<template v-if="props.survey">
			<div class="font-semibold text-sm text-[var(--p-text-color)] truncate">
				{{ survey!.title || survey!.name || "Unbenannte Umfrage" }}
			</div>
			<div class="flex items-center gap-2 flex-wrap">
				<Tag :value="`v${survey!.version ?? 1}`" severity="info" />
				<span class="text-xs text-[var(--p-text-muted-color)]">
					{{ formatDate(survey!.updated_at) }}
				</span>
			</div>
		</template>

		<div v-else class="text-xs text-[var(--p-text-muted-color)] italic">
			Noch nicht deployed
		</div>
	</div>
</template>
