import type { MessageSchema } from "./de";

// Lateinische Testsprache (lingua Latina): Wunsch der Humanisten, nur in der Dev-Ansicht wählbar.
export const la: MessageSchema = {
	common: {
		back: "Redi",
		backToOverview: "Ad conspectum redi",
		cancel: "Omitte",
		save: "Serva",
		delete: "Dele",
		edit: "Muta",
		close: "Claude",
		discard: "Reice",
		unknownUser: "Usor ignotus",
		otherUser: "alius usor",
		unknownError: "Error ignotus",
		selection: "Electio"
	},

	language: {
		title: "Lingua / Language",
		label: "Lingua",
		de: "Deutsch",
		en: "English",
		fr: "Français",
		tlh: "tlhIngan Hol (i18n-Test)",
		la: "Lingua Latina (i18n-Test)"
	},

	modules: {
		dashboard: {
			title: "Tabula",
			description: "Conspectus modulorum in exemplari praesto."
		},
		surveys: {
			title: "Percontationes",
			description: "Creatio, conformatio et aestimatio percontationum.",
			unnamedSurvey: "Percontatio {index}"
		},
		settings: {
			title: "Optiones",
			description: "Optiones universales et metadata institutionis."
		}
	},

	dashboard: {
		title: "Tabula"
	},

	permissions: {
		missingWrite: "Nulla potestas – iura scribendi desunt.",
		missingDeploy: "Nulla potestas – iura publicandi desunt.",
		missingExport: "Nulla potestas – iura exportandi eventus desunt.",
		readOnlyBanner: "Lectio tantum: percontationes creare, mutare, imitari et delere iura scribendi postulat.",
		deployReadOnlyBanner: "Lectio tantum: ad publicationem, reversionem et assignationem agminum iura publicandi necessaria sunt."
	},

	surveys: {
		searchPlaceholder: "Percontationem quaere...",
		actions: {
			back: "Ad conspectum redi",
			new: "Nova percontatio",
			reload: "Percontationes renova"
		},
		newSurveyTitle: "Nova percontatio",
		cloneSurveyTitle: "Percontationem imitare",
		leaveConfirm: {
			header: "Mutationes non servatae",
			message: "Mutationes non servatas habes. Visne vere paginam relinquere?",
			queueMappingMessage: "Mutationes non servatas in assignatione agminum habes. Visne vere paginam relinquere?",
			acceptLabel: "Relinque",
			rejectLabel: "Mane"
		},
		detail: {
			loading: "Singula percontationis leguntur...",
			errorTitle: "Error in percontatione legenda",
			emptyDraft: "Nulla percontationis data pro hoc ID exstant.",
			loadErrorFallback: "Error in percontatione '{id}' legenda",
			rowNotFound: "Nulla series pro '{key}' in Data Table inventa est."
		},
		list: {
			availableCount: "Percontationes praesto ({count})",
			loading: "Data percontationum leguntur...",
			loadErrorFallback: "Error in datis percontationum legendis",
			invalidIndex: "Index percontationum (series survey_list) corruptus est et non superscribetur.",
			unnamedSurvey: "Percontatio sine nomine",
			openAriaLabel: "Percontationem aperi: {title}",
			edit: "Muta",
			view: "Specta",
			emptySearch: "Nullae percontationes pro quaestione inventae sunt.",
			empty: "Nullae percontationes exstant."
		}
	},

	surveyEditor: {
		toolbar: {
			back: "Ad conspectum redi",
			backAriaLabel: "Ad conspectum percontationum redi",
			statusUnsaved: "Non servatum",
			statusSaved: "Servatum",
			discard: "Reice",
			delete: "Dele",
			deleteAriaLabel: "Percontationem dele",
			clone: "Imitare",
			cloneAriaLabel: "Percontationem imitare",
			deploy: "Publica",
			deployAriaLabel: "Ad aspectum publicationis",
			report: "Relatio",
			reportAriaLabel: "Ad aspectum relationis",
			invite: "Nexus invitationis",
			inviteAriaLabel: "Ad nexus invitationis (interretiales)",
			save: "Serva"
		},
		stickyBar: {
			unsaved: "● Mutationes non servatae adsunt",
			allSaved: "✓ Omnes mutationes servatae",
			back: "Redi",
			save: "Percontationem serva"
		},
		meta: {
			title: "Optiones generales percontationis",
			surveyTitle: "Titulus percontationis",
			technicalName: "Nomen technicum (sponte ex titulo et ID)",
			description: "Descriptio",
			greeting: "Nuntius salutationis",
			closing: "Nuntius valedictionis",
			baseUrl: "URL basis pro nexibus invitationis (interretialis)",
			baseUrlHint: "Optionale. URL https absoluta; {placeholder} locum signi in nexu indicat, alioqui ?token=… additur. Sine ea nexus ad paginam Polly ducit.",
			language: "Lingua quaestionis interretialis",
			webTheme: "Forma quaestionis interretialis",
			webThemeHint: "Litterae, magnitudines et colores paginae. Cura sub Optiones → Formae interretiales. Mutatio post Prod valet.",
			webThemeDefault: "Forma communis (Polly)",
			webThemeDefaultNamed: "Forma communis ({name})",
			webThemeMissing: "Forma electa deleta est. Quaestio formam communem adhibet.",
			webThemeMissingOption: "Forma deleta",
			webThemeLoadingOption: "Forma electa (oneratur …)",
			webThemeUnavailableOption: "Forma electa (index non praesto)",
			placeholders: {
				title: "e. g. Satisfactio clientium",
				description: "Descriptio interna vel contextus percontationis...",
				greeting: "Gratias agimus quod breve tempus nobis das...",
				closing: "Gratias tibi pro tam pretioso consilio!",
				baseUrl: "https://www.exemplum.de/quaestio/{placeholder}"
			}
		},
		save: {
			validationErrorSummary: "Errores probationis",
			validationErrorFallback: "Quaeso, errores notatos corrige antequam servas.",
			successSummary: "Feliciter servatum",
			successDetail: "Percontatio „{title}“ renovata est.",
			errorSummary: "Error servandi",
			errorFallback: "Error in percontatione in Data Table servanda."
		},
		flowSize: {
			warnTitle: "Copia textuum percontationis ad terminum appropinquat",
			warnDetail: "Percontatio {percent} % maximae copiae textuum adhibet ({length} ex {max} litteris cum datis technicis). Supra 100 % servari quidem potest, sed non iam publicari.",
			exceededTitle: "Copia textuum percontationis nimia est",
			exceededDetail: "Percontatio {percent} % maximae copiae textuum adhibet ({length} ex {max} litteris cum datis technicis). Ut exemplar servari potest, sed publicari non potest. Quaeso, textus longiores contrahe.",
			announceWarn: "Monitum: copia textuum percontationis {percent} % termini attigit.",
			announceExceeded: "Copia textuum percontationis nimia est. Publicare non licet donec textus longiores contrahantur.",
			announceOk: "Copia textuum percontationis iterum intra terminos tutos est."
		},
		discardConfirm: {
			header: "Mutationes reice",
			message: "Visne vere omnes mutationes non servatas reicere?",
			acceptLabel: "Ita, reice",
			rejectLabel: "Omitte",
			toastSummary: "Restitutum",
			toastDetail: "Mutationes reiectae sunt."
		},
		saveConflict: {
			header: "Percontatio interim mutata est",
			message: "In hac percontatione interim mutationes servatae sunt, e. g. ab alio usore (status tuus in v{expected} nititur, servata est v{current}). Visne exemplar servatum cum mutationibus tuis superscribere an exemplar servatum legere? Legendo mutationes tuae non servatae pereunt.",
			overwriteLabel: "Superscribe",
			cancelLabel: "Omitte",
			loadLabel: "Mutationes lege",
			loadedSummary: "Denuo lectum",
			loadedDetail: "Exemplar servatum v{version} lectum est.",
			loadErrorSummary: "Lectio defecit"
		},
		deleteConfirm: {
			header: "Percontationem dele",
			message: "Visne percontationem „{title}“ vere et irrevocabiliter delere? Omnes eventus percontationis collecti simul in perpetuum delentur.",
			acceptLabel: "Ita, dele",
			rejectLabel: "Omitte",
			successSummary: "Percontatio deleta",
			successDetail: "Percontatio „{title}“ feliciter deleta est.",
			errorSummary: "Error delendi",
			errorFallback: "Error in percontatione ex Data Table delenda.",
			resultsSummary: "Eventus delentur",
			resultsDetail: "Eventus percontationis in occulto delentur. Hoc aliquantum temporis postulare potest.",
			resultsErrorSummary: "Eventus non deleti",
			resultsErrorFallback: "Percontatio deleta est, sed deletio eventuum incipi non potuit."
		}
	},

	surveyLock: {
		unknownUser: "Usor ignotus",
		conflict: {
			header: "Percontatio iam mutatur",
			message: "Haec percontatio inde a {date} a „{user}“ mutatur. Visne eam nihilominus mutare an tantum spectare?",
			acceptLabel: "Nihilominus muta",
			rejectLabel: "Tantum specta"
		},
		readOnlyBanner: "Contra scripturam tuta: haec percontatio nunc a „{user}“ mutatur. Mutationes sunt inactivae."
	},

	surveyQuestions: {
		title: "Catalogus quaestionum",
		countStatus: "{count} ex maximo {max} quaestionibus occupatae (cum quaestionibus consecutivis)",
		maxReached: "Maximum attactum",
		addQuestion: "Quaestionem adde",
		addQuestionAriaLabel: "Novam quaestionem ad percontationem adde",
		addAnotherAriaLabel: "Aliam quaestionem ad percontationem adde",
		empty: {
			title: "Haec percontatio nondum quaestiones continet.",
			description: "Primam quaestionem crea ut conformationem percontationis incipias.",
			cta: "Primam quaestionem crea"
		},
		limitToast: {
			summary: "Terminus attactus",
			detail: "Percontatio maxime {max} quaestiones (cum consecutivis) continere potest."
		}
	},

	surveyQuestion: {
		numberAriaLabel: "Numerus quaestionis",
		mandatoryTag: "Necessarium",
		moveUpAriaLabel: "Quaestionem {number} sursum move",
		moveDownAriaLabel: "Quaestionem {number} deorsum move",
		delete: "Dele",
		deleteAriaLabel: "Quaestionem {number} dele",
		deleteConfirm: {
			header: "Quaestionem dele",
			message: "Visne „{title}“ et omnes quaestiones consecutivas ad eam pertinentes vere et irrevocabiliter delere?",
			acceptLabel: "Dele",
			rejectLabel: "Omitte",
			fallbackTitle: "Quaestio #{number}"
		},
		followUps: {
			title: "Quaestiones consecutivae condicionales ({count})",
			hint: "Ostenditur tantum si condicio responsi definita impletur.",
			add: "Quaestionem consecutivam adde",
			addAriaLabel: "Quaestionem consecutivam ad quaestionem {number} adde"
		}
	},

	surveyQuestionFields: {
		technicalName: "Designator technicus (nomen)",
		technicalNameHintShort: "(Immutabile propter relationes)",
		technicalNameHint: "Designator ad relationes conficiendas adhibetur et mutari non potest.",
		type: "Genus quaestionis",
		typeSavedHint: "(Servatum – genus immutabile)",
		mandatory: "Quaestio necessaria",
		title: "Titulus / Prompt",
		titlePlaceholder: "e. g. Quam contentus es officio nostro?",
		reprompt: "Repetitio postulationis (Reprompt)",
		repromptPlaceholder: "Secunda rogatio ad quaestionem respondendam (optionalis).",
		description: "Descriptio / Textus auxiliaris",
		descriptionPlaceholder: "Monita supplementaria pro respondente..."
	},

	surveyFollowUp: {
		legend: "Quaestio consecutiva #{number}",
		fieldsetAriaLabel: "Quaestio consecutiva {number}",
		delete: "Dele",
		deleteAriaLabel: "Quaestionem consecutivam {number} dele",
		deleteConfirm: {
			header: "Quaestionem consecutivam dele",
			message: "Visne hanc quaestionem consecutivam vere removere?",
			acceptLabel: "Dele",
			rejectLabel: "Omitte"
		},
		title: "Titulus / Prompt",
		titlePlaceholder: "e. g. Quae causa aestimationis tuae fuit?",
		type: "Genus quaestionis",
		typeSavedHint: "(Servatum – genus immutabile)",
		reprompt: "Repetitio postulationis (Reprompt)",
		repromptPlaceholder: "Secunda rogatio ad quaestionem respondendam (optionalis).",
		description: "Descriptio / Textus auxiliaris",
		descriptionPlaceholder: "Explicatio addita pro participante..."
	},

	surveyCondition: {
		label: "Condicio ostensionis:",
		operator: "Operator",
		valueChoice: "Responsum optioni congruit",
		valueOther: "Valor comparationis",
		choicePlaceholder: "Optionem elige...",
		unnamedOption: "Optio ({id})"
	},

	ratingOptions: {
		scaleLabel: "Scalam aestimationis conforma ({min} usque ad max. {max}):",
		min: "Valor minimus ({min} usque ad {max})",
		max: "Valor maximus ({min} usque ad {max})",
		previewLabel: "Praevisio scalae:",
		minLabel: "Titulus valoris minimi (optionalis)",
		maxLabel: "Titulus valoris maximi (optionalis)",
		labelsHint: "Tantum in quaestionibus interretialibus ad fines scalae ostenditur, non recitatur.",
		minLabelPlaceholder: "e. g. pessimum",
		maxLabelPlaceholder: "e. g. optimum"
	},

	choiceOptions: {
		label: "Optiones electionis ({min} usque ad max. {max} optiones):",
		add: "Optionem adde",
		hint: "Synonyma commate separata addere potes, e. g. „Aurantium, Malum aureum, Citrus“. Primum verbum est optio, cetera synonyma.",
		optionSrLabel: "Optio {number}",
		optionPlaceholder: "Optio {number}, synonymum 1, synonymum 2",
		defaultLabel: "Optio {number}",
		removeAriaLabel: "Optionem {number} remove"
	},

	typeHint: {
		nps: "Net Promoter Score scala standardizata ab 0 (minime probabile) usque ad 10 (maxime probabile) utitur.",
		yesNo: "Quaestio Ita / Non cum duobus responsis standardizatis.",
		comment: "Campus apertus pro liberis participantis sententiis."
	},

	promptTextarea: {
		ttsLimitHint: "Voce synthetica recitatur, maxime {max} litterae.",
		ttsCounter: "{length} ex maximo {max} litteris",
		ttsTooLong: "Textus nimis longus: {length} ex maximo {max} litteris. Quaeso, textum contrahe, alioquin percontatio servari non potest.",
		ttsAnnounceTooLong: "Textus nimis longus: {length} ex maximo {max} litteris. Percontatio sic servari non potest.",
		ttsAnnounceOk: "Longitudo textus iterum intra terminum est."
	},

	validation: {
		summaryTitle: "Quaeso, hos errores corrige:",
		summaryHint: "Clic in errorem ad campum affectum ducit.",
		questionTitleRequired: "Titulus quaestionis vacuus esse non potest.",
		questionNameRequired: "Nomen quaestionis vacuum esse non potest.",
		ratingOptionsInvalid: "Optiones aestimationis invalidae sunt.",
		ratingMinRange: "Valor minimus inter {min} et {max} esse debet.",
		ratingMaxRange: "Valor maximus inter {min} et {max} esse debet.",
		ratingMinLessThanMax: "Valor minimus minor valore maximo esse debet.",
		choiceOptionsInvalid: "Optiones electionis invalidae sunt.",
		choiceMinOptions: "Quaestio electionis saltem {min} optiones requirit.",
		choiceMaxOptions: "Quaestio electionis maxime {max} optiones habere potest.",
		choiceOptionEmpty: "Optio {number} vacua esse non potest.",
		choiceOptionDuplicate: "Optio {number} cum optione {otherNumber} concurrit (eadem nota vel idem synonymum).",
		followUpMissing: "Quaestio consecutiva deest.",
		followUpsNotAllowed: "Quaestiones generis commentarii quaestiones consecutivas habere non possunt. Quaeso, quaestiones consecutivas remove vel aliud genus elige.",
		followUpsTooDeep: "Quaestiones consecutivae suas quaestiones consecutivas habere non possunt.",
		followUpValueRequired: "Quaeso, valorem validum pro condicione indica.",
		followUpOperatorDuplicate: "Comparator \"{operator}\" iam a quaestione consecutiva {number} adhibetur. Quisque comparator semel tantum adhiberi potest.",
		followUpValueDuplicate: "Hic valor iam a quaestione consecutiva {number} adhibetur. Quodque responsum possibile unam tantum quaestionem consecutivam habere potest.",
		surveyTitleRequired: "Titulus percontationis vacuus esse non potest.",
		surveyNameRequired: "Nomen percontationis vacuum esse non potest.",
		surveyMinQuestions: "Percontatio saltem 1 quaestionem continere debet.",
		surveyMaxQuestions: "Percontatio maxime {max} quaestiones continere potest (cum consecutivis). Nunc: {count}.",
		ttsTextTooLong: "„{field}“ nimis longum est ({length} ex maximo {max} litteris). Textus voce synthetica recitati maxime {max} litteras longi esse possunt. Quaeso, textum contrahe.",
		baseUrlInvalid: "URL basis debet esse URL https absoluta et valida, e. g. https://www.exemplum.de/quaestio/{placeholder}.",
		baseUrlTokenCount: "URL basis signum {placeholder} semel tantum continere potest.",
		languageInvalid: "Linguam validam elige.",
		webThemeInvalid: "Formam validam elige.",
		scaleLabelTooLong: "„{field}“ nimis longum est (maximum {max} litterae)."
	},

	translator: {
		yesNoInvalidValue: "Valor condicionis invalidus pro genere quaestionis yes_no: {value}",
		equalsOnly: "Genus quaestionis {type} tantum operatorem \"equals\" permittit.",
		duplicateYesNo: "Plures quaestiones consecutivae pro condicione \"{value}\".",
		choiceOptionsMissing: "Genus quaestionis choice optiones electionis requirit (options.labels).",
		unknownLabelId: "Optio electionis ignota \"{labelId}\" in condicione quaestionis consecutivae.",
		duplicateChoice: "Plures quaestiones consecutivae pro eadem optione electionis \"{labelId}\".",
		ratingOptionsMissing: "Genus quaestionis rating scalam requirit (options.min_value/max_value).",
		duplicateOperator: "Operator \"{operator}\" in quaestionibus consecutivis pluries adest.",
		valueNotNumeric: "Valor condicionis \"{value}\" numerus non est.",
		commentNoFollowUps: "Genus quaestionis comment quaestiones consecutivas habere non potest.",
		unknownType: "Genus quaestionis ignotum \"{type}\".",
		noQuestions: "Percontatio nullas quaestiones continet.",
		emptyDraft: "Exemplar vacuum est, publicatio interrupta est.",
		invalidJson: "Exemplar ut JSON legi non potuit: {error}",
		questionContext: "{message} (Quaestio: {question})"
	},

	deployment: {
		back: "Ad editorem redi",
		backAriaLabel: "Ad editorem redi",
		stage: "Stage",
		prod: "Prod",
		backup: "Backup",
		unnamedSurvey: "Percontatio sine nomine",
		none: "–",
		deployStage: "In Stage publica",
		deployStageAriaLabel: "Exemplar in Stage publica",
		deployProd: "In Prod publica",
		deployProdAriaLabel: "Exemplar in Prod publica",
		rollback: "Reversio",
		rollbackAriaLabel: "Ultimam versionem in Prod restitue",
		alreadyInProd: "Versio v{version} iam in Prod publicata est. Nova publicatio in Prod post mutationem exemplaris demum possibilis est.",
		unknownError: "Error ignotus in publicatione",
		draftChanged: "Exemplar interim mutatum est (ostensum: v{expected}, nunc: v{current}), e. g. ab alio usore. Nihil publicatum est. Aspectus nunc statum hodiernum ostendit – quaeso, inspice et iterum publica.",
		prodChanged: "Prod interim mutatum est, e. g. publicatione alterius usoris. Reversio peracta non est. Aspectus nunc statum hodiernum ostendit – quaeso, inspice et reversionem, si opus est, iterum perage.",
		webPreview: "Praevisio interretialis",
		webPreviewAriaLabel: "Versionem Stage ut percontationem interretialem in nova tabula aperi",
		webPreviewHint: "Praevisio versionem Stage ut percontationem interretialem in nova tabula aperit. Nexus {days} dies valet, responsa non servantur.",
		webPreviewBlocked: "Navigatrum novam fenestram impedivit.",
		webPreviewOpenLink: "Praevisionem aperi",
		webPreviewErrors: {
			missingToken: "Non inscriptus – quaeso paginam renova.",
			missingRole: "Nulla licentia – iura publicandi desunt.",
			noStage: "Huic percontationi nulla versio Stage publicata est.",
			throttled: "Nimiae petitiones – quaeso mox iterum conare.",
			generic: "Praevisio aperiri non potuit"
		},
		payloadTooLarge: "Summa textuum percontationis nimia est ({length} ex maximo {max} litteris cum datis technicis), itaque publicari non potest. Quaeso, textus longiores in editore contrahe et percontationem iterum serva."
	},

	report: {
		back: "Ad editorem redi",
		backAriaLabel: "Ad editorem redi",
		from: "Ab",
		to: "Usque ad",
		range: "Tempus",
		quickRanges: {
			today: "Hodie",
			last7Days: "Septem dies proximi",
			last30Days: "Triginta dies proximi",
			currentMonth: "Mensis currens",
			lastMonth: "Mensis proximus"
		},
		hint: "Tempus ad initium sessionis percontationis refertur (primum responsum).",
		version: "Versio percontationis",
		allVersions: "Omnes versiones",
		versionOption: "v{version} ({sessions})",
		summary: {
			title: "Praevisio",
			loading: "Praevisio legitur … ({sessions} sessiones adhuc)",
			liveUpdating: "Sponte renovatur",
			sessions: "Sessiones",
			completed: "Perfectae",
			partial: "Currentes",
			timedOut: "Interruptae",
			tooltips: {
				sessions: "Omnes participationes percontationis in tempore electo inceptae (saltem unum responsum).",
				completed: "Participationes quibus percontatio usque ad finem peracta est.",
				partial: "Participationes quae nunc currunt vel quarum ultimum responsum minus quam 30 minutis abest.",
				timedOut: "Participationes ante tempus relictae (e. g. telephonum depositum vel colloquium clausum) – 30 minuta sine alio responso."
			},
			empty: "In tempore electo nullae sessiones exstant."
		},
		download: "CSV deonera",
		downloadAriaLabel: "Relationem CSV deonera",
		cancel: "Omitte",
		progress: "{sessions} sessiones / {rows} series lectae",
		errors: {
			invalidRange: "Quaeso, tempus validum elige (Ab non post Usque ad esse potest).",
			missingToken: "Nullum signum accessus Genesys adest. Quaeso, iterum ingredere.",
			generic: "Error in relatione legenda"
		}
	},

	invitations: {
		back: "Ad editorem redi",
		backAriaLabel: "Ad editorem redi",
		title: "Nexus invitationis",
		prodVersion: "Prod v{version}",
		intro: "Nexus proprios pro quaestionario interretiali creat. Nexus ad statum Prod praesentem spectant.",
		noProd: "Quaestionarium nondum statum Prod habet. Primum in Prod emitte.",
		count: "Numerus nexuum",
		countHint: "{min} ad {max} nexus singulis vicibus",
		expiry: "Dies exitus (optio)",
		expiryHint: "Valet usque ad 23:59:59 illius diei (tempore tuo). Sine die nexus numquam exeunt.",
		multi: "Saepius utendus",
		multiHintOn: "Quisque nexus quotiens libet adhiberi potest.",
		multiHintOff: "Quisque nexus semel tantum adhiberi potest.",
		linkTarget: "Meta nexuum",
		linkTargetBaseUrl: "URL fundamentalis ex optionibus servatis:",
		linkTargetFallback: "Nulla URL fundamentalis – nexus ad paginam Polly spectant:",
		generate: "Nexus crea et CSV depone",
		generateAriaLabel: "Nexus invitationis crea et ut CSV depone",
		notStoredHint: "Nexus non servantur. Plicam CSV custodi.",
		success: "{count} nexus creati, plica CSV deposita est.",
		errors: {
			missingToken: "Nulla tessera accessus Genesys. Iterum inscribe.",
			missingRole: "Nulla potestas – iura emittendi desunt.",
			noProd: "Quaestionarium statum Prod (iam) non habet. Aspectum renova.",
			throttled: "Genesys nunc occupatus est. Mox iterum tempta.",
			expiryInPast: "Dies exitus praeteriit.",
			generic: "Error in nexibus invitationis creandis"
		}
	},

	queueMapping: {
		title: "Assignatio agminum",
		queueCount: "{count} agmen assignatum | {count} agmina assignata",
		rate: "{rate}% frequentia",
		loading: "Assignatio agminum legitur...",
		retry: "Iterum conare",
		intro: "Statue quibus agminibus haec percontatio post vocationes assignetur et qua probabilitate (Delivery Rate) praebenda sit.",
		deliveryRateLabel: "Probabilitas praebendi (Delivery Rate)",
		deliveryRateAriaLabel: "Probabilitas praebendi per centum",
		queuesLabel: "Agmina (unum agmen per lineam)",
		entriesCount: "{count} inscriptio | {count} inscriptiones",
		queuesHint: "Nomina agminum accurata per lineas inscribe. Ut assignatio huius percontationis omnino removeatur, campum textus vacua et serva.",
		conflictHint: "Monitum: {count} agmen iam alii percontationi assignatum est: | Monitum: {count} agmina iam aliis percontationibus assignata sunt:",
		conflictSurveyId: "ID percontationis currentis: {id}",
		conflictFooter: "Cum servas, confirmatio petetur antequam assignatio exstans superscribatur.",
		save: "Assignationem agminum serva",
		reset: "Mutationes restitue",
		overwriteConfirm: {
			header: "Assignationes exstantes superscribere?",
			message: "Haec agmina nunc iam alii percontationi assignata sunt:\n\n{list}\n\nVisne has assignationes vere ad percontationem currentem transferre et exstantes superscribere?",
			listItem: "• {queueName} (ID percontationis: {surveyId})",
			acceptLabel: "Ita, superscribe",
			rejectLabel: "Omitte"
		},
		toast: {
			savedSummary: "Assignatio agminum servata",
			savedDetail: "Assignationes agminum feliciter renovatae sunt."
		},
		loadErrorFallback: "Error in assignatione agminum legenda",
		saveErrorFallback: "Error in assignatione agminum in Data Table servanda"
	},

	controlToolbar: {
		searchPlaceholder: "Quaere...",
		close: "Claude",
		edit: "Muta",
		toast: {
			lockedSummary: "Clausum",
			lockedDetail: "Conformatio nunc a hoc usore mutatur: {name}"
		}
	},

	app: {
		initErrorSummary: "Error",
		initErrorFallback: "Initium defecit.",
		sidebarCollapse: "Latus complica",
		sidebarExpand: "Latus explica"
	},

	webThemes: {
		title: "Formae interretiales",
		intro: "Formae paginae publicae (litterae, stili, colores). Quaeque quaestio formam suam eligit; sine electione forma communis valet. Mutationes intra triginta secunda valent.",
		list: {
			loading: "Formae onerantur …",
			empty: "Nullae formae adhuc. Sine forma pagina formam Polly adhibet.",
			default: "Communis",
			edit: "Muta",
			view: "Inspice",
			duplicate: "Duplica",
			delete: "Dele",
			create: "Nova forma",
			newName: "Nova forma",
			copyName: "{name} (exemplar)",
			updated: "Mutata {date}",
			updatedBy: "Mutata {date} ab {user}",
			limit: "Non plus quam {max} formae."
		},
		editor: {
			name: "Nomen",
			isDefault: "Forma communis",
			font: "Litterae",
			fontHint: "Litterae systematis; nulla documenta litterarum onerantur.",
			textStyles: "Stili textus",
			textStylesHint: "Magnitudo in punctis imaginis. Amplificatio legentium valet.",
			role: "Genus textus",
			size: "Magnitudo",
			weight: "Pondus",
			lineHeight: "Altitudo versus",
			reset: "Restitue",
			resetAll: "Omnia restitue",
			resetRole: "{role} restitue",
			resetColor: "{color} restitue",
			sizeOf: "Magnitudo {role}, {min} ad {max}",
			weightOf: "Pondus {role}",
			lineHeightOf: "Altitudo versus {role}",
			colors: "Colores",
			transparentBackground: "Fundus pellucidus",
			transparentHint: "Ad inserendum per iframe: fundus paginae pellucidus fit.",
			preview: "Prospectus",
			previewHint: "Quaestio exemplaris cum omnibus generibus. Genus textus hic notatur.",
			previewTitle: "Prospectus paginae",
			save: "Serva",
			cancel: "Omitte"
		},
		roles: {
			heading: "Titulus",
			subheading: "Subtitulus",
			body: "Textus",
			questionTitle: "Titulus quaestionis",
			description: "Descriptio",
			option: "Responsa",
			scaleLabel: "Tituli scalae",
			hint: "Indicia",
			error: "Errores",
			button: "Puga"
		},
		weights: {
			w400: "Normale (400)",
			w500: "Medium (500)",
			w600: "Semigrave (600)",
			w700: "Grave (700)"
		},
		fonts: {
			system: "Litterae systematis",
			sans: "Sine apicibus",
			serif: "Cum apicibus",
			humanist: "Humanisticae",
			rounded: "Rotundae"
		},
		colors: {
			background: "Fundus paginae",
			surface: "Superficies",
			text: "Textus",
			heading: "Tituli",
			textMuted: "Textus remissus",
			primary: "Color insignis",
			onPrimary: "Textus in colore insigni",
			border: "Margines",
			error: "Errores"
		},
		contrast: {
			warning: "Discrimen ad {background}: {ratio}:1, saltem {minimum}:1 (WCAG AA).",
			summary: "Monita discriminis: {count}. Servare licet, sed WCAG 2.2 AA non praestatur."
		},
		delete: {
			header: "Formam dele",
			message: "Formam „{name}“ vere delere?",
			usedBy: "Hae quaestiones eam adhibent: {surveys}.",
			unused: "Nulla quaestio hanc formam adhibet.",
			usageUnknown: "Usus probari non potuit.",
			accept: "Dele",
			reject: "Omitte"
		},
		toast: {
			saved: "Forma „{name}“ servata",
			saveFailed: "Forma servari non potuit",
			deleted: "Forma „{name}“ deleta",
			deleteFailed: "Forma deleri non potuit"
		},
		errors: {
			missingToken: "Non inscriptus. Applicationem renova.",
			missingRole: "Sine iure – iura deploy desunt.",
			limitReached: "Numerus maximus formarum attactus est.",
			conflict: "Alius formam interim mutavit aut delevit. Index renovatus est, tua servata sunt. Iterum servare statum novum superscribit.",
			throttled: "Ministerium occupatum est. Mox iterum tempta.",
			generic: "Error formarum"
		}
	},

	features: {
		web_survey: {
			label: "Quaestiones interretiales",
			description: "Quaestiones per nexum invitationis in navigatro, cum formis interretialibus et optionibus in editore."
		}
	},
	settings: {
		features: {
			title: "Facultates activae"
		},
		setup: {
			title: "Institutio",
			empty: "Nulla metadata institutionis praesto sunt.",
			fields: {
				projectTag: "Nota proiecti",
				domain: "Domain",
				launchUrl: "URL initii",
				oauthFrontend: "OAuth frontendi",
				integrationApp: "Integratio applicationis",
				division: "Divisio",
				backendGroup: "Grex backendi",
				backendRole: "Munus backendi",
				backendAuth: "Auth backendi",
				backendClient: "Client backendi",
				dataTable: "Data Table",
				surveyDataTable: "Data Table percontationum",
				mappingDataTable: "Data Table assignationis agminum",
				dataActionIntegration: "Integratio Data Action",
				dataAction: "Data Action",
				installedAt: "Institutum die"
			},
			uninstallHint: "Cum deinstituis, res in institutione servatae removentur.",
			update: "Botflow renova",
			updateHint: "Renovatio Botflow exemplari nunc allato substituit. Propriae mutationes Flow superscribuntur.",
			updateSuccess: "Botflow renovatum",
			updateSuccessDetail: "Botflow feliciter ex exemplari hodierno renovatum est.",
			updateFailed: "Botflow renovari non potuit",
			exportTemplates: "Exemplaria fluxuum exporta",
			exportMissing: "Botflow vel Inbound-Flow in metadatis institutionis desunt.",
			exportSuccess: "Botflow et Inbound-Flow cum locis vacuis exportata sunt.",
			exportFailed: "Error in fluxibus exportandis.",
			uninstall: "Deinstitue"
		}
	},

	setup: {
		heroTitle: "Institutio",
		logHeader: "Acta publicationis",
		startApp: "Applicationem incipe",
		backToConfig: "Ad conformationem redi",
		rollback: "Reversio",
		permissions: {
			title: "Potestates institutoris desunt",
			description: "Ad institutionem et reversionem hae potestates necessariae sunt.",
			available: "Adest",
			missing: "Deest",
			warningTitle: "Quaedam optiones institutionis limitatae sunt",
			divisionHint: "Sine iuribus divisionem creandi et delendi tantum divisio exstans adhiberi potest.",
			checkedTitle: "Potestates probatae",
			checkedDetail: "Potestates institutoris adsunt.",
			loadErrorTitle: "Data institutionis legi non potuerunt",
			retry: "Iterum conare",
			requirements: {
				groupsManage: "Greges creare, legere et delere",
				rolesManage: "Munera et concessiones administrare",
				integrationsView: "Integrationes legere",
				integrationsManage: "Integrationes et Data Actions administrare",
				oauthManage: "Clientes OAuth legere et mutare",
				divisionsView: "Divisiones legere",
				datatableManage: "Architect Data Tables et Rows administrare",
				flowsManage: "Architect Flows administrare",
				divisionCreate: "Novam divisionem creare et delere"
			}
		},
		steps: {
			installation: "Institutio",
			summary: "Summarium"
		},
		step1: {
			title: "Institutio",
			description: "Elige integrationem applicationis, OAuth frontendi et divisionem propositam pro institutione.",
			projectTag: "Nota proiecti",
			projectTagPlaceholder: "e. g. survey_app",
			integration: "Integratio",
			integrationPlaceholder: "Integrationem elige",
			oauthClient: "Client OAuth",
			oauthClientPlaceholder: "Clientem OAuth elige",
			division: "Divisio",
			useExistingDivision: "Divisione exstanti utere",
			createNewDivision: "Novam divisionem crea",
			divisionPlaceholder: "Divisionem elige",
			surveyDataTable: "Data Table percontationum",
			mappingDataTable: "Data Table assignationis agminum",
			dataTableHint: "Nomina plena Data Tables. Si tabula eodem nomine iam exstat, assumitur et deinstituendo non delebitur.",
			dataTableNamesCollide: "Duae Data Tables nomina diversa requirunt.",
			features: "Facultates",
			featuresHint: "Electio in linea __meta servatur et post installationem tantum in Data Table mutari potest.",
			next: "Proximum"
		},
		step2: {
			title: "Summarium",
			description: "Data Tables, client OAuth backendi et Data Action pro responsis aestimationum creabuntur.",
			project: "Proiectum",
			appIntegration: "Integratio applicationis",
			oauthClient: "Client OAuth",
			division: "Divisio",
			newDivision: "Nova: {name}_division",
			features: "Facultates",
			noFeatures: "Nullae",
			surveyDataTable: "Data Table percontationum",
			mappingDataTable: "Data Table assignationis agminum",
			back: "Redi",
			start: "Institutionem incipe"
		},
		toast: {
			successSummary: "Successus",
			successDetail: "Institutio perfecta est.",
			errorSummary: "Error",
			errorDetail: "Institutio defecit. Quaeso, acta inspice.",
			rollbackSummary: "Reversio feliciter peracta",
			rollbackDetail: "Res iam creatae remotae sunt.",
			rollbackErrorSummary: "Reversio defecit"
		}
	},

	uninstall: {
		heroTitle: "Proiectum deinstitue",
		stepTitle: "Res institutas remove",
		installationLabel: "Institutio:",
		warning: "Haec actio res Genesys per institutionem creatas removet, inter eas ambos Flows, ambas Data Tables, Data Action et clientem OAuth backendi. Tenant backendi ad purgationem administratoris posteriorem ut deletus notatur. Visne pergere?",
		logHeader: "SYSTEM TERMINAL - UNINSTALL_LOG",
		cancel: "Omitte",
		remove: "Institutionem remove",
		retry: "Iterum conare",
		back: "Ad indicem redi",
		finish: "Perfectum",
		toast: {
			removedSummary: "Institutio remota",
			removedDetail: "Res applicationis institutae remotae sunt.",
			failedSummary: "Deletio defecit",
			divisionKeptSummary: "Divisio manet",
			divisionKeptDetail: "Divisio creata deleri non potuit et manet."
		}
	},

	questionTypes: {
		rating: "Aestimatio (rating)",
		choice: "Electio (choice)",
		yes_no: "Ita / Non (yes_no)",
		nps: "NPS (nps)",
		comment: "Commentarius / Textus (comment)",
		commentFollowUp: "Textus liber / Commentarius (comment)"
	},

	operators: {
		equals: "aequalis est (equals)",
		less_than: "minor est (less_than)",
		greater_than: "maior est (greater_than)"
	},

	booleanOptions: {
		yes: "Ita (true)",
		no: "Non (false)"
	}
};
