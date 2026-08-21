import { ref, computed, toRaw } from "vue";
import type { Survey, SurveyQuestion, QuestionType } from "@/domain/survey/surveyTypes";
import {
	createEmptyQuestion,
	createEmptyFollowUp,
	countAllQuestions
} from "@/domain/survey/surveyTypes";
import { validateSurvey, type ValidationError } from "@/domain/survey/surveyValidator";

export function useSurveyEditor(initialData?: Survey | null) {
	const survey = ref<Survey | null>(
		initialData ? JSON.parse(JSON.stringify(initialData)) : null
	);
	const initialSnapshot = ref<string>(
		initialData ? JSON.stringify(initialData) : ""
	);

	function setSurvey(data: Survey) {
		survey.value = JSON.parse(JSON.stringify(data));
		initialSnapshot.value = JSON.stringify(data);
	}

	const isDirty = computed(() => {
		if (!survey.value) return false;
		return JSON.stringify(survey.value) !== initialSnapshot.value;
	});

	function extractAllQuestionIds(surveyData: Survey | null): Set<string> {
		const ids = new Set<string>();
		if (!surveyData || !surveyData.questions) return ids;

		function collect(questions: SurveyQuestion[]) {
			for (const q of questions) {
				if (q.id) ids.add(q.id);
				if (q.follow_ups && Array.isArray(q.follow_ups)) {
					for (const fu of q.follow_ups) {
						if (fu.question) collect([fu.question]);
					}
				}
			}
		}

		collect(surveyData.questions);
		return ids;
	}

	const savedQuestionIds = computed<Set<string>>(() => {
		if (!initialSnapshot.value) return new Set();
		try {
			const parsed = JSON.parse(initialSnapshot.value);
			return extractAllQuestionIds(parsed);
		} catch {
			return new Set();
		}
	});

	function isQuestionSaved(questionId: string): boolean {
		return savedQuestionIds.value.has(questionId);
	}

	const totalQuestionsCount = computed(() => {
		if (!survey.value) return 0;
		return countAllQuestions(survey.value.questions || []);
	});

	const canAddQuestion = computed(() => {
		return totalQuestionsCount.value < 20;
	});

	const validationErrors = computed<ValidationError[]>(() => {
		if (!survey.value) return [];
		return validateSurvey(survey.value);
	});

	const isValid = computed(() => {
		return validationErrors.value.length === 0;
	});

	function addQuestion(type: QuestionType = "rating"): SurveyQuestion | null {
		if (!survey.value || !canAddQuestion.value) return null;
		const newQuestion = createEmptyQuestion(type);
		if (!survey.value.questions) {
			survey.value.questions = [];
		}
		survey.value.questions.push(newQuestion);
		return newQuestion;
	}

	function removeQuestion(questionId: string): boolean {
		if (!survey.value || !survey.value.questions) return false;
		const index = survey.value.questions.findIndex(q => q.id === questionId);
		if (index !== -1) {
			survey.value.questions.splice(index, 1);
			return true;
		}
		return false;
	}

	function moveQuestion(index: number, direction: "up" | "down"): boolean {
		if (!survey.value || !survey.value.questions) return false;
		const questions = survey.value.questions;
		const targetIndex = direction === "up" ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= questions.length) return false;

		const temp = questions[index];
		questions[index] = questions[targetIndex];
		questions[targetIndex] = temp;
		return true;
	}

	function addFollowUp(parentQuestionId: string): boolean {
		if (!survey.value || !canAddQuestion.value) return false;
		const parent = survey.value.questions.find(q => q.id === parentQuestionId);
		if (!parent) return false;

		if (!parent.follow_ups) {
			parent.follow_ups = [];
		}
		parent.follow_ups.push(createEmptyFollowUp(parent.type));
		return true;
	}

	function removeFollowUp(parentQuestionId: string, followUpIndex: number): boolean {
		if (!survey.value) return false;
		const parent = survey.value.questions.find(q => q.id === parentQuestionId);
		if (!parent || !parent.follow_ups) return false;

		if (followUpIndex >= 0 && followUpIndex < parent.follow_ups.length) {
			parent.follow_ups.splice(followUpIndex, 1);
			return true;
		}
		return false;
	}

	function reset() {
		if (initialSnapshot.value) {
			survey.value = JSON.parse(initialSnapshot.value);
		}
	}

	function markClean(updatedData?: Survey) {
		if (updatedData) {
			survey.value = JSON.parse(JSON.stringify(updatedData));
		}
		initialSnapshot.value = JSON.stringify(survey.value);
	}

	return {
		survey,
		isDirty,
		isValid,
		validationErrors,
		totalQuestionsCount,
		canAddQuestion,
		isQuestionSaved,
		setSurvey,
		addQuestion,
		removeQuestion,
		moveQuestion,
		addFollowUp,
		removeFollowUp,
		reset,
		markClean
	};
}
