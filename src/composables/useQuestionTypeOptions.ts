import { computed, unref, type MaybeRef } from "vue";
import type {
	SurveyQuestion,
	QuestionType,
	RatingOptions,
	ChoiceOptions
} from "@/domain/survey/surveyTypes";
import {
	isRatingOptions,
	isChoiceOptions,
	createEmptyChoiceOption
} from "@/domain/survey/surveyTypes";

export function useQuestionTypeOptions(questionRef: MaybeRef<SurveyQuestion>) {
	const getQuestion = (): SurveyQuestion => unref(questionRef);

	function handleTypeChange(newType: QuestionType) {
		const q = getQuestion();
		q.type = newType;
		if (newType === "rating") {
			if (!isRatingOptions(q.options)) {
				q.options = { min_value: 1, max_value: 5 };
			}
		} else if (newType === "choice") {
			if (!isChoiceOptions(q.options)) {
				q.options = {
					labels: [
						{ id: crypto.randomUUID(), label: "Option 1" },
						{ id: crypto.randomUUID(), label: "Option 2" }
					]
				};
			}
		} else {
			q.options = undefined;
		}
	}

	const ratingOptions = computed<RatingOptions>({
		get() {
			const q = getQuestion();
			if (isRatingOptions(q.options)) {
				return q.options;
			}
			return { min_value: 1, max_value: 5 };
		},
		set(val) {
			const q = getQuestion();
			q.options = val;
		}
	});

	const choiceOptions = computed<ChoiceOptions>({
		get() {
			const q = getQuestion();
			if (isChoiceOptions(q.options)) {
				return q.options;
			}
			return {
				labels: [
					{ id: crypto.randomUUID(), label: "Option 1" },
					{ id: crypto.randomUUID(), label: "Option 2" }
				]
			};
		},
		set(val) {
			const q = getQuestion();
			q.options = val;
		}
	});

	function addChoiceOption() {
		if (choiceOptions.value.labels.length < 5) {
			choiceOptions.value.labels.push(createEmptyChoiceOption());
		}
	}

	function removeChoiceOption(optIndex: number) {
		if (choiceOptions.value.labels.length > 2) {
			choiceOptions.value.labels.splice(optIndex, 1);
		}
	}

	function getRatingScaleArray(): number[] {
		const min = ratingOptions.value.min_value ?? 1;
		const max = ratingOptions.value.max_value ?? 5;
		if (min > max) return [];
		const arr: number[] = [];
		for (let i = min; i <= max; i++) arr.push(i);
		return arr;
	}

	return {
		handleTypeChange,
		ratingOptions,
		choiceOptions,
		addChoiceOption,
		removeChoiceOption,
		getRatingScaleArray
	};
}
