import { i18n } from "@/i18n";
import type { QuestionType, ConditionOperator } from "./surveyTypes";

export interface QuestionTypeMeta {
	label: string;
	value: QuestionType;
	icon?: string;
}

export function getQuestionTypes(): QuestionTypeMeta[] {
	const { t } = i18n.global;
	return [
		{ label: t("questionTypes.rating"), value: "rating", icon: "pi pi-star" },
		{ label: t("questionTypes.choice"), value: "choice", icon: "pi pi-list" },
		{ label: t("questionTypes.yes_no"), value: "yes_no", icon: "pi pi-check-circle" },
		{ label: t("questionTypes.nps"), value: "nps", icon: "pi pi-chart-bar" },
		{ label: t("questionTypes.comment"), value: "comment", icon: "pi pi-comment" }
	];
}

export function getFollowUpQuestionTypes(): QuestionTypeMeta[] {
	const { t } = i18n.global;
	return [
		{ label: t("questionTypes.commentFollowUp"), value: "comment" },
		{ label: t("questionTypes.rating"), value: "rating" },
		{ label: t("questionTypes.yes_no"), value: "yes_no" },
		{ label: t("questionTypes.choice"), value: "choice" },
		{ label: t("questionTypes.nps"), value: "nps" }
	];
}

export function getOperatorOptions(
	parentType: QuestionType
): { label: string; value: ConditionOperator }[] {
	const { t } = i18n.global;
	if (parentType === "yes_no" || parentType === "choice") {
		return [{ label: t("operators.equals"), value: "equals" }];
	}
	return [
		{ label: t("operators.equals"), value: "equals" },
		{ label: t("operators.less_than"), value: "less_than" },
		{ label: t("operators.greater_than"), value: "greater_than" }
	];
}

export function getBooleanOptions(): { label: string; value: boolean }[] {
	const { t } = i18n.global;
	return [
		{ label: t("booleanOptions.yes"), value: true },
		{ label: t("booleanOptions.no"), value: false }
	];
}
