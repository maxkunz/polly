<script setup lang="ts">
import { computed, reactive } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import type { ChoiceOptionLabel, ChoiceOptions } from "@/domain/survey/surveyTypes";
import { findDuplicateChoiceLabels } from "@/domain/survey/surveyValidator";

const props = withDefaults(
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

const duplicates = computed(() => findDuplicateChoiceLabels(props.choiceOptions.labels));

function isOptionInvalid(label: string | undefined, idx: number): boolean {
	return props.showValidation && (!label?.trim() || duplicates.value.has(idx));
}

// Rohtext je Option (nach id), damit während der Eingabe nichts (z. B. ein
// trennendes Komma am Ende) durch das Neuformatieren aus opt.label/opt.synonyms
// überschrieben wird.
const rawInputByOptionId = reactive<Record<string, string>>({});

function formatOptionInput(opt: ChoiceOptionLabel): string {
	return [opt.label, ...(opt.synonyms ?? [])].join(", ");
}

function getOptionInput(opt: ChoiceOptionLabel): string {
	return rawInputByOptionId[opt.id] ?? formatOptionInput(opt);
}

function updateOptionInput(opt: ChoiceOptionLabel, value: string | undefined): void {
	const text = value ?? "";
	rawInputByOptionId[opt.id] = text;
	const parts = text.split(",").map(part => part.trim());
	opt.label = parts[0] ?? "";
	const synonyms = parts.slice(1).filter(part => part.length > 0);
	if (synonyms.length > 0) {
		opt.synonyms = synonyms;
	} else {
		delete opt.synonyms;
	}
}
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
		<p class="text-xs text-[var(--p-text-muted-color)]">
			Optional Synonyme durch Komma getrennt angeben, z. B. „Orange, Apfelsine, Saftorange“. Das erste Wort ist die Option, alle weiteren sind Synonyme.
		</p>

		<ul class="space-y-2" role="list">
			<li
				v-for="(opt, optIdx) in choiceOptions.labels"
				:key="opt.id"
				class="space-y-1"
			>
				<div class="flex items-center gap-2">
					<span class="w-6 text-xs text-[var(--p-text-muted-color)] font-medium text-right">
						{{ optIdx + 1 }}.
					</span>
					<label :for="`${idPrefix}_${optIdx}`" class="sr-only">
						Option {{ optIdx + 1 }}
					</label>
					<InputText
						:id="`${idPrefix}_${optIdx}`"
						:model-value="getOptionInput(opt)"
						@update:model-value="value => updateOptionInput(opt, value)"
						class="flex-1 text-sm"
						:placeholder="`Option ${optIdx + 1}, Synonym 1, Synonym 2`"
						:disabled="disabled"
						:invalid="isOptionInvalid(opt.label, optIdx)"
						:aria-invalid="isOptionInvalid(opt.label, optIdx)"
						:aria-describedby="showValidation && duplicates.has(optIdx) ? `${idPrefix}_${optIdx}_dup` : undefined"
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
				</div>
				<small
					v-if="showValidation && duplicates.has(optIdx)"
					:id="`${idPrefix}_${optIdx}_dup`"
					class="block ml-8 text-xs text-red-500"
				>
					Option {{ optIdx + 1 }} überschneidet sich mit Option {{ duplicates.get(optIdx)! + 1 }} (gleiches Label oder Synonym).
				</small>
			</li>
		</ul>
	</div>
</template>
