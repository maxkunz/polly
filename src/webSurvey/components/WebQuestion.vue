<script setup lang="ts">
import { computed } from "vue";
import { WEB_COMMENT_MAX_CHARS } from "@/domain/survey/flowTypes";
import type { WebQuestion } from "@/domain/survey/webSurveyTypes";
import { scaleValues } from "@/domain/survey/webSurveyPage";
import { t } from "../i18n";

/**
 * Eine Frage der Umfrageseite als natives Formularelement (siehe `documentation/polly_web.md`):
 * rating/nps als Skala aus Radio-Buttons, choice und yes_no als Radio-Gruppe, comment als Textfeld.
 * Alle Texte der Umfrage werden nur als Text ausgegeben (kein `v-html`).
 */

const props = defineProps<{
	question: WebQuestion;
	modelValue: unknown;
	/** Eindeutige DOM-ID der Frage; Ziel der Links in der Fehlerübersicht. */
	domId: string;
	/** 0 = Hauptfrage, ab 1 Folgefrage (eingerückt). */
	depth: number;
	error: string | null;
}>();

const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

const ids = computed(() => ({
	legend: `${props.domId}-legend`,
	description: `${props.domId}-description`,
	error: `${props.domId}-error`,
	input: `${props.domId}-input`,
	counter: `${props.domId}-counter`,
	minLabel: `${props.domId}-min-label`,
	maxLabel: `${props.domId}-max-label`
}));

function joinIds(...values: (string | false | null | undefined)[]): string | undefined {
	const joined = values.filter(Boolean).join(" ");
	return joined || undefined;
}

const describedBy = computed(() => joinIds(
	props.question.description && ids.value.description,
	props.error && ids.value.error
));

const isScale = computed(() => props.question.type === "rating" || props.question.type === "nps");

const scaleLabels = computed(() => {
	const question = props.question;
	if (question.type !== "rating" && question.type !== "nps") return { min: "", max: "" };
	return { min: question.options?.min_label?.trim() ?? "", max: question.options?.max_label?.trim() ?? "" };
});

interface Option {
	key: string;
	value: unknown;
	label: string;
	describedBy?: string;
}

const options = computed<Option[]>(() => {
	const question = props.question;
	switch (question.type) {
		case "yes_no":
			return [
				{ key: "yes", value: true, label: t("yes") },
				{ key: "no", value: false, label: t("no") }
			];
		case "choice":
			return question.labels.map((label, index) => ({ key: String(index), value: label, label }));
		case "rating":
		case "nps": {
			const values = scaleValues(question);
			// Labels an den Skalenenden beschreiben den kleinsten bzw. größten Wert
			return values.map((value, index) => ({
				key: String(value),
				value,
				label: String(value),
				describedBy: joinIds(
					index === 0 && scaleLabels.value.min && ids.value.minLabel,
					index === values.length - 1 && scaleLabels.value.max && ids.value.maxLabel
				)
			}));
		}
		default:
			return [];
	}
});

const commentText = computed(() => (typeof props.modelValue === "string" ? props.modelValue : ""));

function onCommentInput(event: Event): void {
	emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
	<div
		:id="domId"
		class="web-question"
		:class="{ 'web-question--follow-up': depth > 0 }"
		:data-depth="Math.min(depth, 3)"
	>
		<div v-if="question.type === 'comment'" class="flex flex-col gap-2">
			<label :for="ids.input" class="web-question__title">
				{{ question.prompt }}<span v-if="question.mandatory" class="web-required" aria-hidden="true"> *</span>
			</label>
			<p v-if="question.description" :id="ids.description" class="web-question__description">{{ question.description }}</p>
			<p v-if="error" :id="ids.error" class="web-question__error">{{ error }}</p>
			<textarea
				:id="ids.input"
				class="web-textarea"
				rows="4"
				:value="commentText"
				:maxlength="WEB_COMMENT_MAX_CHARS"
				:aria-required="question.mandatory ? 'true' : undefined"
				:aria-invalid="error ? 'true' : undefined"
				:aria-describedby="joinIds(describedBy, ids.counter)"
				@input="onCommentInput"
			></textarea>
			<p :id="ids.counter" class="text-sm text-slate-600">
				{{ t("commentCounter", { count: commentText.length, max: WEB_COMMENT_MAX_CHARS }) }}
			</p>
		</div>

		<fieldset
			v-else
			role="radiogroup"
			:aria-labelledby="ids.legend"
			:aria-describedby="describedBy"
			:aria-required="question.mandatory ? 'true' : undefined"
			:aria-invalid="error ? 'true' : undefined"
			class="flex flex-col gap-3"
		>
			<legend :id="ids.legend" class="web-question__title">
				{{ question.prompt }}<span v-if="question.mandatory" class="web-required" aria-hidden="true"> *</span>
			</legend>
			<p v-if="question.description" :id="ids.description" class="web-question__description">{{ question.description }}</p>
			<p v-if="error" :id="ids.error" class="web-question__error">{{ error }}</p>

			<div v-if="isScale" class="flex flex-col gap-2">
				<div class="web-scale">
					<label v-for="option in options" :key="option.key" class="web-option web-option--scale">
						<input
							type="radio"
							:name="domId"
							:value="option.key"
							:checked="modelValue === option.value"
							:aria-describedby="option.describedBy"
							@change="emit('update:modelValue', option.value)"
						/>
						<span>{{ option.label }}</span>
					</label>
				</div>
				<!-- Sichtbare Labels; für Screenreader über aria-describedby am kleinsten/größten Wert -->
				<div v-if="scaleLabels.min || scaleLabels.max" class="web-scale__labels" aria-hidden="true">
					<span :id="ids.minLabel">{{ scaleLabels.min }}</span>
					<span :id="ids.maxLabel" class="text-right">{{ scaleLabels.max }}</span>
				</div>
			</div>

			<div v-else class="flex flex-col gap-2">
				<label v-for="option in options" :key="option.key" class="web-option">
					<input
						type="radio"
						:name="domId"
						:value="option.key"
						:checked="modelValue === option.value"
						@change="emit('update:modelValue', option.value)"
					/>
					<span>{{ option.label }}</span>
				</label>
			</div>
		</fieldset>
	</div>
</template>
