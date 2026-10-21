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
		en: "English",
		fr: "Français",
		tlh: "tlhIngan Hol (i18n-Test)",
		la: "Latin (i18n-Test)"
	},

	modules: {
		dashboard: {
			title: "Dashboard",
			description: "Overview of the modules available in the template."
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

	permissions: {
		missingWrite: "Not permitted – write permission is missing.",
		missingDeploy: "Not permitted – deploy permission is missing.",
		missingExport: "Not permitted – permission to export results is missing.",
		readOnlyBanner: "Read-only access: creating, editing, cloning and deleting surveys requires write permission.",
		deployReadOnlyBanner: "Read-only access: deployments, rollback and queue mapping require deploy permission."
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
			invalidIndex: "The survey list (row survey_list) is corrupt and will not be overwritten.",
			unnamedSurvey: "Unnamed survey",
			openAriaLabel: "Open survey: {title}",
			edit: "Edit",
			view: "View",
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
			report: "Report",
			reportAriaLabel: "Go to report view",
			invite: "Invitation links",
			inviteAriaLabel: "Go to invitation links (web)",
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
			baseUrl: "Base URL for invitation links (web)",
			baseUrlHint: "Optional. Absolute https URL, e.g. the page the survey is embedded in. Use {placeholder} to set where the token goes in the link, otherwise ?token=… is appended. Without it, the link points to the Polly survey page.",
			language: "Web survey language",
			webTheme: "Web survey design",
			webThemeHint: "Font, text sizes and colours of the survey page. Managed under Settings → Web designs. A change takes effect after deploying to Prod.",
			webThemeDefault: "Tenant default (Polly design)",
			webThemeDefaultNamed: "Tenant default ({name})",
			webThemeMissing: "The selected design was deleted. The survey uses the default design until you choose another one.",
			webThemeMissingOption: "Deleted design",
			webThemeLoadingOption: "Selected design (loading …)",
			webThemeUnavailableOption: "Selected design (list unavailable)",
			placeholders: {
				title: "e.g. Customer satisfaction",
				description: "Internal description or context for the survey...",
				greeting: "Thank you for taking a moment...",
				closing: "Thank you for your valuable feedback!",
				baseUrl: "https://www.example.com/survey/{placeholder}"
			}
		},
		save: {
			validationErrorSummary: "Validation error",
			validationErrorFallback: "Please fix the highlighted errors before saving.",
			successSummary: "Saved successfully",
			successDetail: "Survey „{title}“ was updated.",
			errorSummary: "Save error",
			errorFallback: "Failed to save the survey in the data table."
		},
		flowSize: {
			warnTitle: "Survey text volume is approaching the limit",
			warnDetail: "The survey uses {percent} % of the maximum text volume ({length} of {max} characters incl. technical data). Above 100 % it can still be saved but no longer deployed.",
			exceededTitle: "Survey text volume is too large",
			exceededDetail: "The survey uses {percent} % of the maximum text volume ({length} of {max} characters incl. technical data). It can be saved as a draft but not deployed. Please shorten longer texts.",
			announceWarn: "Warning: The survey text volume has reached {percent} % of the limit.",
			announceExceeded: "The survey text volume is too large. Deploying is only possible after shortening longer texts.",
			announceOk: "The survey text volume is back within the uncritical range."
		},
		discardConfirm: {
			header: "Discard changes",
			message: "Do you really want to discard all unsaved changes?",
			acceptLabel: "Yes, discard",
			rejectLabel: "Cancel",
			toastSummary: "Reset",
			toastDetail: "Changes were discarded."
		},
		saveConflict: {
			header: "Survey has been changed in the meantime",
			message: "Changes to this survey have been saved in the meantime, e.g. by another user (your version is based on v{expected}, the saved one is v{current}). Do you want to overwrite the saved version with your changes or load the saved version? Loading discards your unsaved changes.",
			overwriteLabel: "Overwrite",
			cancelLabel: "Cancel",
			loadLabel: "Load changes",
			loadedSummary: "Reloaded",
			loadedDetail: "The saved version v{version} has been loaded.",
			loadErrorSummary: "Loading failed"
		},
		deleteConfirm: {
			header: "Delete survey",
			message: "Do you really want to permanently delete the survey „{title}“? All collected results of the survey will be permanently deleted as well.",
			acceptLabel: "Yes, delete",
			rejectLabel: "Cancel",
			successSummary: "Survey deleted",
			successDetail: "The survey „{title}“ was deleted successfully.",
			errorSummary: "Delete error",
			errorFallback: "Failed to delete the survey from the data table.",
			resultsSummary: "Deleting results",
			resultsDetail: "The survey results are being deleted in the background. This may take a while.",
			resultsErrorSummary: "Results not deleted",
			resultsErrorFallback: "The survey was deleted, but deleting its results could not be started."
		}
	},

	surveyLock: {
		unknownUser: "Unknown user",
		conflict: {
			header: "Survey is already being edited",
			message: "This survey has been edited by „{user}“ since {date}. Do you want to edit it anyway or open it read-only?",
			acceptLabel: "Edit anyway",
			rejectLabel: "Read only"
		},
		readOnlyBanner: "Read-only: this survey is currently being edited by „{user}“. Editing is disabled."
	},

	surveyQuestions: {
		title: "Question catalog",
		countStatus: "{count} of a maximum of {max} questions used (incl. follow-up questions)",
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
			detail: "A survey may contain a maximum of {max} questions (incl. follow-up questions)."
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
		valueChoice: "Answer matches option",
		valueOther: "Comparison value",
		choicePlaceholder: "Select option...",
		unnamedOption: "Option ({id})"
	},

	ratingOptions: {
		scaleLabel: "Configure rating scale ({min} to max. {max}):",
		min: "Minimum value ({min} to {max})",
		max: "Maximum value ({min} to {max})",
		previewLabel: "Scale preview:",
		minLabel: "Label for the minimum value (optional)",
		maxLabel: "Label for the maximum value (optional)",
		labelsHint: "Only shown at the ends of the scale in web surveys and not read aloud.",
		minLabelPlaceholder: "e.g. very poor",
		maxLabelPlaceholder: "e.g. excellent"
	},

	choiceOptions: {
		label: "Answer options ({min} to max. {max} options):",
		add: "Add option",
		hint: "Optionally provide synonyms separated by commas, e.g. „orange, tangerine, mandarin“. The first word is the option, all others are synonyms.",
		optionSrLabel: "Option {number}",
		optionPlaceholder: "Option {number}, synonym 1, synonym 2",
		defaultLabel: "Option {number}",
		removeAriaLabel: "Remove option {number}"
	},

	typeHint: {
		nps: "Net Promoter Score uses a standardized scale from 0 (very unlikely) to 10 (very likely).",
		yesNo: "Yes / no question with two standardized answer options.",
		comment: "Open free-text field for the participant's feedback."
	},

	promptTextarea: {
		ttsLimitHint: "Read out by text-to-speech, max. {max} characters.",
		ttsCounter: "{length} of max. {max} characters",
		ttsTooLong: "Text too long: {length} of max. {max} characters. Please shorten the text, otherwise the survey cannot be saved.",
		ttsAnnounceTooLong: "Text too long: {length} of max. {max} characters. The survey cannot be saved like this.",
		ttsAnnounceOk: "Text length is within the limit again."
	},

	validation: {
		summaryTitle: "Please fix the following errors:",
		summaryHint: "Click an error to jump to the affected field.",
		questionTitleRequired: "The question title must not be empty.",
		questionNameRequired: "The question name must not be empty.",
		ratingOptionsInvalid: "Rating options are invalid.",
		ratingMinRange: "Minimum value must be between {min} and {max}.",
		ratingMaxRange: "Maximum value must be between {min} and {max}.",
		ratingMinLessThanMax: "Minimum value must be smaller than the maximum value.",
		choiceOptionsInvalid: "Answer options are invalid.",
		choiceMinOptions: "A choice question requires at least {min} options.",
		choiceMaxOptions: "A choice question may have a maximum of {max} options.",
		choiceOptionEmpty: "Option {number} must not be empty.",
		choiceOptionDuplicate: "Option {number} overlaps with option {otherNumber} (same label or synonym).",
		followUpMissing: "Follow-up question is missing.",
		followUpsNotAllowed: "Comment questions cannot have follow-up questions. Please remove the follow-up questions or choose a different question type.",
		followUpsTooDeep: "Follow-up questions cannot have follow-up questions of their own.",
		followUpValueRequired: "Please enter a valid value for the condition.",
		followUpOperatorDuplicate: "The comparator \"{operator}\" is already used by follow-up question {number}. Each comparator may only be used once.",
		followUpValueDuplicate: "This value is already used by follow-up question {number}. Each possible answer value may only have one follow-up question.",
		surveyTitleRequired: "The survey title must not be empty.",
		surveyNameRequired: "The survey name must not be empty.",
		surveyMinQuestions: "A survey must contain at least 1 question.",
		surveyMaxQuestions: "A survey may contain a maximum of {max} questions (incl. follow-up questions). Currently: {count}.",
		ttsTextTooLong: "“{field}” is too long ({length} of max. {max} characters). Texts read out by text-to-speech may be at most {max} characters long. Please shorten the text.",
		baseUrlInvalid: "The base URL must be a valid, absolute https URL, e.g. https://www.example.com/survey/{placeholder}.",
		baseUrlTokenCount: "The base URL may contain the placeholder {placeholder} at most once.",
		languageInvalid: "Please choose a valid language.",
		webThemeInvalid: "Please choose a valid web design.",
		scaleLabelTooLong: "“{field}” is too long (max. {max} characters)."
	},

	translator: {
		yesNoInvalidValue: "Invalid condition value for question type yes_no: {value}",
		equalsOnly: "Question type {type} only allows the operator \"equals\".",
		duplicateYesNo: "Several follow-up questions for the condition \"{value}\".",
		choiceOptionsMissing: "Question type choice requires answer options (options.labels).",
		unknownLabelId: "Unknown answer option \"{labelId}\" in a follow-up condition.",
		duplicateChoice: "Several follow-up questions for the same answer option \"{labelId}\".",
		ratingOptionsMissing: "Question type rating requires a scale (options.min_value/max_value).",
		duplicateOperator: "Operator \"{operator}\" is used more than once in the follow-up questions.",
		valueNotNumeric: "Condition value \"{value}\" is not a number.",
		commentNoFollowUps: "Question type comment cannot have follow-up questions.",
		unknownType: "Unknown question type \"{type}\".",
		noQuestions: "The survey contains no questions.",
		emptyDraft: "The draft is empty, deployment was cancelled.",
		invalidJson: "The draft could not be read as JSON: {error}",
		questionContext: "{message} (question: {question})"
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
		alreadyInProd: "Version v{version} is already deployed in prod. Deploying to prod again requires a change to the draft.",
		unknownError: "Unknown error during deployment",
		draftChanged: "The draft was changed in the meantime (shown: v{expected}, current: v{current}), e.g. by another user. Nothing was deployed. The view now shows the current state – please review and deploy again.",
		prodChanged: "Prod was changed in the meantime, e.g. by another user's deployment. The rollback was not performed. The view now shows the current state – please review and run the rollback again if needed.",
		payloadTooLarge: "The total text volume of the survey is too large ({length} of max. {max} characters incl. technical data), so it cannot be deployed. Please shorten longer texts in the editor and save the survey again."
	},

	report: {
		back: "Back to editor",
		backAriaLabel: "Back to editor",
		from: "From",
		to: "To",
		range: "Date range",
		quickRanges: {
			today: "Today",
			last7Days: "Last 7 days",
			last30Days: "Last 30 days",
			currentMonth: "Current month",
			lastMonth: "Last month"
		},
		hint: "The date range refers to the start of the survey session (first answer).",
		version: "Survey version",
		allVersions: "All versions",
		versionOption: "v{version} ({sessions})",
		summary: {
			title: "Preview",
			loading: "Loading preview … ({sessions} sessions so far)",
			liveUpdating: "Updates automatically",
			sessions: "Sessions",
			completed: "Completed",
			partial: "In progress",
			timedOut: "Abandoned",
			tooltips: {
				sessions: "All survey participations started in the selected date range (at least one answer).",
				completed: "Participations in which the survey was completed to the end.",
				partial: "Participations that are currently running or whose last answer was less than 30 minutes ago.",
				timedOut: "Participations that were left early (e.g. hung up or chat closed) – 30 minutes without a further answer."
			},
			empty: "There are no sessions in the selected date range."
		},
		download: "Download CSV",
		downloadAriaLabel: "Download CSV report",
		cancel: "Cancel",
		progress: "{sessions} sessions / {rows} rows loaded",
		errors: {
			invalidRange: "Please choose a valid date range (From must not be after To).",
			missingToken: "No Genesys access token available. Please sign in again.",
			generic: "Error while loading the report"
		}
	},

	invitations: {
		back: "Back to editor",
		backAriaLabel: "Back to editor",
		title: "Invitation links",
		prodVersion: "Prod v{version}",
		intro: "Creates personalised links for the web survey. The links point to the current Prod version; a later deploy or rollback automatically applies to links already sent.",
		noProd: "The survey has no Prod version yet. Deploy to Prod first, then invitation links can be created.",
		count: "Number of links",
		countHint: "{min} to {max} links per run",
		expiry: "Expiry date (optional)",
		expiryHint: "Valid up to and including 23:59:59 on that day (your local time). Without a date the links never expire.",
		multi: "Multi use",
		multiHintOn: "Each link can be used to take part any number of times.",
		multiHintOff: "Each link allows exactly one participation.",
		linkTarget: "Link target",
		linkTargetBaseUrl: "Base URL from the saved survey settings:",
		linkTargetFallback: "No base URL set – the links point to the Polly survey page:",
		generate: "Create links and download CSV",
		generateAriaLabel: "Create invitation links and download them as CSV",
		notStoredHint: "The links are not stored. Keep the CSV file; lost links can only be created again.",
		success: "{count} links created, the CSV file has been downloaded.",
		errors: {
			missingToken: "No Genesys access token available. Please sign in again.",
			missingRole: "No permission – deploy rights are missing.",
			noProd: "The survey has no Prod version (any more). Please reload the view.",
			throttled: "Genesys is busy right now. Please try again in a moment.",
			expiryInPast: "The expiry date is in the past.",
			generic: "Error while creating the invitation links"
		}
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
			savedDetail: "The queue assignments were updated successfully."
		},
		loadErrorFallback: "Failed to load the queue mapping",
		saveErrorFallback: "Failed to save the queue mapping in the data table"
	},

	controlToolbar: {
		searchPlaceholder: "Search...",
		close: "Close",
		edit: "Edit",
		toast: {
			lockedSummary: "Locked",
			lockedDetail: "The configuration is currently being edited by: {name}"
		}
	},

	app: {
		initErrorSummary: "Error",
		initErrorFallback: "Initialization failed.",
		sidebarCollapse: "Collapse sidebar",
		sidebarExpand: "Expand sidebar"
	},

	webThemes: {
		title: "Web designs",
		intro: "Designs of the public survey page (font, text styles, colours). Each survey chooses its design in the editor; without a choice the default design applies. Changes to a design reach all surveys using it within 30 seconds.",
		list: {
			loading: "Loading designs …",
			empty: "No designs yet. Without a design the survey page uses the Polly design.",
			default: "Default",
			edit: "Edit",
			view: "View",
			duplicate: "Duplicate",
			delete: "Delete",
			create: "New design",
			newName: "New design",
			copyName: "{name} (copy)",
			updated: "Changed {date}",
			updatedBy: "Changed {date} by {user}",
			limit: "At most {max} designs per tenant."
		},
		editor: {
			name: "Name",
			isDefault: "Tenant default design",
			font: "Font",
			fontHint: "System fonts; no font files are loaded.",
			textStyles: "Text styles",
			textStylesHint: "Size in pixels at the browser's default setting. Zoom and a larger base font of visitors still apply.",
			role: "Text type",
			size: "Size",
			weight: "Weight",
			lineHeight: "Line height",
			reset: "Reset to default",
			resetAll: "Reset all",
			resetRole: "Reset {role} to default",
			resetColor: "Reset {color} to default",
			sizeOf: "Size {role} in pixels, {min} to {max}",
			weightOf: "Weight {role}",
			lineHeightOf: "Line height {role}",
			colors: "Colours",
			transparentBackground: "Transparent background",
			transparentHint: "For embedding in an iframe: the page background becomes transparent, cards keep their surface colour.",
			preview: "Preview",
			previewHint: "Sample survey with all question types. The text type you are editing is highlighted here.",
			previewTitle: "Survey page preview",
			save: "Save",
			cancel: "Cancel"
		},
		roles: {
			heading: "Heading",
			subheading: "Subheading",
			body: "Body text",
			questionTitle: "Question title",
			description: "Description",
			option: "Answer options",
			scaleLabel: "Scale labels",
			hint: "Hints",
			error: "Error texts",
			button: "Button"
		},
		weights: {
			w400: "Regular (400)",
			w500: "Medium (500)",
			w600: "Semibold (600)",
			w700: "Bold (700)"
		},
		fonts: {
			system: "System font",
			sans: "Sans serif (Helvetica, Arial)",
			serif: "Serif (Charter, Georgia)",
			humanist: "Humanist (Seravek, Calibri)",
			rounded: "Rounded"
		},
		colors: {
			background: "Page background",
			surface: "Surfaces (cards)",
			text: "Text",
			heading: "Headings",
			textMuted: "Muted text",
			primary: "Accent colour",
			onPrimary: "Text on accent colour",
			border: "Borders",
			error: "Errors"
		},
		contrast: {
			warning: "Contrast to {background}: {ratio}:1, at least {minimum}:1 (WCAG AA).",
			summary: "Contrast warnings: {count}. You can save, but accessibility according to WCAG 2.2 AA is not assured with this design."
		},
		delete: {
			header: "Delete design",
			message: "Really delete design “{name}”?",
			usedBy: "It is used by these surveys, which will then show the default design: {surveys}.",
			unused: "No survey uses this design.",
			usageUnknown: "Could not check whether surveys use the design; affected surveys will show the default design.",
			accept: "Delete",
			reject: "Cancel"
		},
		toast: {
			saved: "Design “{name}” saved",
			saveFailed: "Design could not be saved",
			deleted: "Design “{name}” deleted",
			deleteFailed: "Design could not be deleted"
		},
		errors: {
			missingToken: "Not signed in. Please reload the app.",
			missingRole: "No permission – deploy rights missing.",
			limitReached: "The maximum number of designs has been reached.",
			conflict: "Someone else changed or deleted the design in the meantime. The list has been reloaded and your input is kept. Saving again overwrites the current version.",
			throttled: "The service is busy. Please try again shortly.",
			generic: "Web design error"
		}
	},

	features: {
		web_survey: {
			label: "Web surveys",
			description: "Surveys via invitation link in the browser, including web designs and web settings in the editor."
		}
	},
	settings: {
		features: {
			title: "Enabled features"
		},
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
				surveyDataTable: "Survey data table",
				mappingDataTable: "Queue mapping data table",
				dataActionIntegration: "Data Action Integration",
				dataAction: "Data Action",
				installedAt: "Installed At"
			},
			uninstallHint: "Uninstall removes the resources stored in the setup metadata.",
			update: "Update bot flow",
			updateHint: "The update replaces the bot flow with the current bundled template. Custom flow changes are overwritten.",
			updateSuccess: "Bot flow updated",
			updateSuccessDetail: "The bot flow was successfully updated from the current template.",
			updateFailed: "Could not update bot flow",
			exportTemplates: "Export flow templates",
			exportMissing: "Bot flow or inbound flow is missing in the setup metadata.",
			exportSuccess: "Bot flow and inbound flow were exported with placeholders.",
			exportFailed: "Error exporting the flows.",
			uninstall: "Uninstall"
		}
	},

	setup: {
		heroTitle: "Setup",
		logHeader: "Deployment Logs",
		startApp: "Start app",
		backToConfig: "Back to configuration",
		rollback: "Rollback",
		permissions: {
			title: "Missing installer permissions",
			description: "The following permissions are required for installation and rollback.",
			available: "Available",
			missing: "Missing",
			warningTitle: "Some setup options are restricted",
			divisionHint: "Without permissions to create and delete a division, only an existing division can be used.",
			checkedTitle: "Permissions checked",
			checkedDetail: "Installer permissions are available.",
			loadErrorTitle: "Setup data could not be loaded",
			retry: "Retry",
			requirements: {
				groupsManage: "Create, view and delete groups",
				rolesManage: "Manage roles and grants",
				integrationsView: "View integrations",
				integrationsManage: "Manage integrations and data actions",
				oauthManage: "View and modify OAuth clients",
				divisionsView: "View divisions",
				datatableManage: "Manage Architect data tables and rows",
				flowsManage: "Manage Architect flows",
				divisionCreate: "Create and delete a division"
			}
		},
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
			surveyDataTable: "Survey data table",
			mappingDataTable: "Queue mapping data table",
			dataTableHint: "Full names of the data tables. If a table with this name already exists, it is reused and not deleted on uninstall.",
			dataTableNamesCollide: "The two data tables need different names.",
			features: "Features",
			featuresHint: "The selection is stored in the __meta row and can only be changed directly in the data table after installation.",
			next: "Next"
		},
		step2: {
			title: "Summary",
			description: "The data tables, a backend OAuth client and a data action for the rating answers will be created.",
			project: "Project",
			appIntegration: "App Integration",
			oauthClient: "OAuth Client",
			division: "Division",
			newDivision: "New: {name}_division",
			features: "Features",
			noFeatures: "None",
			surveyDataTable: "Survey data table",
			mappingDataTable: "Queue mapping data table",
			back: "Back",
			start: "Start installation"
		},
		toast: {
			successSummary: "Success",
			successDetail: "Setup completed.",
			errorSummary: "Error",
			errorDetail: "Setup failed. Please check the logs.",
			rollbackSummary: "Rollback completed",
			rollbackDetail: "The resources already created have been removed.",
			rollbackErrorSummary: "Rollback failed"
		}
	},

	uninstall: {
		heroTitle: "Uninstall project",
		stepTitle: "Remove installed resources",
		installationLabel: "Installation:",
		warning: "This action removes the Genesys resources created by the setup, including both flows, both data tables, the data action and backend OAuth client. The backend tenant is marked as deleted for later admin cleanup. Do you want to continue?",
		logHeader: "SYSTEM TERMINAL - UNINSTALL_LOG",
		cancel: "Cancel",
		remove: "Remove installation",
		retry: "Retry",
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
