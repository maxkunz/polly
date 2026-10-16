import { computed, unref, type MaybeRef } from "vue";
import type {
	SurveyQuestion,
	QuestionType,
	RatingOptions,
	ChoiceOptions,
	ScaleLabels
} from "@/domain/survey/surveyTypes";
import {
	isRatingOptions,
	isChoiceOptions,
	createEmptyChoiceOption,
	createDefaultRatingOptions,
	createDefaultChoiceOptions
} from "@/domain/survey/surveyTypes";
import { CHOICE_MIN_OPTIONS, CHOICE_MAX_OPTIONS } from "@/constants/surveyConstants";

export function useQuestionTypeOptions(questionRef: MaybeRef<SurveyQuestion>) {
	const getQuestion = (): SurveyQuestion => unref(questionRef);

	function handleTypeChange(newType: QuestionType) {
		const q = getQuestion();
		q.type = newType;
		if (newType === "rating") {
			if (!isRatingOptions(q.options)) {
				q.options = createDefaultRatingOptions();
			}
		} else if (newType === "choice") {
			if (!isChoiceOptions(q.options)) {
				q.options = createDefaultChoiceOptions();
			}
		} else if (newType === "nps") {
			// NPS hat feste Werte, in options stehen höchstens die Min/Max-Labels
			q.options = {};
		} else {
			q.options = undefined;
		}
	}

	/** Min/Max-Labels von rating und nps (leer, wenn nicht gesetzt). */
	const scaleLabels = computed<Required<ScaleLabels>>(() => {
		const options = (getQuestion().options ?? {}) as ScaleLabels;
		return { min_label: options.min_label ?? "", max_label: options.max_label ?? "" };
	});

	/** Setzt ein Label; ein leeres Label wird entfernt, damit es nicht ins Flow-JSON gelangt. */
	function setScaleLabel(key: keyof ScaleLabels, value: string) {
		const q = getQuestion();
		const options = (q.options && typeof q.options === "object" ? q.options : {}) as ScaleLabels;
		if (value) {
			options[key] = value;
		} else {
			delete options[key];
		}
		q.options = options;
	}

	const ratingOptions = computed<RatingOptions>({
		get() {
			const q = getQuestion();
			if (isRatingOptions(q.options)) {
				return q.options;
			}
			return createDefaultRatingOptions();
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
			return createDefaultChoiceOptions();
		},
		set(val) {
			const q = getQuestion();
			q.options = val;
		}
	});

	function addChoiceOption() {
		if (choiceOptions.value.labels.length < CHOICE_MAX_OPTIONS) {
			choiceOptions.value.labels.push(createEmptyChoiceOption());
		}
	}

	function removeChoiceOption(optIndex: number) {
		if (choiceOptions.value.labels.length > CHOICE_MIN_OPTIONS) {
			choiceOptions.value.labels.splice(optIndex, 1);
		}
	}

	return {
		handleTypeChange,
		ratingOptions,
		choiceOptions,
		scaleLabels,
		setScaleLabel,
		addChoiceOption,
		removeChoiceOption
	};
}
