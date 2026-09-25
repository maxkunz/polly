import type { MessageSchema } from "./de";

export const en: MessageSchema = {
	common: {
		back: "Back",
		backToOverview: "Back to overview",
		cancel: "Cancel",
		save: "Save",
		delete: "Delete",
		edit: "Edit",
		close: "Close",
		discard: "Discard",
		unknownUser: "Unknown user",
		otherUser: "another user",
		unknownError: "Unknown error",
		selection: "Selection"
	},

	language: {
		title: "Sprache / Language",
		label: "Language",
		de: "Deutsch",
		en: "English"
	},

	modules: {
		dashboard: {
			title: "Dashboard",
			description: "Overview of the modules available in the template."
		},
		questions: {
			title: "Questions",
			description: "Manage rating questions with prompt, reprompt and numeric scale.",
			unnamedQuestion: "Unnamed question"
		},
		surveys: {
			title: "Surveys",
			description: "Creation, configuration and analysis of surveys.",
			unnamedSurvey: "Survey {index}"
		},
		settings: {
			title: "Settings",
			description: "Global settings and setup metadata."
		}
	},

	dashboard: {
		title: "Dashboard"
	},

	questions: {
		searchPlaceholder: "Search questions, prompt or reprompt...",
		actions: {
			new: "New question",
			delete: "Delete question",
			reloadAnswers: "Reload answers"
		},
		newQuestionName: "*New question",
		deleteConfirm: {
			header: "Delete question",
			message: "Delete „{title}“? This action cannot be undone.",
			acceptLabel: "Delete",
			rejectLabel: "Cancel",
			fallbackTitle: "this question"
		},
		toast: {
			reloadSuccessSummary: "Answers reloaded",
			reloadSuccessDetail: "Answers were reloaded successfully.",
			reloadErrorSummary: "Error",
			reloadErrorDetail: "Reload failed."
		},
		empty: "No questions found.",
		fields: {
			name: "Name",
			active: "Active",
			prompt: "Prompt",
			reprompt: "Reprompt",
			min: "Min",
			max: "Max",
			scale: "Scale: {min} to {max}"
		},
		placeholders: {
			name: "e.g. Service rating",
			prompt: "Rate the service on a scale from 1 to 5.",
			reprompt: "Please provide a number within the range."
		},
		answers: {
			title: "Current answers",
			total: "Total: {count}",
			updatedAt: "Last updated: {date}"
		}
	},

	surveys: {
		searchPlaceholder: "Search survey...",
		actions: {
			back: "Back to overview",
			new: "New survey",
			reload: "Reload surveys"
		},
		newSurveyTitle: "New survey",
		cloneSurveyTitle: "Clone survey",
		leaveConfirm: {
			header: "Unsaved changes",
			message: "You have unsaved changes. Do you really want to leave the page?",
			queueMappingMessage: "You have unsaved changes to the queue mapping. Do you really want to leave the page?",
			acceptLabel: "Leave",
			rejectLabel: "Stay"
		},
		detail: {
			loading: "Loading survey details...",
			errorTitle: "Failed to load survey",
			emptyDraft: "No survey data available for this ID.",
			loadErrorFallback: "Failed to load survey '{id}'",
			rowNotFound: "No row found for '{key}' in the data table."
		},
		list: {
			availableCount: "Available surveys ({count})",
			loading: "Loading survey data...",
			loadErrorFallback: "Failed to load survey data",
			unnamedSurvey: "Unnamed survey",
			openAriaLabel: "Open survey: {title}",
			edit: "Edit",
			emptySearch: "No surveys found for this search.",
			empty: "No surveys available."
		}
	},

	surveyEditor: {
		toolbar: {
			back: "Back to overview",
			backAriaLabel: "Back to survey overview",
			statusUnsaved: "Unsaved",
			statusSaved: "Saved",
			discard: "Discard",
			delete: "Delete",
			deleteAriaLabel: "Delete survey",
			clone: "Clone",
			cloneAriaLabel: "Clone survey",
			deploy: "Deploy",
			deployAriaLabel: "Go to deployment view",
			save: "Save"
		},
		stickyBar: {
			unsaved: "● Unsaved changes present",
			allSaved: "✓ All changes saved",
			back: "Back",
			save: "Save survey"
		},
		meta: {
			title: "General survey settings",
			surveyTitle: "Survey title",
			technicalName: "Technical name (automatically derived from title & ID)",
			description: "Description",
			greeting: "Greeting message",
			closing: "Closing message",
			placeholders: {
				title: "e.g. Customer satisfaction 2026",
				description: "Internal description or context for the survey...",
				greeting: "Thank you for taking a moment...",
				closing: "Thank you for your valuable feedback!"
			}
		},
		save: {
			validationErrorSummary: "Validation error",
			validationErrorFallback: "Please fix the highlighted errors before saving.",
			successSummary: "Saved successfully",
			successDetail: "Survey „{title}“ was updated in the data table.",
			errorSummary: "Save error",
			errorFallback: "Failed to save the survey in the data table."
		},
		discardConfirm: {
			header: "Discard changes",
			message: "Do you really want to discard all unsaved changes?",
			acceptLabel: "Yes, discard",
			rejectLabel: "Cancel",
			toastSummary: "Reset",
			toastDetail: "Changes were discarded."
		},
		deleteConfirm: {
			header: "Delete survey",
			message: "Do you really want to permanently delete the survey „{title}“?",
			acceptLabel: "Yes, delete",
			rejectLabel: "Cancel",
			successSummary: "Survey deleted",
			successDetail: "The survey „{title}“ was deleted successfully.",
			errorSummary: "Delete error",
			errorFallback: "Failed to delete the survey from the data table."
		}
	},

	surveyLock: {
		unknownUser: "Unknown user",
		conflict: {
			header: "Survey is already being edited",
			message: "This survey has been edited by „{user}“ since {date}. Do you want to ignore the lock or cancel?",
			acceptLabel: "Edit anyway",
			rejectLabel: "Cancel"
		}
	},

	surveyQuestions: {
		title: "Question catalog",
		countStatus: "{count} of a maximum of 20 questions used (incl. follow-up questions)",
		maxReached: "Maximum reached",
		addQuestion: "Add question",
		addQuestionAriaLabel: "Add new question to the survey",
		addAnotherAriaLabel: "Add another question to the survey",
		empty: {
			title: "This survey does not contain any questions yet.",
			description: "Create your first question to start configuring the survey.",
			cta: "Create first question"
		},
		limitToast: {
			summary: "Limit reached",
			detail: "A survey may contain a maximum of 20 questions (incl. follow-up questions)."
		}
	},

	surveyQuestion: {
		numberAriaLabel: "Question number",
		mandatoryTag: "Required field",
		moveUpAriaLabel: "Move question {number} up",
		moveDownAriaLabel: "Move question {number} down",
		delete: "Delete",
		deleteAriaLabel: "Delete question {number}",
		deleteConfirm: {
			header: "Delete question",
			message: "Do you really want to permanently delete „{title}“ and all its follow-up questions?",
			acceptLabel: "Delete",
			rejectLabel: "Cancel",
			fallbackTitle: "Question #{number}"
		},
		followUps: {
			title: "Conditional follow-up questions ({count})",
			hint: "Only shown when the defined answer condition is met.",
			add: "Add follow-up question",
			addAriaLabel: "Add follow-up question to question {number}"
		}
	},

	surveyQuestionFields: {
		technicalName: "Technical identifier (name)",
		technicalNameHintShort: "(Fixed for reporting)",
		technicalNameHint: "The identifier is used for reporting purposes and cannot be changed.",
		type: "Question type",
		typeSavedHint: "(Saved - type cannot be changed)",
		mandatory: "Required question",
		title: "Title / prompt",
		titlePlaceholder: "e.g. How satisfied are you with our service?",
		reprompt: "Reprompt",
		repromptPlaceholder: "Second prompt to answer the question (optional).",
		description: "Description / help text",
		descriptionPlaceholder: "Additional hints for the respondent..."
	},

	surveyFollowUp: {
		legend: "Follow-up question #{number}",
		fieldsetAriaLabel: "Follow-up question {number}",
		delete: "Delete",
		deleteAriaLabel: "Delete follow-up question {number}",
		deleteConfirm: {
			header: "Delete follow-up question",
			message: "Do you really want to remove this follow-up question?",
			acceptLabel: "Delete",
			rejectLabel: "Cancel"
		},
		title: "Title / prompt",
		titlePlaceholder: "e.g. What was the reason for your rating?",
		type: "Question type",
		typeSavedHint: "(Saved - type cannot be changed)",
		reprompt: "Reprompt",
		repromptPlaceholder: "Second prompt to answer the question (optional).",
		description: "Description / help text",
		descriptionPlaceholder: "Additional explanation for the participant..."
	},

	surveyCondition: {
		label: "Condition for display:",
		operator: "Operator",
		operatorDuplicate: "This comparator is already used by follow-up question {number}.",
		valueChoice: "Answer matches option",
		valueOther: "Comparison value",
		choicePlaceholder: "Select option...",
		choiceDuplicate: "This option is already used by follow-up question {number}.",
		unnamedOption: "Option ({id})"
	},

	ratingOptions: {
		scaleLabel: "Configure rating scale (0 to max. 8):",
		min: "Minimum value (0 to 7)",
		max: "Maximum value (1 to 8)",
		previewLabel: "Scale preview:"
	},

	choiceOptions: {
		label: "Answer options (2 to max. 5 options):",
		add: "Add option",
		hint: "Optionally provide synonyms separated by commas, e.g. „orange, tangerine, mandarin“. The first word is the option, all others are synonyms.",
		optionSrLabel: "Option {number}",
		optionPlaceholder: "Option {number}, synonym 1, synonym 2",
		removeAriaLabel: "Remove option {number}",
		duplicate: "Option {number} overlaps with option {otherNumber} (same label or synonym)."
	},

	typeHint: {
		nps: "Net Promoter Score uses a standardized scale from 0 (very unlikely) to 10 (very likely).",
		yesNo: "Yes / no question with two standardized answer options.",
		comment: "Open free-text field for the participant's feedback."
	},

	validation: {
		summaryTitle: "Please fix the following errors:",
		questionTitleRequired: "The question title must not be empty.",
		questionNameRequired: "The question name must not be empty.",
		ratingOptionsInvalid: "Rating options are invalid.",
		ratingMinRange: "Minimum value must be between 0 and 8.",
		ratingMaxRange: "Maximum value must be between 0 and 8.",
		ratingMinLessThanMax: "Minimum value must be smaller than the maximum value.",
		choiceOptionsInvalid: "Answer options are invalid.",
		choiceMinOptions: "A choice question requires at least 2 options.",
		choiceMaxOptions: "A choice question may have a maximum of 5 options.",
		choiceOptionEmpty: "Option {number} must not be empty.",
		choiceOptionDuplicate: "Option {number} overlaps with option {otherNumber} (same label or synonym).",
		followUpMissing: "Follow-up question is missing.",
		followUpOperatorDuplicate: "The comparator \"{operator}\" is already used by follow-up question {number}. Each comparator may only be used once.",
		followUpChoiceValueDuplicate: "This answer option is already used by follow-up question {number}. Each option may only have one follow-up question.",
		surveyTitleRequired: "The survey title must not be empty.",
		surveyNameRequired: "The survey name must not be empty.",
		surveyMinQuestions: "A survey must contain at least 1 question.",
		surveyMaxQuestions: "A survey may contain a maximum of 20 questions (incl. follow-up questions). Currently: {count}."
	},

	deployment: {
		back: "Back to editor",
		backAriaLabel: "Back to editor",
		stage: "Stage",
		prod: "Prod",
		backup: "Backup",
		unnamedSurvey: "Unnamed survey",
		none: "–",
		deployStage: "Deploy to stage",
		deployStageAriaLabel: "Deploy draft to stage",
		deployProd: "Deploy to prod",
		deployProdAriaLabel: "Deploy draft to prod",
		rollback: "Rollback",
		rollbackAriaLabel: "Restore last version to prod",
		unknownError: "Unknown error during deployment"
	},

	queueMapping: {
		title: "Queue mapping",
		queueCount: "{count} queue assigned | {count} queues assigned",
		rate: "{rate}% rate",
		loading: "Loading queue mapping...",
		retry: "Retry",
		intro: "Define which queues this survey is assigned to after call end and with which probability (delivery rate) it should be delivered.",
		deliveryRateLabel: "Delivery rate",
		deliveryRateAriaLabel: "Delivery rate in percent",
		queuesLabel: "Queues (one queue per line)",
		entriesCount: "{count} entry | {count} entries",
		queuesHint: "Enter the exact queue names on separate lines. To completely remove the mapping for this survey, clear the text field and save.",
		conflictHint: "Note: {count} queue is already assigned to another survey: | Note: {count} queues are already assigned to another survey:",
		conflictSurveyId: "current survey ID: {id}",
		conflictFooter: "When saving, you will be asked to confirm before the existing assignment is overwritten.",
		save: "Save queue mapping",
		reset: "Reset changes",
		overwriteConfirm: {
			header: "Overwrite existing assignments?",
			message: "The following queues are currently already assigned to another survey:\n\n{list}\n\nDo you really want to transfer these assignments to the current survey and overwrite the existing ones?",
			listItem: "• {queueName} (survey ID: {surveyId})",
			acceptLabel: "Yes, overwrite",
			rejectLabel: "Cancel"
		},
		toast: {
			savedSummary: "Queue mapping saved",
			savedDetail: "The queue assignments were updated successfully in the data table."
		},
		loadErrorFallback: "Failed to load the queue mapping",
		saveErrorFallback: "Failed to save the queue mapping in the data table"
	},

	controlToolbar: {
		searchPlaceholder: "Search...",
		save: "Save",
		saveAndClose: "Save & close",
		close: "Close",
		edit: "Edit",
		sessionExpired: {
			header: "Session expired",
			message: "Session expired, reactivate?",
			acceptLabel: "Yes",
			rejectLabel: "No"
		},
		toast: {
			lockedSummary: "Locked",
			lockedDetail: "The configuration is currently being edited by: {name}",
			lockSummary: "Lock",
			lockDetail: "The lock is no longer active ({name}).",
			savedSummary: "Saved",
			savedDetail: "Configuration saved{suffix}.",
			savedSuffix: " (Draft v{version})",
			errorSummary: "Error",
			errorDetail: "Save failed."
		}
	},

	app: {
		initErrorSummary: "Error",
		initErrorFallback: "Initialization failed."
	},

	settings: {
		setup: {
			title: "Setup",
			empty: "No setup metadata available.",
			fields: {
				projectTag: "Project Tag",
				domain: "Domain",
				launchUrl: "Launch URL",
				oauthFrontend: "Frontend OAuth",
				integrationApp: "App Integration",
				division: "Division",
				backendGroup: "Backend Group",
				backendRole: "Backend Role",
				backendAuth: "Backend Auth",
				backendClient: "Backend Client",
				dataTable: "Data Table",
				dataActionIntegration: "Data Action Integration",
				dataAction: "Data Action",
				installedAt: "Installed At"
			},
			uninstallHint: "Uninstall removes the resources stored in the setup metadata.",
			uninstall: "Uninstall"
		}
	},

	setup: {
		heroTitle: "Setup",
		logHeader: "Deployment Logs",
		startApp: "Start app",
		backToConfig: "Back to configuration",
		steps: {
			installation: "Installation",
			summary: "Summary"
		},
		step1: {
			title: "Installation",
			description: "Choose app integration, frontend OAuth and the target division for the installation.",
			projectTag: "Project Tag",
			projectTagPlaceholder: "e.g. survey_app",
			integration: "Integration",
			integrationPlaceholder: "Select an integration",
			oauthClient: "OAuth Client",
			oauthClientPlaceholder: "Select an OAuth client",
			division: "Division",
			useExistingDivision: "Use existing division",
			createNewDivision: "Create new division",
			divisionPlaceholder: "Select a division",
			next: "Next"
		},
		step2: {
			title: "Summary",
			description: "A data table, a backend OAuth client and a data action for the rating answers will be created.",
			project: "Project",
			appIntegration: "App Integration",
			oauthClient: "OAuth Client",
			division: "Division",
			newDivision: "New: {name}_division",
			back: "Back",
			start: "Start installation"
		},
		toast: {
			successSummary: "Success",
			successDetail: "Setup completed.",
			errorSummary: "Error",
			errorDetail: "Setup failed. Please check the logs."
		}
	},

	uninstall: {
		heroTitle: "Uninstall project",
		stepTitle: "Remove installed resources",
		installationLabel: "Installation:",
		warning: "This action removes the resources created by the setup from Genesys Cloud. This includes the data table, backend OAuth client and data action integration. Do you want to continue?",
		logHeader: "SYSTEM TERMINAL - UNINSTALL_LOG",
		cancel: "Cancel",
		remove: "Remove installation",
		back: "Back to menu",
		finish: "Finish",
		toast: {
			removedSummary: "Installation removed",
			removedDetail: "The installed app resources were removed.",
			failedSummary: "Deletion failed",
			divisionKeptSummary: "Division retained",
			divisionKeptDetail: "The created division could not be deleted and remains in place."
		}
	},

	questionTypes: {
		rating: "Rating (rating)",
		choice: "Choice (choice)",
		yes_no: "Yes / No (yes_no)",
		nps: "NPS (nps)",
		comment: "Comment / text (comment)",
		commentFollowUp: "Free text / comment (comment)"
	},

	operators: {
		equals: "equals (equals)",
		less_than: "is less than (less_than)",
		greater_than: "is greater than (greater_than)"
	},

	booleanOptions: {
		yes: "Yes (true)",
		no: "No (false)"
	}
};
