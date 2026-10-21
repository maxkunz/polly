import type { MessageSchema } from "./de";

// Klingonische Testsprache (tlhIngan Hol): um zu prüfen, ob alle UI-Texte aus i18n kommen.
export const tlh: MessageSchema = {
	common: {
		back: "yIchegh",
		backToOverview: "Hoch leghmeH yIchegh",
		cancel: "yIqIl",
		save: "yIpol",
		delete: "yIQaw'",
		edit: "yIchoH",
		close: "yISoQmoH",
		discard: "yIwoD",
		unknownUser: "lo'wI' Sovbe'lu'bogh",
		otherUser: "latlh lo'wI'",
		unknownError: "Qagh Sovbe'lu'bogh",
		selection: "wIvmeH"
	},

	language: {
		title: "Hol / Language",
		label: "Hol",
		de: "Deutsch",
		en: "English",
		fr: "Français",
		tlh: "tlhIngan Hol (Klingonisch)",
		la: "Latin (i18n-Test)"
	},

	modules: {
		dashboard: {
			title: "SeHlaw",
			description: "mIw nav ghunmey Hoch Dalegh."
		},
		surveys: {
			title: "yu'ghItlhmey",
			description: "yu'ghItlhmey chenmoH, SeH 'ej noH.",
			unnamedSurvey: "yu'ghItlh {index}"
		},
		settings: {
			title: "SeHmey",
			description: "Hoch SeHmey 'ej jommeH De'."
		}
	},

	dashboard: {
		title: "SeHlaw"
	},

	permissions: {
		missingWrite: "chaw'be'lu' – ghItlhmeH chaw' Daghajbe'.",
		missingDeploy: "chaw'be'lu' – ngeHmeH chaw' Daghajbe'.",
		missingExport: "chaw'be'lu' – jangmey lI'meH chaw' Daghajbe'.",
		readOnlyBanner: "laD neH: yu'ghItlhmey DachenmoHmeH, DachoHmeH, Daqa'moHmeH, DaQaw'meH ghItlhmeH chaw' DaghajnIS.",
		deployReadOnlyBanner: "laD neH: ngeHmeH, Rollback, tlhegh nobmeH ngeHmeH chaw' DaghajnIS."
	},

	surveys: {
		searchPlaceholder: "yu'ghItlh yInej...",
		actions: {
			back: "Hoch leghmeH yIchegh",
			new: "yu'ghItlh chu'",
			reload: "yu'ghItlhmey yIlI'qa'"
		},
		newSurveyTitle: "yu'ghItlh chu'",
		cloneSurveyTitle: "yu'ghItlh yIqa'moH",
		leaveConfirm: {
			header: "choHmey polbe'lu'bogh",
			message: "choHmey polbe'lu'bogh Daghaj. nav DamejneS'a'?",
			queueMappingMessage: "tlhegh nobmeH choHmey polbe'lu'bogh Daghaj. nav DamejneS'a'?",
			acceptLabel: "yImej",
			rejectLabel: "yIratlh"
		},
		detail: {
			loading: "yu'ghItlh De' lI'lu'taH...",
			errorTitle: "yu'ghItlh lI'lu'DI' Qagh",
			emptyDraft: "ID vam yu'ghItlh De' tu'lu'be'.",
			loadErrorFallback: "yu'ghItlh '{id}' lI'lu'DI' Qagh",
			rowNotFound: "Data Table Daq '{key}' tlhegh tu'lu'be'."
		},
		list: {
			availableCount: "yu'ghItlhmey tu'lu'bogh ({count})",
			loading: "yu'ghItlh De' lI'lu'taH...",
			loadErrorFallback: "yu'ghItlh lI'lu'DI' Qagh",
			invalidIndex: "yu'ghItlh tetlh (tlhegh survey_list) QIHlu'pu'; tamlu'be'.",
			unnamedSurvey: "yu'ghItlh pongbe'",
			openAriaLabel: "yu'ghItlh yIpoSmoH: {title}",
			edit: "yIchoH",
			view: "yIlegh",
			emptySearch: "nejmeH yu'ghItlhmey tu'lu'be'.",
			empty: "yu'ghItlhmey tu'lu'be'."
		}
	},

	surveyEditor: {
		toolbar: {
			back: "Hoch leghmeH yIchegh",
			backAriaLabel: "yu'ghItlhmey leghmeH yIchegh",
			statusUnsaved: "polbe'lu'",
			statusSaved: "pollu'pu'",
			discard: "yIwoD",
			delete: "yIQaw'",
			deleteAriaLabel: "yu'ghItlh yIQaw'",
			clone: "yIqa'moH",
			cloneAriaLabel: "yu'ghItlh yIqa'moH",
			deploy: "yIngeH",
			deployAriaLabel: "ngeHmeH leghmeH yIjaH",
			report: "ja'",
			reportAriaLabel: "ja' leghmeH yIjaH",
			invite: "rItlh mu'mey",
			inviteAriaLabel: "rItlh mu'mey leghmeH yIjaH",
			save: "yIpol"
		},
		stickyBar: {
			unsaved: "● choHmey polbe'lu'bogh tu'lu'",
			allSaved: "✓ Hoch choHmey pollu'pu'",
			back: "yIchegh",
			save: "yu'ghItlh yIpol"
		},
		meta: {
			title: "yu'ghItlh SeHmey Hoch",
			surveyTitle: "yu'ghItlh per",
			technicalName: "De'wI' pong (per 'ej ID vo' chenlu')",
			description: "Delmey",
			greeting: "nuqneH QIn",
			closing: "Qapla' QIn",
			baseUrl: "Web QIn ra'ghom URL (Web)",
			baseUrlHint: "ghItlh. https URL, {placeholder} 'ej ?token=…. URL vItlhutlh: Polly QIn ra'ghom.",
			language: "Web QIn Hol",
			webTheme: "Web QIn HablI'",
			webThemeHint: "ngutlh, tIn, rItlh. SeHmey → Web HablI'mey. Prod vIngeHDI' Qap.",
			webThemeDefault: "motlh HablI' (Polly)",
			webThemeDefaultNamed: "motlh HablI' ({name})",
			webThemeMissing: "HablI' Qaw'lu'. motlh HablI' lo'.",
			webThemeMissingOption: "HablI' Qaw'lu'bogh",
			webThemeLoadingOption: "HablI' wIvlu'bogh (lI'lu' …)",
			webThemeUnavailableOption: "HablI' wIvlu'bogh (tetlh tu'lu'be')",
			placeholders: {
				title: "mu'mey: ghotpu' belmoH",
				description: "yu'ghItlh Del qoD...",
				greeting: "poH Danobmo' qatlho'...",
				closing: "QIn lo'laH Danobmo' qatlho'!",
				baseUrl: "https://www.example.com/survey/{placeholder}"
			}
		},
		save: {
			validationErrorSummary: "'ol Qagh",
			validationErrorFallback: "pollu'pa' Qaghmey 'angbogh yItI'.",
			successSummary: "Qapla'! pollu'pu'",
			successDetail: "yu'ghItlh „{title}“ chu'moHlu'pu'.",
			errorSummary: "pol Qagh",
			errorFallback: "Data Table Daq yu'ghItlh pollu'DI' Qagh."
		},
		flowSize: {
			warnTitle: "yu'ghItlh ghItlh veH Sum",
			warnDetail: "yu'ghItlh ghItlh {percent} % lo' ({length} / {max} ngutlh, De'wI' De' tu'lu'). 100 % Dung pollaH 'ach ngeHlaHbe'.",
			exceededTitle: "yu'ghItlh ghItlh tIn law'qu'",
			exceededDetail: "yu'ghItlh ghItlh {percent} % lo' ({length} / {max} ngutlh, De'wI' De' tu'lu'). Draft pollaH 'ach ngeHlaHbe'. ghItlhmey tIn yIHabmoH.",
			announceWarn: "yIqIm: yu'ghItlh ghItlh veH {percent} % paw'.",
			announceExceeded: "yu'ghItlh ghItlh tIn law'qu'. ghItlhmey tIn DaHabmoHDI' neH ngeHlaH.",
			announceOk: "yu'ghItlh ghItlh veH qoD ratlh."
		},
		discardConfirm: {
			header: "choHmey yIwoD",
			message: "choHmey polbe'lu'bogh Hoch DawoDneS'a'?",
			acceptLabel: "HIja', yIwoD",
			rejectLabel: "yIqIl",
			toastSummary: "choHHa'lu'pu'",
			toastDetail: "choHmey woDlu'pu'."
		},
		saveConflict: {
			header: "yu'ghItlh choHta' latlh",
			message: "yu'ghItlh vam choHmey pollu'ta' (v{expected} Dalo', v{current} pollu'). choHmeylIj DapollaHneS'a' pagh v{current} DalI'neS'a'? DalI'chugh choHmeylIj chImmo' Qaw'lu'.",
			overwriteLabel: "yIQaw'",
			cancelLabel: "yIqIl",
			loadLabel: "choHmey yIlI'",
			loadedSummary: "lI'lu'pu'",
			loadedDetail: "v{version} lI'lu'pu'.",
			loadErrorSummary: "lI'laHbe'"
		},
		deleteConfirm: {
			header: "yu'ghItlh yIQaw'",
			message: "yu'ghItlh „{title}“ DaQaw'qu'neS'a'? yu'ghItlh jangmey Hoch Qaw'lu'qu' je.",
			acceptLabel: "HIja', yIQaw'",
			rejectLabel: "yIqIl",
			successSummary: "yu'ghItlh Qaw'lu'pu'",
			successDetail: "yu'ghItlh „{title}“ Qaw'lu'pu'. Qapla'!",
			errorSummary: "Qaw'lu'DI' Qagh",
			errorFallback: "Data Table vo' yu'ghItlh Qaw'lu'DI' Qagh.",
			resultsSummary: "jangmey Qaw'lu'taH",
			resultsDetail: "yu'ghItlh jangmey Qaw'lu'taH Qa'Hom. poH nI' tlhaplaH.",
			resultsErrorSummary: "jangmey Qaw'lu'be'",
			resultsErrorFallback: "yu'ghItlh Qaw'lu'pu' 'ach jangmey Qaw'meH tagh Qapbe'."
		}
	},

	surveyLock: {
		unknownUser: "lo'wI' Sovbe'lu'bogh",
		conflict: {
			header: "yu'ghItlh choHtaH latlh",
			message: "{date} vo' „{user}“ yu'ghItlh vam choHtaH. DachoHneS'a' pagh DalaDneS'a' neH?",
			acceptLabel: "yIchoH, vaj",
			rejectLabel: "laD neH"
		},
		readOnlyBanner: "laD neH: DaH yu'ghItlh vam choHtaH „{user}“. choHlu'laHbe'."
	},

	surveyQuestions: {
		title: "yu'mey tetlh",
		countStatus: "{count} yu' / {max} yu' law'qu' lo'lu' (tlha' yu'mey tu'lu')",
		maxReached: "veH paw'lu'pu'",
		addQuestion: "yu' yIchel",
		addQuestionAriaLabel: "yu'ghItlh yu' chu' yIchel",
		addAnotherAriaLabel: "yu'ghItlh latlh yu' yIchel",
		empty: {
			title: "yu'ghItlh vam yu'mey ghajbe' DaH.",
			description: "yu' wa'DIch yIchenmoH; yu'ghItlh SeH yItagh.",
			cta: "yu' wa'DIch yIchenmoH"
		},
		limitToast: {
			summary: "veH paw'lu'pu'",
			detail: "yu'ghItlh {max} yu' law'qu' ghajlaH (tlha' yu'mey tu'lu')."
		}
	},

	surveyQuestion: {
		numberAriaLabel: "yu' mI'",
		mandatoryTag: "ponglu'nIS",
		moveUpAriaLabel: "yu' {number} Dung yIvIHmoH",
		moveDownAriaLabel: "yu' {number} bIng yIvIHmoH",
		delete: "yIQaw'",
		deleteAriaLabel: "yu' {number} yIQaw'",
		deleteConfirm: {
			header: "yu' yIQaw'",
			message: "„{title}“ 'ej tlha' yu'mey Hoch DaQaw'qu'neS'a'?",
			acceptLabel: "yIQaw'",
			rejectLabel: "yIqIl",
			fallbackTitle: "yu' #{number}"
		},
		followUps: {
			title: "tlha' yu'mey chut ghajbogh ({count})",
			hint: "jang chut Qapchugh neH 'anglu'.",
			add: "tlha' yu' yIchel",
			addAriaLabel: "yu' {number} tlha' yu' yIchel"
		}
	},

	surveyQuestionFields: {
		technicalName: "De'wI' pong (pong)",
		technicalNameHintShort: "(ja'meH choHlaHbe'lu')",
		technicalNameHint: "ja'meH pong lo'lu'; choHlaHbe'lu'.",
		type: "yu' Segh",
		typeSavedHint: "(pollu'pu' - Segh choHlaHbe'lu')",
		mandatory: "yu' jangnISlu'bogh",
		title: "per / ghel",
		titlePlaceholder: "mu'mey: QaHmeH Qu'maj Dabelpu''a'?",
		reprompt: "ghelqa' (Reprompt)",
		repromptPlaceholder: "yu' jangmeH ghel cha'DIch (DuH).",
		description: "Delmey / QaHmeH ghItlh",
		descriptionPlaceholder: "jangwI'vaD De' chel..."
	},

	surveyFollowUp: {
		legend: "tlha' yu' #{number}",
		fieldsetAriaLabel: "tlha' yu' {number}",
		delete: "yIQaw'",
		deleteAriaLabel: "tlha' yu' {number} yIQaw'",
		deleteConfirm: {
			header: "tlha' yu' yIQaw'",
			message: "tlha' yu' vam DateqneS'a'?",
			acceptLabel: "yIQaw'",
			rejectLabel: "yIqIl"
		},
		title: "per / ghel",
		titlePlaceholder: "mu'mey: chay' bInoHpu'?",
		type: "yu' Segh",
		typeSavedHint: "(pollu'pu' - Segh choHlaHbe'lu')",
		reprompt: "ghelqa' (Reprompt)",
		repromptPlaceholder: "yu' jangmeH ghel cha'DIch (DuH).",
		description: "Delmey / QaHmeH ghItlh",
		descriptionPlaceholder: "ghotvaD QIj chel..."
	},

	surveyCondition: {
		label: "'angmeH chut:",
		operator: "ruchwI'",
		valueChoice: "jang wIv rap",
		valueOther: "rapmeH mI'",
		choicePlaceholder: "wIv yIwIv...",
		unnamedOption: "wIv ({id})"
	},

	ratingOptions: {
		scaleLabel: "noHmeH juv yISeH ({min} vo' {max} law'qu'):",
		min: "mI' mach ({min} vo' {max})",
		max: "mI' tIn ({min} vo' {max})",
		previewLabel: "juv leghpa':",
		minLabel: "Du'wI' Dop (ghItlh)",
		maxLabel: "Du'wI' Dop law' (ghItlh)",
		labelsHint: "Web QIn neH. ghoSbe' jIme'.",
		minLabelPlaceholder: "tlhoy chu'",
		maxLabelPlaceholder: "Qapla'"
	},

	choiceOptions: {
		label: "wIvmey ({min} vo' {max} wIvmey law'qu'):",
		add: "wIv yIchel",
		hint: "rap mu'mey DuH, ',' wIvmey: „naH, naH Doq, naH tlhIQ“. mu' wa'DIch wIv 'oH; latlh mu'mey rap mu'mey bIH.",
		optionSrLabel: "wIv {number}",
		optionPlaceholder: "wIv {number}, rap mu' 1, rap mu' 2",
		defaultLabel: "wIv {number}",
		removeAriaLabel: "wIv {number} yIteq"
	},

	typeHint: {
		nps: "Net Promoter Score juv motlh lo': 0 (DuHbe'qu') vo' 10 (DuHqu').",
		yesNo: "HIja' / ghobe' yu': cha' jang motlh.",
		comment: "ghotvaD QIn ghItlhmeH Daq poS."
	},

	promptTextarea: {
		ttsLimitHint: "TTS jatlh, {max} ngutlh law'qu'.",
		ttsCounter: "{length} / {max} ngutlh law'qu'",
		ttsTooLong: "ghItlh tIq law'qu': {length} / {max} ngutlh law'qu'. ghItlh yIHabmoH; pagh yu'ghItlh pollaHbe'lu'.",
		ttsAnnounceTooLong: "ghItlh tIq law'qu': {length} / {max} ngutlh law'qu'. yu'ghItlh pollaHbe'lu'.",
		ttsAnnounceOk: "ghItlh tIq veH qoD ratlh."
	},

	validation: {
		summaryTitle: "Qaghmey vam yItI':",
		summaryHint: "Qagh yIwIv; Daq Qaghbogh DaSuvchoH.",
		questionTitleRequired: "yu' per chImlaHbe'.",
		questionNameRequired: "yu' pong chImlaHbe'.",
		ratingOptionsInvalid: "noHmeH wIvmey lughbe'.",
		ratingMinRange: "mI' mach {min} {max} je joj tu'lu'nIS.",
		ratingMaxRange: "mI' tIn {min} {max} je joj tu'lu'nIS.",
		ratingMinLessThanMax: "mI' mach mach law' mI' tIn mach puS 'e' poQlu'.",
		choiceOptionsInvalid: "wIvmey lughbe'.",
		choiceMinOptions: "wIv yu' {min} wIvmey rav ghajnIS.",
		choiceMaxOptions: "wIv yu' {max} wIvmey law'qu' ghajlaH.",
		choiceOptionEmpty: "wIv {number} chImlaHbe'.",
		choiceOptionDuplicate: "wIv {number} wIv {otherNumber} je rap (per pagh rap mu' rap).",
		followUpMissing: "tlha' yu' tu'lu'be'.",
		followUpsNotAllowed: "QIn yu' tlha' yu'mey ghajlaHbe'. tlha' yu'mey yIteq pagh latlh yu' Segh yIwIv.",
		followUpsTooDeep: "tlha' yu'mey tlha' yu'mey ghajlaHbe'.",
		followUpValueRequired: "chutvaD mI' lugh yInob.",
		followUpOperatorDuplicate: "ruchwI' „{operator}“ lo'pu' tlha' yu' {number}. wa'logh neH ruchwI' lo'lu'.",
		followUpValueDuplicate: "mI' vam lo'pu' tlha' yu' {number}. jang mI' wa' tlha' yu' wa' neH ghaj.",
		surveyTitleRequired: "yu'ghItlh per chImlaHbe'.",
		surveyNameRequired: "yu'ghItlh pong chImlaHbe'.",
		surveyMinQuestions: "yu meq 1 yu' rav ghajnIS.",
		surveyMaxQuestions: "yu'ghItlh {max} yu' law'qu' ghajlaH (tlha' yu'mey tu'lu'). DaH: {count}.",
		ttsTextTooLong: "„{field}“ tIq law'qu' ({length} / {max} ngutlh law'qu'). TTS ghItlh {max} ngutlh law'qu' ghajlaH. ghItlh yIHabmoH.",
		baseUrlInvalid: "URL https vaj. {placeholder}.",
		baseUrlTokenCount: "{placeholder} wa'logh neH.",
		languageInvalid: "Hol Dayaj.",
		webThemeInvalid: "HablI' lI' yIwIv.",
		scaleLabelTooLong: "„{field}“ tIq law'qu' ({max} ngutlh law')."
	},

	translator: {
		yesNoInvalidValue: "yes_no yu' Segh mab mIw lughbe': {value}",
		equalsOnly: "{type} yu' Segh \"equals\" neH chaw'.",
		duplicateYesNo: "\"{value}\" mab tlha' yu'mey law' tu'lu'.",
		choiceOptionsMissing: "choice yu' Segh wIvmey (options.labels) poQ.",
		unknownLabelId: "tlha' yu' mab wIv Sovbe'lu'bogh \"{labelId}\" tu'lu'.",
		duplicateChoice: "wIv \"{labelId}\" tlha' yu'mey law' tu'lu'.",
		ratingOptionsMissing: "rating yu' Segh Hutlh (options.min_value/max_value) poQ.",
		duplicateOperator: "\"{operator}\" ra'wI' tlha' yu'mey law' lo'lu'.",
		valueNotNumeric: "mab mIw \"{value}\" mI' ghaHbe'.",
		commentNoFollowUps: "comment yu' Segh tlha' yu'mey ghajlaHbe'.",
		unknownType: "yu' Segh Sovbe'lu'bogh \"{type}\".",
		noQuestions: "yu'ghItlh yu'mey ghajbe'.",
		emptyDraft: "Draft chIm, Deployment mev.",
		invalidJson: "Draft JSON laDlaHbe'lu': {error}",
		questionContext: "{message} (yu': {question})"
	},

	deployment: {
		back: "choHwI' yIchegh",
		backAriaLabel: "choHwI' yIchegh",
		stage: "Stage 'ay'",
		prod: "Prod 'ay'",
		backup: "Backup 'ay'",
		unnamedSurvey: "yu'ghItlh pongbe'",
		none: "–",
		deployStage: "Stage Daq yIngeH",
		deployStageAriaLabel: "Draft Stage Daq yIngeH",
		deployProd: "Prod Daq yIngeH",
		deployProdAriaLabel: "Draft Prod Daq yIngeH",
		rollback: "Rollback yIchegh",
		rollbackAriaLabel: "Prod Daq mI' Qav yIcheghmoH",
		alreadyInProd: "mI' v{version} Prod Daq ngeHlu'pu'. Draft DachoHDI' neH Prod Daq ngeHqa'laH.",
		unknownError: "ngeHlu'DI' Qagh Sovbe'lu'bogh",
		draftChanged: "Draft choHlu'pu' (leghlu'bogh: v{expected}, DaH: v{current}), latlh lo'wI' choHpu' DichDaq. pagh ngeHlu'pu'. DaH Dotlh 'anglu' – yIlegh 'ej yIngeHqa'.",
		prodChanged: "Prod choHlu'pu', latlh lo'wI' ngeHpu' DichDaq. Rollback ta'lu'be'. DaH Dotlh 'anglu' – yIlegh 'ej Rollback yIta'qa' DaneHchugh.",
		payloadTooLarge: "yu'ghItlh ghItlh Hoch tIn law'qu' ({length} / {max} ngutlh law'qu', De'wI' De' tu'lu'); ngeHlaHbe'lu'. choHwI' Daq ghItlhmey tIn yIHabmoH 'ej yu'ghItlh yIpolqa'."
	},

	report: {
		back: "choHwI' yIchegh",
		backAriaLabel: "choHwI' yIchegh",
		from: "vo'",
		to: "paw'",
		range: "poH",
		quickRanges: {
			today: "DaHjaj",
			last7Days: "Soch jaj Qav",
			last30Days: "wejmaH jaj Qav",
			currentMonth: "jar DaH",
			lastMonth: "jar Qav"
		},
		hint: "yu'ghItlh qep tagh (jang wa'DIch) poH 'oH.",
		version: "yu'ghItlh mI'",
		allVersions: "mI'mey Hoch",
		versionOption: "v{version} ({sessions} qep)",
		summary: {
			title: "leghpa'",
			loading: "leghpa' lI'lu'taH … ({sessions} qep DaH)",
			liveUpdating: "nIteb chu'moH",
			sessions: "qepmey",
			completed: "rInpu'",
			partial: "taHtaH",
			timedOut: "mevpu'",
			tooltips: {
				sessions: "poH wIvlu'bogh Daq yu'ghItlh qepmey taghlu'pu'bogh Hoch (jang wa' rav).",
				completed: "qepmey yu'ghItlh rInpu'bogh.",
				partial: "qepmey taHtaHbogh pagh jang Qav wejmaH tup puS ghajbogh.",
				timedOut: "qepmey mejpu'bogh (ghogh HablI' ngaQmoHpu' pagh QIn SoQmoHpu') – wejmaH tup jangbe'lu'."
			},
			empty: "poH wIvlu'bogh Daq qepmey tu'lu'be'."
		},
		download: "CSV yIlI'",
		downloadAriaLabel: "CSV ja' yIlI'",
		cancel: "yIqIl",
		progress: "{sessions} qepmey / {rows} tlheghmey lI'lu'pu'",
		errors: {
			invalidRange: "poH lugh yIwIv (vo' paw' tlha'laHbe').",
			missingToken: "Genesys 'elmeH ngoq tu'lu'be'. yI'elqa'.",
			generic: "ja' lI'lu'DI' Qagh"
		}
	},

	invitations: {
		back: "choHwI' yIchegh",
		backAriaLabel: "choHwI' yIchegh",
		title: "rItlh mu'mey",
		prodVersion: "Prod v{version}",
		intro: "Daq Sep rItlh mu'mey chenmoH. Prod Sep DaH lo'.",
		noProd: "Prod Sep tu'be'lu'. wa'DIch Prod yIngeH.",
		count: "rItlh mu'mey mI'",
		countHint: "{min} - {max} rItlh mu'mey",
		expiry: "Qaw'meH jaj (DuH)",
		expiryHint: "jaj pIq 23:59:59 ruch. jaj tu'be'lu'chugh, not Qaw'.",
		multi: "law' lo'laH",
		multiHintOn: "rItlh mu' law' lo'laH.",
		multiHintOff: "rItlh mu' wa'logh lo'laH.",
		linkTarget: "rItlh mu'mey ngoQ",
		linkTargetBaseUrl: "Daq lurDech:",
		linkTargetFallback: "Daq lurDech tu'be'lu' – Polly Daq lo':",
		generate: "rItlh mu'mey yIchenmoH 'ej CSV yIlI'",
		generateAriaLabel: "rItlh mu'mey yIchenmoH 'ej CSV yIlI'",
		notStoredHint: "rItlh mu'mey pollu'be'. CSV yIpol.",
		success: "{count} rItlh mu'mey chenmoHlu'. CSV lI'lu'.",
		errors: {
			missingToken: "Genesys ngoq tu'be'lu'. yI'el.",
			missingRole: "chaw' tu'be'lu' – ngeHmeH chaw' tu'be'lu'.",
			noProd: "Prod Sep tu'be'lu'. yIchu'qa'.",
			throttled: "Genesys Qu' law'. tugh yInIDqa'.",
			expiryInPast: "Qaw'meH jaj ret.",
			generic: "rItlh mu'mey chenmoHmeH Qagh"
		}
	},

	queueMapping: {
		title: "tlhegh nobmeH",
		queueCount: "{count} tlhegh nobta'lu' | {count} tlheghmey nobta'lu'",
		rate: "{rate}% DuH",
		loading: "tlhegh nobmeH lI'lu'taH...",
		retry: "yInIDqa'",
		intro: "ghogh rInDI' tlheghmey yu'ghItlh vam nobta'lu'bogh 'ej DuH (Delivery Rate) yIwIv.",
		deliveryRateLabel: "noblu'meH DuH (Delivery Rate)",
		deliveryRateAriaLabel: "noblu'meH DuH vatlhvI'",
		queuesLabel: "tlheghmey (tlhegh wa' wa')",
		entriesCount: "{count} tlhegh | {count} tlheghmey",
		queuesHint: "tlhegh pongmey lugh tlhegh wa' wa' yIghItlh. yu'ghItlh vam nobmeH Hoch DateqmeH ghItlh Daq yIchImmoH 'ej yIpol.",
		conflictHint: "yIqIm: {count} tlhegh latlh yu'ghItlh nobta'lu'pu': | yIqIm: {count} tlheghmey latlh yu'ghItlh nobta'lu'pu':",
		conflictSurveyId: "yu'ghItlh DaH ID: {id}",
		conflictFooter: "DapolDI', nob ngo' DatampaH Da'olmoHnIS.",
		save: "tlhegh nobmeH yIpol",
		reset: "choHmey yIchoHHa'",
		overwriteConfirm: {
			header: "nobmey ngo' DatamneS'a'?",
			message: "tlheghmey vam latlh yu'ghItlh nobta'lu'pu' DaH:\n\n{list}\n\nyu'ghItlh DaHvaD nobmey vam DanoHneS'a' 'ej nobmey ngo' DatamneS'a'?",
			listItem: "• {queueName} (yu'ghItlh ID: {surveyId})",
			acceptLabel: "HIja', yItam",
			rejectLabel: "yIqIl"
		},
		toast: {
			savedSummary: "tlhegh nobmeH pollu'pu'",
			savedDetail: "tlhegh nobmey chu'moHlu'pu'. Qapla'!"
		},
		loadErrorFallback: "tlhegh nobmeH lI'lu'DI' Qagh",
		saveErrorFallback: "Data Table Daq tlhegh nobmeH pollu'DI' Qagh"
	},

	controlToolbar: {
		searchPlaceholder: "yInej...",
		close: "yISoQmoH",
		edit: "yIchoH",
		toast: {
			lockedSummary: "ngaQ",
			lockedDetail: "SeH choHtaH: {name}"
		}
	},

	app: {
		initErrorSummary: "Qagh",
		initErrorFallback: "taghmoHlu'DI' luj.",
		sidebarCollapse: "retlh nav yISo'",
		sidebarExpand: "retlh nav yI'ang"
	},

	webThemes: {
		title: "Web HablI'mey",
		intro: "QIn ra'ghom HablI'mey (ngutlh, tIn, rItlh). Hoch QIn HablI' wIv. wIvbe'chugh motlh HablI' lo'. 30 lup Qap.",
		list: {
			loading: "HablI'mey lI'lu' …",
			empty: "HablI' tu'lu'be'. Polly HablI' lo'.",
			default: "motlh",
			edit: "choH",
			view: "legh",
			duplicate: "cha'logh",
			delete: "Qaw'",
			create: "HablI' chu'",
			newName: "HablI' chu'",
			copyName: "{name} (cha'logh)",
			updated: "choHlu' {date}",
			updatedBy: "{user} choH {date}",
			limit: "{max} HablI'mey neH."
		},
		editor: {
			name: "pong",
			isDefault: "motlh HablI'",
			font: "ngutlh",
			fontHint: "pat ngutlh neH.",
			textStyles: "ngutlh mIw",
			textStylesHint: "pixel tIn.",
			role: "ngutlh Segh",
			size: "tIn",
			weight: "ngI'",
			lineHeight: "tlhegh 'aD",
			reset: "motlh",
			resetAll: "Hoch motlh",
			resetRole: "{role} motlh",
			resetColor: "{color} motlh",
			sizeOf: "{role} tIn, {min} {max}",
			weightOf: "{role} ngI'",
			lineHeightOf: "{role} tlhegh 'aD",
			colors: "rItlh",
			transparentBackground: "Hegh botlh leghlaHbe'",
			transparentHint: "iframe: botlh leghlaHbe'.",
			preview: "legh",
			previewHint: "QIn ghantoH. ngutlh Segh DawoHlu'.",
			previewTitle: "QIn ra'ghom legh",
			save: "choq",
			cancel: "mev"
		},
		roles: {
			heading: "nIqHom",
			subheading: "nIqHom mach",
			body: "ghItlh",
			questionTitle: "ghel per",
			description: "Delmey",
			option: "jang",
			scaleLabel: "juv per",
			hint: "ghuH",
			error: "Qagh",
			button: "leQ"
		},
		weights: {
			w400: "motlh (400)",
			w500: "ngI' (500)",
			w600: "ngI'qu' (600)",
			w700: "ngI'qu'qu' (700)"
		},
		fonts: {
			system: "pat ngutlh",
			sans: "DuH Hutlh",
			serif: "DuH ghaj",
			humanist: "ghot ngutlh",
			rounded: "ngoS"
		},
		colors: {
			background: "botlh",
			surface: "Hal",
			text: "ghItlh",
			heading: "nIqHom",
			textMuted: "ghItlh QIb",
			primary: "rItlh Daq",
			onPrimary: "rItlh Daq ghItlh",
			border: "veH",
			error: "Qagh"
		},
		contrast: {
			warning: "{background} rItlh: {ratio}:1, {minimum}:1 (WCAG AA).",
			summary: "rItlh ghuH: {count}. choqlaH, WCAG 2.2 AA lI'be'."
		},
		delete: {
			header: "HablI' Qaw'",
			message: "HablI' „{name}“ Qaw'?",
			usedBy: "QIn lo': {surveys}.",
			unused: "QIn lo'be'.",
			usageUnknown: "lo' Sovbe'.",
			accept: "Qaw'",
			reject: "mev"
		},
		toast: {
			saved: "HablI' „{name}“ choqlu'",
			saveFailed: "HablI' choqlaHbe'",
			deleted: "HablI' „{name}“ Qaw'lu'",
			deleteFailed: "HablI' Qaw'laHbe'"
		},
		errors: {
			missingToken: "'el'be'. ghun yIlI'.",
			missingRole: "Hu'tegh – deploy DIch Hutlh.",
			limitReached: "HablI'mey law' tlhoy.",
			conflict: "latlh ghot HablI' choH pagh Qaw'. tetlh lI'qa'lu'. choqqa'chugh, chu' Dach.",
			throttled: "Qu' law'. yInIDqa'.",
			generic: "HablI' Qagh"
		}
	},

	features: {
		web_survey: {
			label: "Web QIn",
			description: "Web QIn: rI'meH rarwI' 'ej Web HaSta mIw."
		}
	},
	settings: {
		features: {
			title: "laH chu'lu'pu'bogh"
		},
		setup: {
			title: "jommeH",
			empty: "jommeH De' tu'lu'be'.",
			fields: {
				projectTag: "Qu' per",
				domain: "Hatlh",
				launchUrl: "taghmeH URL",
				oauthFrontend: "Frontend OAuth ghun",
				integrationApp: "ghun muvmoHwI'",
				division: "Sep",
				backendGroup: "Backend ghom",
				backendRole: "Backend patlh",
				backendAuth: "Backend 'olmeH",
				backendClient: "Backend De'wI'",
				dataTable: "Data Table De'",
				surveyDataTable: "yu'ghItlh Data Table",
				mappingDataTable: "tlhegh nobmeH Data Table",
				dataActionIntegration: "Data Action muvmoHwI'",
				dataAction: "Data Action Qu'",
				installedAt: "jomlu'pu'bogh jaj"
			},
			uninstallHint: "jomHa'lu'DI', jommeH De' Daq ngaSbogh Doch Hoch teqlu'.",
			update: "Botflow yIchu'moH",
			updateHint: "Botflow mIw chu' tam chu'moHwI'. Flow choHmey DIlo'bogh tamlu'.",
			updateSuccess: "Botflow chu'moHlu'pu'",
			updateSuccessDetail: "mIw chu' vo' Botflow chu'moHlu'pu'. Qapla'!",
			updateFailed: "Botflow chu'moHlaHbe'lu'",
			exportTemplates: "mIw ghunmey yIlIH",
			exportMissing: "Botflow pagh Inbound-Flow tu'lu'be' setup mu'meyDaq.",
			exportSuccess: "Botflow je Inbound-Flow lIHlu'pu' ghunmey-vetlh.",
			exportFailed: "mIw lIHmeH Qagh.",
			uninstall: "yIjomHa'"
		}
	},

	setup: {
		heroTitle: "jommeH",
		logHeader: "ngeHmeH ghItlhmey",
		startApp: "ghun yItagh",
		backToConfig: "SeH yIchegh",
		rollback: "Rollback yIchegh",
		permissions: {
			title: "jomwI' chaw'mey tu'lu'be'",
			description: "jommeH 'ej Rollback chaw'mey vam poQlu'.",
			available: "tu'lu'",
			missing: "tu'lu'be'",
			warningTitle: "jommeH wIvmey 'op bot",
			divisionHint: "Sep chenmoHmeH Qaw'meH je chaw' Daghajbe'chugh, Sep ngo' neH Dalo'laH.",
			checkedTitle: "chaw'mey 'ollu'pu'",
			checkedDetail: "jomwI' chaw'mey tu'lu'. Qapla'!",
			loadErrorTitle: "jommeH De' lI'laHbe'lu'",
			retry: "yInIDqa'",
			requirements: {
				groupsManage: "ghommey yIchenmoH, yIlaD, yIQaw'",
				rolesManage: "patlhmey chaw'mey je yIloH",
				integrationsView: "muvmoHwI'mey yIlaD",
				integrationsManage: "muvmoHwI'mey Data Actions je yIloH",
				oauthManage: "OAuth De'wI'mey yIlaD 'ej yIchoH",
				divisionsView: "Sepmey yIlaD",
				datatableManage: "Architect Data Tables tlheghmey je yIloH",
				flowsManage: "Architect Flows yIloH",
				divisionCreate: "Sep chu' yIchenmoH 'ej yIQaw'"
			}
		},
		steps: {
			installation: "jommeH",
			summary: "naQ ja'"
		},
		step1: {
			title: "jommeH",
			description: "ghun muvmoHwI', Frontend OAuth, jommeH Sep je yIwIv.",
			projectTag: "Qu' per",
			projectTagPlaceholder: "mu'mey: survey_app",
			integration: "muvmoHwI'",
			integrationPlaceholder: "muvmoHwI' yIwIv",
			oauthClient: "OAuth De'wI'",
			oauthClientPlaceholder: "OAuth De'wI' yIwIv",
			division: "Sep",
			useExistingDivision: "Sep ngo' yIlo'",
			createNewDivision: "Sep chu' yIchenmoH",
			divisionPlaceholder: "Sep yIwIv",
			surveyDataTable: "yu'ghItlh Data Table",
			mappingDataTable: "tlhegh nobmeH Data Table",
			dataTableHint: "Data Tables pongmey naQ. pong vam ghajbogh Data Table tu'lu'chugh, lo'lu' 'ej jomHa'lu'DI' Qaw'lu'be'.",
			dataTableNamesCollide: "cha' Data Tables pongmey pIm poQlu'.",
			features: "laH",
			featuresHint: "__meta tlheghDaq wIvlu'pu'bogh pollu'. jom pIq Data TableDaq neH choHlu'laH.",
			next: "veb"
		},
		step2: {
			title: "naQ ja'",
			description: "Data Tables, Backend OAuth De'wI', noHmeH jangmeyvaD Data Action je chenmoHlu'.",
			project: "Qu'",
			appIntegration: "ghun muvmoHwI'",
			oauthClient: "OAuth De'wI'",
			division: "Sep",
			newDivision: "chu': {name}_division",
			features: "laH",
			noFeatures: "pagh",
			surveyDataTable: "yu'ghItlh Data Table",
			mappingDataTable: "tlhegh nobmeH Data Table",
			back: "yIchegh",
			start: "jommeH yItagh"
		},
		toast: {
			successSummary: "Qapla'",
			successDetail: "jommeH rInpu'.",
			errorSummary: "Qagh",
			errorDetail: "jommeH luj. ghItlhmey yIlegh.",
			rollbackSummary: "Rollback Qap",
			rollbackDetail: "Doch chenmoHlu'pu'bogh teqlu'pu'.",
			rollbackErrorSummary: "Rollback luj"
		}
	},

	uninstall: {
		heroTitle: "Qu' yIjomHa'",
		stepTitle: "Doch jomlu'pu'bogh yIteq",
		installationLabel: "jommeH:",
		warning: "Qu'vam jommeH chenmoHpu'bogh Genesys Doch teq: cha' Flows, cha' Data Tables, Data Action, Backend OAuth De'wI' je. Backend tenant Qaw'lu'pu' per lu'ghItlh; ghIq loHwI' Say'moH. bItaHneS'a'?",
		logHeader: "pat De'wI' - UNINSTALL_LOG",
		cancel: "yIqIl",
		remove: "jommeH yIteq",
		retry: "yInIDqa'",
		back: "HIDjolev yIchegh",
		finish: "rInta'",
		toast: {
			removedSummary: "jommeH teqlu'pu'",
			removedDetail: "ghun Doch jomlu'pu'bogh teqlu'pu'.",
			failedSummary: "Qaw'lu'DI' luj",
			divisionKeptSummary: "Sep ratlh",
			divisionKeptDetail: "Sep chenmoHlu'pu'bogh Qaw'laHbe'lu'; ratlh."
		}
	},

	questionTypes: {
		rating: "noH (rating)",
		choice: "wIv (choice)",
		yes_no: "HIja' / ghobe' (yes_no)",
		nps: "NPS mI' noH (nps)",
		comment: "QIn / ghItlh (comment)",
		commentFollowUp: "ghItlh tlhab / QIn (comment)"
	},

	operators: {
		equals: "rap (equals)",
		less_than: "puS law' (less_than)",
		greater_than: "law' law' (greater_than)"
	},

	booleanOptions: {
		yes: "HIja' (true)",
		no: "ghobe' (false)"
	}
};