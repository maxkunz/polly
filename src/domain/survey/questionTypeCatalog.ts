import type { QuestionType, ConditionOperator } from "./surveyTypes";

export interface QuestionTypeMeta {
	label: string;
	value: QuestionType;
	icon?: string;
}

export const questionTypes: QuestionTypeMeta[] = [
	{ label: "Bewertung (rating)", value: "rating", icon: "pi pi-star" },
	{ label: "Auswahl (choice)", value: "choice", icon: "pi pi-list" },
	{ label: "Ja / Nein (yes_no)", value: "yes_no", icon: "pi pi-check-circle" },
	{ label: "NPS (nps)", value: "nps", icon: "pi pi-chart-bar" },
	{ label: "Kommentar / Text (comment)", value: "comment", icon: "pi pi-comment" }
];

export const followUpQuestionTypes: QuestionTypeMeta[] = [
	{ label: "Freitext / Kommentar (comment)", value: "comment" },
	{ label: "Bewertung (rating)", value: "rating" },
	{ label: "Ja / Nein (yes_no)", value: "yes_no" },
	{ label: "Auswahl (choice)", value: "choice" },
	{ label: "NPS (nps)", value: "nps" }
];

export function getOperatorOptions(
	parentType: QuestionType
): { label: string; value: ConditionOperator }[] {
	if (parentType === "yes_no" || parentType === "choice") {
		return [
			{ label: "ist gleich (equals)", value: "equals" },
			{ label: "ist ungleich (not_equals)", value: "not_equals" }
		];
	}
	return [
		{ label: "ist gleich (equals)", value: "equals" },
		{ label: "ist ungleich (not_equals)", value: "not_equals" },
		{ label: "ist kleiner als (less_than)", value: "less_than" },
		{ label: "ist größer als (greater_than)", value: "greater_than" },
		{ label: "ist kleiner oder gleich (less_than_or_equal)", value: "less_than_or_equal" },
		{ label: "ist größer oder gleich (greater_than_or_equal)", value: "greater_than_or_equal" }
	];
}

export const booleanOptions = [
	{ label: "Ja (true)", value: true },
	{ label: "Nein (false)", value: false }
];
