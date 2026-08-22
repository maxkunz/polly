<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Tag from "primevue/tag";
import { useConfirm } from "primevue/useconfirm";
import type { SurveyQuestion } from "@/domain/survey/surveyTypes";
import { questionTypes } from "@/domain/survey/questionTypeCatalog";

const props = withDefaults(
	defineProps<{
		question: SurveyQuestion;
		index: number;
		totalQuestions: number;
		disabled?: boolean;
	}>(),
	{
		disabled: false
	}
);

const emit = defineEmits<{
	(e: "move-up"): void;
	(e: "move-down"): void;
	(e: "delete"): void;
}>();

const confirm = useConfirm();

const currentTypeMeta = computed(() => {
	return questionTypes.find(t => t.value === props.question.type) ?? questionTypes[0];
});

function confirmDelete() {
	const qTitle = props.question.title?.trim() || `Frage #${props.index + 1}`;
	confirm.require({
		header: "Frage löschen",
		message: `Möchten Sie „${qTitle}“ und alle zugehörigen Folgefragen wirklich unwiderruflich löschen?`,
		icon: "pi pi-exclamation-triangle",
		acceptLabel: "Löschen",
		rejectLabel: "Abbrechen",
		acceptClass: "p-button-danger",
		accept: () => {
			emit("delete");
		}
	});
}
</script>

<template>
	<div class="bg-[var(--p-surface-50)] px-4 py-3 border-b border-[var(--p-content-border-color)] flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<span
				class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--p-primary-500)] text-white font-bold text-xs"
				aria-label="Fragenummer"
			>
				{{ index + 1 }}
			</span>
			<div class="flex items-center gap-2">
				<Tag :value="currentTypeMeta.label" severity="info">
					<template #icon>
						<i :class="currentTypeMeta.icon" class="mr-1 text-xs" aria-hidden="true" />
					</template>
				</Tag>
				<Tag
					v-if="question.mandatory"
					value="Pflichtfeld"
					severity="warn"
					class="text-xs"
				/>
			</div>
		</div>

		<div class="flex items-center gap-1">
			<Button
				size="small"
				severity="secondary"
				variant="text"
				icon="pi pi-arrow-up"
				:aria-label="`Frage ${index + 1} nach oben verschieben`"
				:disabled="disabled || index === 0"
				@click="emit('move-up')"
			/>
			<Button
				size="small"
				severity="secondary"
				variant="text"
				icon="pi pi-arrow-down"
				:aria-label="`Frage ${index + 1} nach unten verschieben`"
				:disabled="disabled || index === totalQuestions - 1"
				@click="emit('move-down')"
			/>
			<Button
				size="small"
				severity="danger"
				variant="text"
				icon="pi pi-trash"
				label="Löschen"
				:aria-label="`Frage ${index + 1} löschen`"
				:disabled="disabled"
				@click="confirmDelete"
			/>
		</div>
	</div>
</template>
