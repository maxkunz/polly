import type { WebSurveyMessages } from "./de";

export const en: WebSurveyMessages = {
	pageTitle: "Survey",
	loading: "Loading survey …",
	requiredHint: "Questions marked with * are required.",
	submit: "Submit",
	submitting: "Sending …",
	retry: "Try again",
	yes: "Yes",
	no: "No",
	commentCounter: "{count} of {max} characters",
	followUpShown: "Additional question: {prompt}",
	done: {
		title: "Thank you!",
		fallback: "Your answers have been saved."
	},
	stagePreview: {
		banner: "Preview (stage) – your answers will not be saved.",
		notSaved: "No results are saved in preview mode."
	},
	errorSummary: {
		title: "Please check your answer | Please check {count} answers",
		required: "Please answer this question.",
		invalid_value: "This answer is not valid. Please choose again.",
		general: "Your answers do not match the current version of the survey. Please check your answers."
	},
	notice: {
		surveyChanged: "The survey has been updated in the meantime. Please check your answers and submit again.",
		throttled: "The service is very busy right now. Please try again in a moment.",
		error: "Your answers could not be sent. Please try again."
	},
	status: {
		invalid: {
			title: "Invitation is invalid",
			text: "Please check that you copied the complete link from your invitation."
		},
		expired: {
			title: "Invitation has expired",
			text: "This link can no longer be used to take part."
		},
		used: {
			title: "This invitation has already been used",
			text: "This link has already been used to take part in the survey."
		},
		unavailable: {
			title: "Survey not available",
			text: "This survey is currently not available."
		},
		throttled: {
			title: "Service busy",
			text: "The service is very busy right now. Please try again in a moment."
		},
		error: {
			title: "Survey could not be loaded",
			text: "Please check your internet connection and try again."
		}
	}
};
