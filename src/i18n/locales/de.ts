export const de = {
	common: {
		back: "Zurück",
		backToOverview: "Zurück zur Übersicht",
		cancel: "Abbrechen",
		save: "Speichern",
		delete: "Löschen",
		edit: "Bearbeiten",
		close: "Schließen",
		discard: "Verwerfen",
		unknownUser: "Unbekannter Benutzer",
		otherUser: "ein anderer User",
		unknownError: "Unbekannter Fehler",
		selection: "Auswahl"
	},

	language: {
		title: "Sprache / Language",
		label: "Sprache",
		de: "Deutsch",
		en: "English"
	},

	modules: {
		dashboard: {
			title: "Dashboard",
			description: "Übersicht über die verfügbaren Module im Template."
		},
		questions: {
			title: "Fragen",
			description: "Pflege der Bewertungsfragen mit Prompt, Reprompt und numerischer Skala.",
			unnamedQuestion: "Unbenannte Frage"
		},
		surveys: {
			title: "Umfragen",
			description: "Erstellung, Konfiguration und Auswertung von Umfragen.",
			unnamedSurvey: "Umfrage {index}"
		},
		settings: {
			title: "Einstellungen",
			description: "Globale Einstellungen und Setup-Metadaten."
		}
	},

	dashboard: {
		title: "Dashboard"
	},

	questions: {
		searchPlaceholder: "Fragen, Prompt oder Reprompt suchen...",
		actions: {
			new: "Neue Frage",
			delete: "Frage löschen",
			reloadAnswers: "Antworten neu laden"
		},
		newQuestionName: "*Neue Frage",
		deleteConfirm: {
			header: "Frage löschen",
			message: "„{title}“ löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
			acceptLabel: "Löschen",
			rejectLabel: "Abbrechen",
			fallbackTitle: "diese Frage"
		},
		toast: {
			reloadSuccessSummary: "Antworten neu geladen",
			reloadSuccessDetail: "Antworten wurden erfolgreich neu geladen.",
			reloadErrorSummary: "Fehler",
			reloadErrorDetail: "Neu laden fehlgeschlagen."
		},
		empty: "Keine Fragen gefunden.",
		fields: {
			name: "Name",
			active: "Aktiv",
			prompt: "Prompt",
			reprompt: "Reprompt",
			min: "Min",
			max: "Max",
			scale: "Skala: {min} bis {max}"
		},
		placeholders: {
			name: "z. B. Servicebewertung",
			prompt: "Bewerten Sie den Service auf einer Skala von 1 bis 5.",
			reprompt: "Bitte nennen Sie eine Zahl innerhalb des Bereichs."
		},
		answers: {
			title: "Aktuelle Antworten",
			total: "Gesamt: {count}",
			updatedAt: "Zuletzt aktualisiert: {date}"
		}
	},

	surveys: {
		searchPlaceholder: "Umfrage suchen...",
		actions: {
			back: "Zurück zur Übersicht",
			new: "Neue Umfrage",
			reload: "Umfragen neu laden"
		},
		newSurveyTitle: "Neue Umfrage",
		cloneSurveyTitle: "Umfrage klonen",
		leaveConfirm: {
			header: "Ungespeicherte Änderungen",
			message: "Sie haben ungespeicherte Änderungen. Möchten Sie die Seite wirklich verlassen?",
			queueMappingMessage: "Sie haben ungespeicherte Änderungen am Queue-Mapping. Möchten Sie die Seite wirklich verlassen?",
			acceptLabel: "Verlassen",
			rejectLabel: "Bleiben"
		},
		detail: {
			loading: "Lade Umfragedetails...",
			errorTitle: "Fehler beim Laden der Umfrage",
			emptyDraft: "Keine Umfragedaten für diese ID vorhanden.",
			loadErrorFallback: "Fehler beim Laden der Umfrage '{id}'",
			rowNotFound: "Keine Zeile für '{key}' in der Data Table gefunden."
		},
		list: {
			availableCount: "Verfügbare Umfragen ({count})",
			loading: "Lade Umfragedaten...",
			loadErrorFallback: "Fehler beim Laden der Umfragedaten",
			unnamedSurvey: "Unbenannte Umfrage",
			openAriaLabel: "Umfrage öffnen: {title}",
			edit: "Bearbeiten",
			emptySearch: "Keine Umfragen für die Suchanfrage gefunden.",
			empty: "Keine Umfragen vorhanden."
		}
	},

	surveyEditor: {
		toolbar: {
			back: "Zurück zur Übersicht",
			backAriaLabel: "Zurück zur Umfragen-Übersicht",
			statusUnsaved: "Ungespeichert",
			statusSaved: "Gespeichert",
			discard: "Verwerfen",
			delete: "Löschen",
			deleteAriaLabel: "Umfrage löschen",
			clone: "Klonen",
			cloneAriaLabel: "Umfrage klonen",
			deploy: "Deploy",
			deployAriaLabel: "Zur Deployment-Ansicht",
			save: "Speichern"
		},
		stickyBar: {
			unsaved: "● Ungespeicherte Änderungen vorhanden",
			allSaved: "✓ Alle Änderungen gespeichert",
			back: "Zurück",
			save: "Umfrage speichern"
		},
		meta: {
			title: "Allgemeine Umfrageeinstellungen",
			surveyTitle: "Titel der Umfrage",
			technicalName: "Technischer Name (Automatisch aus Titel & ID)",
			description: "Beschreibung",
			greeting: "Begrüßungsnachricht (Greeting)",
			closing: "Verabschiedungsnachricht (Closing)",
			placeholders: {
				title: "z. B. Kundenzufriedenheit 2026",
				description: "Interne Beschreibung oder Kontext zur Umfrage...",
				greeting: "Vielen Dank, dass Sie sich kurz Zeit nehmen...",
				closing: "Vielen Dank für Ihr wertvolles Feedback!"
			}
		},
		save: {
			validationErrorSummary: "Validierungsfehler",
			validationErrorFallback: "Bitte beheben Sie die markierten Fehler vor dem Speichern.",
			successSummary: "Erfolgreich gespeichert",
			successDetail: "Umfrage „{title}“ wurde in der Data Table aktualisiert.",
			errorSummary: "Speicherfehler",
			errorFallback: "Fehler beim Speichern der Umfrage in der Data Table."
		},
		discardConfirm: {
			header: "Änderungen verwerfen",
			message: "Möchten Sie alle nicht gespeicherten Änderungen wirklich verwerfen?",
			acceptLabel: "Ja, verwerfen",
			rejectLabel: "Abbrechen",
			toastSummary: "Zurückgesetzt",
			toastDetail: "Änderungen wurden verworfen."
		},
		deleteConfirm: {
			header: "Umfrage löschen",
			message: "Möchten Sie die Umfrage „{title}“ wirklich unwiderruflich löschen?",
			acceptLabel: "Ja, löschen",
			rejectLabel: "Abbrechen",
			successSummary: "Umfrage gelöscht",
			successDetail: "Die Umfrage „{title}“ wurde erfolgreich gelöscht.",
			errorSummary: "Fehler beim Löschen",
			errorFallback: "Fehler beim Löschen der Umfrage aus der Data Table."
		}
	},

	surveyLock: {
		unknownUser: "Unbekannter Benutzer",
		conflict: {
			header: "Umfrage wird bereits bearbeitet",
			message: "Diese Umfrage wird seit {date} von „{user}“ bearbeitet. Möchten Sie die Sperre ignorieren oder abbrechen?",
			acceptLabel: "Trotzdem bearbeiten",
			rejectLabel: "Abbrechen"
		}
	},

	surveyQuestions: {
		title: "Fragenkatalog",
		countStatus: "{count} von maximal 20 Fragen belegt (inkl. Folgefragen)",
		maxReached: "Maximum erreicht",
		addQuestion: "Frage hinzufügen",
		addQuestionAriaLabel: "Neue Frage zur Umfrage hinzufügen",
		addAnotherAriaLabel: "Weitere Frage zur Umfrage hinzufügen",
		empty: {
			title: "Diese Umfrage enthält noch keine Fragen.",
			description: "Erstellen Sie Ihre erste Frage, um mit der Umfragekonfiguration zu beginnen.",
			cta: "Erste Frage erstellen"
		},
		limitToast: {
			summary: "Limit erreicht",
			detail: "Eine Umfrage darf maximal 20 Fragen (inkl. Folgefragen) enthalten."
		}
	},

	surveyQuestion: {
		numberAriaLabel: "Fragenummer",
		mandatoryTag: "Pflichtfeld",
		moveUpAriaLabel: "Frage {number} nach oben verschieben",
		moveDownAriaLabel: "Frage {number} nach unten verschieben",
		delete: "Löschen",
		deleteAriaLabel: "Frage {number} löschen",
		deleteConfirm: {
			header: "Frage löschen",
			message: "Möchten Sie „{title}“ und alle zugehörigen Folgefragen wirklich unwiderruflich löschen?",
			acceptLabel: "Löschen",
			rejectLabel: "Abbrechen",
			fallbackTitle: "Frage #{number}"
		},
		followUps: {
			title: "Bedingte Folgefragen ({count})",
			hint: "Wird nur angezeigt, wenn die definierte Antwortbedingung erfüllt ist.",
			add: "Folgefrage hinzufügen",
			addAriaLabel: "Folgefrage zu Frage {number} hinzufügen"
		}
	},

	surveyQuestionFields: {
		technicalName: "Technischer Bezeichner (Name)",
		technicalNameHintShort: "(Unveränderbar für Reporting)",
		technicalNameHint: "Der Bezeichner wird für Reporting-Zwecke verwendet und kann nicht geändert werden.",
		type: "Fragetyp",
		typeSavedHint: "(Gespeichert - Typ unveränderbar)",
		mandatory: "Pflichtfrage",
		title: "Titel / Prompt",
		titlePlaceholder: "z. B. Wie zufrieden sind Sie mit unserem Service?",
		reprompt: "Wiederholungsaufforderung (Reprompt)",
		repromptPlaceholder: "Zweite Aufforderung zur Beantwortung der Frage (optional).",
		description: "Beschreibung / Hilfetext",
		descriptionPlaceholder: "Ergänzende Hinweise für den Befragten..."
	},

	surveyFollowUp: {
		legend: "Folgefrage #{number}",
		fieldsetAriaLabel: "Folgefrage {number}",
		delete: "Löschen",
		deleteAriaLabel: "Folgefrage {number} löschen",
		deleteConfirm: {
			header: "Folgefrage löschen",
			message: "Möchten Sie diese Folgefrage wirklich entfernen?",
			acceptLabel: "Löschen",
			rejectLabel: "Abbrechen"
		},
		title: "Titel / Prompt",
		titlePlaceholder: "z. B. Was war der Grund für Ihre Bewertung?",
		type: "Fragetyp",
		typeSavedHint: "(Gespeichert - Typ unveränderbar)",
		reprompt: "Wiederholungsaufforderung (Reprompt)",
		repromptPlaceholder: "Zweite Aufforderung zur Beantwortung der Frage (optional).",
		description: "Beschreibung / Hilfetext",
		descriptionPlaceholder: "Zusätzliche Erklärung für den Teilnehmer..."
	},

	surveyCondition: {
		label: "Bedingung zur Anzeige:",
		operator: "Operator",
		operatorDuplicate: "Der Komparator wird bereits von Folgefrage {number} verwendet.",
		valueChoice: "Antwort entspricht Option",
		valueOther: "Vergleichswert",
		choicePlaceholder: "Wähle Option...",
		choiceDuplicate: "Diese Option wird bereits von Folgefrage {number} verwendet.",
		unnamedOption: "Option ({id})"
	},

	ratingOptions: {
		scaleLabel: "Bewertungsskala konfigurieren (0 bis max. 8):",
		min: "Minimalwert (0 bis 7)",
		max: "Maximalwert (1 bis 8)",
		previewLabel: "Vorschau der Skala:"
	},

	choiceOptions: {
		label: "Auswahloptionen (2 bis max. 5 Optionen):",
		add: "Option hinzufügen",
		hint: "Optional Synonyme durch Komma getrennt angeben, z. B. „Orange, Apfelsine, Saftorange“. Das erste Wort ist die Option, alle weiteren sind Synonyme.",
		optionSrLabel: "Option {number}",
		optionPlaceholder: "Option {number}, Synonym 1, Synonym 2",
		removeAriaLabel: "Option {number} entfernen",
		duplicate: "Option {number} überschneidet sich mit Option {otherNumber} (gleiches Label oder Synonym)."
	},

	typeHint: {
		nps: "Net Promoter Score verwendet eine standardisierte Skala von 0 (Sehr unwahrscheinlich) bis 10 (Sehr wahrscheinlich).",
		yesNo: "Ja / Nein Frage mit zwei standardisierten Antwortmöglichkeiten.",
		comment: "Offenes Freitextfeld für Rückmeldungen des Teilnehmers."
	},

	validation: {
		summaryTitle: "Bitte beheben Sie folgende Fehler:",
		questionTitleRequired: "Fragetitel darf nicht leer sein.",
		questionNameRequired: "Name der Frage darf nicht leer sein.",
		ratingOptionsInvalid: "Bewertungsoptionen sind ungültig.",
		ratingMinRange: "Minimalwert muss zwischen 0 und 8 liegen.",
		ratingMaxRange: "Maximalwert muss zwischen 0 und 8 liegen.",
		ratingMinLessThanMax: "Minimalwert muss kleiner als der Maximalwert sein.",
		choiceOptionsInvalid: "Auswahloptionen sind ungültig.",
		choiceMinOptions: "Eine Auswahlabfrage benötigt mindestens 2 Optionen.",
		choiceMaxOptions: "Eine Auswahlabfrage darf maximal 5 Optionen haben.",
		choiceOptionEmpty: "Option {number} darf nicht leer sein.",
		choiceOptionDuplicate: "Option {number} überschneidet sich mit Option {otherNumber} (gleiches Label oder Synonym).",
		followUpMissing: "Folgefrage fehlt.",
		followUpOperatorDuplicate: "Der Komparator \"{operator}\" wird bereits von Folgefrage {number} verwendet. Jeder Komparator darf nur einmal verwendet werden.",
		followUpChoiceValueDuplicate: "Diese Auswahloption wird bereits von Folgefrage {number} verwendet. Jede Option darf nur eine Folgefrage haben.",
		surveyTitleRequired: "Der Titel der Umfrage darf nicht leer sein.",
		surveyNameRequired: "Der Name der Umfrage darf nicht leer sein.",
		surveyMinQuestions: "Eine Umfrage muss mindestens 1 Frage enthalten.",
		surveyMaxQuestions: "Eine Umfrage darf maximal 20 Fragen enthalten (inkl. Folgefragen). Aktuell: {count}."
	},

	deployment: {
		back: "Zurück zum Editor",
		backAriaLabel: "Zurück zum Editor",
		stage: "Stage",
		prod: "Prod",
		backup: "Backup",
		unnamedSurvey: "Unbenannte Umfrage",
		none: "–",
		deployStage: "Stage deployen",
		deployStageAriaLabel: "Draft auf Stage deployen",
		deployProd: "Prod deployen",
		deployProdAriaLabel: "Draft auf Prod deployen",
		rollback: "Rollback",
		rollbackAriaLabel: "Letze Version auf Prod zurückspielen",
		unknownError: "Unbekannter Fehler beim Deployment"
	},

	queueMapping: {
		title: "Queue Mapping",
		queueCount: "{count} Queue zugeordnet | {count} Queues zugeordnet",
		rate: "{rate}% Rate",
		loading: "Lade Queue-Mapping...",
		retry: "Erneut versuchen",
		intro: "Legen Sie fest, welchen Queues diese Umfrage nach Anrufende zugeordnet ist und mit welcher Wahrscheinlichkeit (Delivery Rate) sie ausgeliefert werden soll.",
		deliveryRateLabel: "Auslieferungswahrscheinlichkeit (Delivery Rate)",
		deliveryRateAriaLabel: "Auslieferungswahrscheinlichkeit in Prozent",
		queuesLabel: "Queues (eine Queue pro Zeile)",
		entriesCount: "{count} Eintrag | {count} Einträge",
		queuesHint: "Geben Sie die genauen Queue-Namen zeilenweise ein. Um das Mapping für diese Umfrage vollständig zu entfernen, leeren Sie das Textfeld und speichern Sie.",
		conflictHint: "Hinweis: {count} Queue ist bereits einer anderen Umfrage zugeordnet: | Hinweis: {count} Queues sind bereits einer anderen Umfrage zugeordnet:",
		conflictSurveyId: "aktuelle Umfrage ID: {id}",
		conflictFooter: "Beim Speichern werden Sie zur Bestätigung aufgefordert, bevor die bestehende Zuordnung überschrieben wird.",
		save: "Queue Mapping speichern",
		reset: "Änderungen zurücksetzen",
		overwriteConfirm: {
			header: "Bestehende Zuordnungen überschreiben?",
			message: "Die folgenden Queues sind aktuell bereits einer anderen Umfrage zugeordnet:\n\n{list}\n\nMöchten Sie diese Zuordnungen wirklich auf die aktuelle Umfrage übertragen und die bestehenden überschreiben?",
			listItem: "• {queueName} (Umfrage ID: {surveyId})",
			acceptLabel: "Ja, überschreiben",
			rejectLabel: "Abbrechen"
		},
		toast: {
			savedSummary: "Queue Mapping gespeichert",
			savedDetail: "Die Queue-Zuordnungen wurden erfolgreich in der Data Table aktualisiert."
		},
		loadErrorFallback: "Fehler beim Laden des Queue-Mappings",
		saveErrorFallback: "Fehler beim Speichern des Queue-Mappings in der Data Table"
	},

	controlToolbar: {
		searchPlaceholder: "Suchen...",
		save: "Speichern",
		saveAndClose: "Speichern & schließen",
		close: "Schließen",
		edit: "Bearbeiten",
		sessionExpired: {
			header: "Session abgelaufen",
			message: "Session abgelaufen, reaktivieren?",
			acceptLabel: "Ja",
			rejectLabel: "Nein"
		},
		toast: {
			lockedSummary: "Gesperrt",
			lockedDetail: "Die Konfiguration ist grad in Bearbeitung von: {name}",
			lockSummary: "Sperre",
			lockDetail: "Lock ist nicht mehr aktiv ({name}).",
			savedSummary: "Gespeichert",
			savedDetail: "Konfiguration gespeichert{suffix}.",
			savedSuffix: " (Draft v{version})",
			errorSummary: "Fehler",
			errorDetail: "Speichern fehlgeschlagen."
		}
	},

	app: {
		initErrorSummary: "Fehler",
		initErrorFallback: "Initialisierung fehlgeschlagen."
	},

	settings: {
		setup: {
			title: "Setup",
			empty: "Keine Setup-Metadaten verfügbar.",
			fields: {
				projectTag: "Projekt-Tag",
				domain: "Domain",
				launchUrl: "Start-URL",
				oauthFrontend: "Frontend-OAuth",
				integrationApp: "App-Integration",
				division: "Division",
				backendGroup: "Backend-Gruppe",
				backendRole: "Backend-Rolle",
				backendAuth: "Backend-Auth",
				backendClient: "Backend-Client",
				dataTable: "Data Table",
				dataActionIntegration: "Data-Action-Integration",
				dataAction: "Data Action",
				installedAt: "Installiert am"
			},
			uninstallHint: "Beim Deinstallieren werden die im Setup gespeicherten Ressourcen entfernt.",
			uninstall: "Deinstallieren"
		}
	},

	setup: {
		heroTitle: "Setup",
		logHeader: "Deployment Logs",
		startApp: "App starten",
		backToConfig: "Zurück zur Konfiguration",
		steps: {
			installation: "Installation",
			summary: "Zusammenfassung"
		},
		step1: {
			title: "Installation",
			description: "Wähle App-Integration, Frontend-OAuth und die Ziel-Division für die Installation.",
			projectTag: "Projekt-Tag",
			projectTagPlaceholder: "z. B. survey_app",
			integration: "Integration",
			integrationPlaceholder: "Integration auswählen",
			oauthClient: "OAuth-Client",
			oauthClientPlaceholder: "OAuth-Client auswählen",
			division: "Division",
			useExistingDivision: "Bestehende Division verwenden",
			createNewDivision: "Neue Division erzeugen",
			divisionPlaceholder: "Division auswählen",
			next: "Weiter"
		},
		step2: {
			title: "Zusammenfassung",
			description: "Es werden eine Data Table, ein Backend-OAuth-Client und eine Data Action für die Bewertungsantworten angelegt.",
			project: "Projekt",
			appIntegration: "App-Integration",
			oauthClient: "OAuth-Client",
			division: "Division",
			newDivision: "Neu: {name}_division",
			back: "Zurück",
			start: "Installation starten"
		},
		toast: {
			successSummary: "Erfolg",
			successDetail: "Setup abgeschlossen.",
			errorSummary: "Fehler",
			errorDetail: "Setup fehlgeschlagen. Bitte Logs prüfen."
		}
	},

	uninstall: {
		heroTitle: "Projekt deinstallieren",
		stepTitle: "Installierte Ressourcen entfernen",
		installationLabel: "Installation:",
		warning: "Diese Aktion entfernt die durch das Setup erzeugten Ressourcen aus Genesys Cloud. Dazu gehören Data Table, Backend OAuth Client und Data Action Integration. Möchtest du fortfahren?",
		logHeader: "SYSTEM TERMINAL - UNINSTALL_LOG",
		cancel: "Abbrechen",
		remove: "Installation entfernen",
		back: "Zurück zum Menü",
		finish: "Fertig",
		toast: {
			removedSummary: "Installation entfernt",
			removedDetail: "Die installierten App-Ressourcen wurden entfernt.",
			failedSummary: "Löschen fehlgeschlagen",
			divisionKeptSummary: "Division bleibt erhalten",
			divisionKeptDetail: "Die erzeugte Division konnte nicht gelöscht werden und bleibt bestehen."
		}
	},

	questionTypes: {
		rating: "Bewertung (rating)",
		choice: "Auswahl (choice)",
		yes_no: "Ja / Nein (yes_no)",
		nps: "NPS (nps)",
		comment: "Kommentar / Text (comment)",
		commentFollowUp: "Freitext / Kommentar (comment)"
	},

	operators: {
		equals: "ist gleich (equals)",
		less_than: "ist kleiner als (less_than)",
		greater_than: "ist größer als (greater_than)"
	},

	booleanOptions: {
		yes: "Ja (true)",
		no: "Nein (false)"
	}
};

export type MessageSchema = typeof de;
