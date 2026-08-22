<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import type { ChoiceOptions } from "@/domain/survey/surveyTypes";

withDefaults(
	defineProps<{
		choiceOptions: ChoiceOptions;
		idPrefix: string;
		disabled?: boolean;
		showValidation?: boolean;
	}>(),
	{
		disabled: false,
		showValidation: false
	}
);

const emit = defineEmits<{
	(e: "add"): void;
	(e: "remove", index: number): void;
}>();
</script>

<template>
	<div class="p-4 bg-[var(--p-surface-50)] rounded-xl border border-[var(--p-content-border-color)] space-y-3">
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold text-[var(--p-text-color)]">
				Auswahloptionen (2 bis max. 5 Optionen):
			</span>
			<Button
				size="small"
				severity="secondary"
				icon="pi pi-plus"
				label="Option hinzufügen"
				:disabled="disabled || choiceOptions.labels.length >= 5"
				@click="emit('add')"
			/>
		</div>

		<ul class="space-y-2" role="list">
			<li
				v-for="(opt, optIdx) in choiceOptions.labels"
				:key="opt.id"
				class="flex items-center gap-2"
			>
				<span class="w-6 text-xs text-[var(--p-text-muted-color)] font-medium text-right">
					{{ optIdx + 1 }}.
				</span>
				<label :for="`${idPrefix}_${optIdx}`" class="sr-only">
					Option {{ optIdx + 1 }}
				</label>
				<InputText
					:id="`${idPrefix}_${optIdx}`"
					v-model="opt.label"
					class="flex-1 text-sm"
					:placeholder="`Option ${optIdx + 1}`"
					:disabled="disabled"
					:invalid="showValidation && !opt.label?.trim()"
					:aria-invalid="showValidation && !opt.label?.trim()"
				/>
				<Button
					size="small"
					severity="danger"
					variant="text"
					icon="pi pi-times"
					:aria-label="`Option ${optIdx + 1} entfernen`"
					:disabled="disabled || choiceOptions.labels.length <= 2"
					@click="emit('remove', optIdx)"
				/>
			</li>
		</ul>
	</div>
</template>
