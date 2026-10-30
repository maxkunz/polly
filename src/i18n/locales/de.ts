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
		en: "English",
		fr: "Français",
		tlh: "tlhIngan Hol (i18n-Test)",
		la: "Latein (i18n-Test)"
	},

	modules: {
		dashboard: {
			title: "Dashboard",
			description: "Übersicht über die verfügbaren Module im Template."
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

	permissions: {
		missingWrite: "Keine Berechtigung – Schreibrechte fehlen.",
		missingDeploy: "Keine Berechtigung – Deployrechte fehlen.",
		missingExport: "Keine Berechtigung – Rechte zum Export der Ergebnisse fehlen.",
		readOnlyBanner: "Nur Lesezugriff: Das Erstellen, Bearbeiten, Klonen und Löschen von Umfragen erfordert Schreibrechte.",
		deployReadOnlyBanner: "Nur Lesezugriff: Für Deployments, Rollback und Queue-Mapping werden Deployrechte benötigt."
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
			invalidIndex: "Die Umfrageliste (Zeile survey_list) ist beschädigt und wird nicht überschrieben.",
			unnamedSurvey: "Unbenannte Umfrage",
			openAriaLabel: "Umfrage öffnen: {title}",
			edit: "Bearbeiten",
			view: "Ansehen",
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
			report: "Report",
			reportAriaLabel: "Zur Report-Ansicht",
			invite: "Einladungslinks",
			inviteAriaLabel: "Zur Ansicht Einladungslinks (Web)",
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
			greeting: "Begrüßungsnachricht",
			closing: "Verabschiedungsnachricht",
			baseUrl: "Basis-URL für Einladungslinks (Web)",
			baseUrlHint: "Optional. Absolute https-URL, z. B. die Seite, in die die Umfrage eingebettet ist. Mit {placeholder} bestimmen Sie, wo der Token im Link steht, sonst wird ?token=… angehängt.",
			baseUrlHintDefault: "Ohne Angabe gilt die Standard-Basis-URL aus den Einstellungen: {url}",
			baseUrlHintFallback: "Ohne Angabe zeigt der Link auf die Polly-Umfrageseite.",
			language: "Sprache der Web-Umfrage",
			webTheme: "Design der Web-Umfrage",
			webThemeHint: "Schrift, Textgrößen und Farben der Umfrageseite. Pflege unter Einstellungen → Web-Designs. Ein Wechsel wirkt nach dem Deploy nach Prod.",
			webThemeDefault: "Standard des Mandanten (Polly-Design)",
			webThemeDefaultNamed: "Standard des Mandanten ({name})",
			webThemeMissing: "Das gewählte Design wurde gelöscht. Die Umfrage nutzt das Standard-Design, bis Sie ein anderes wählen.",
			webThemeMissingOption: "Gelöschtes Design",
			webThemeLoadingOption: "Gewähltes Design (wird geladen …)",
			webThemeUnavailableOption: "Gewähltes Design (Liste nicht abrufbar)",
			placeholders: {
				title: "z. B. Kundenzufriedenheit",
				description: "Interne Beschreibung oder Kontext zur Umfrage...",
				greeting: "Vielen Dank, dass Sie sich kurz Zeit nehmen...",
				closing: "Vielen Dank für Ihr wertvolles Feedback!",
				baseUrl: "https://www.beispiel.de/umfrage/{placeholder}"
			}
		},
		save: {
			validationErrorSummary: "Validierungsfehler",
			validationErrorFallback: "Bitte beheben Sie die markierten Fehler vor dem Speichern.",
			successSummary: "Erfolgreich gespeichert",
			successDetail: "Umfrage „{title}“ wurde aktualisiert.",
			errorSummary: "Speicherfehler",
			errorFallback: "Fehler beim Speichern der Umfrage in der Data Table."
		},
		flowSize: {
			warnTitle: "Textmenge der Umfrage nähert sich dem Limit",
			warnDetail: "Die Umfrage nutzt {percent} % der maximal möglichen Textmenge ({length} von {max} Zeichen inkl. technischer Daten). Über 100 % kann sie weiterhin gespeichert, aber nicht mehr deployt werden.",
			exceededTitle: "Textmenge der Umfrage ist zu groß",
			exceededDetail: "Die Umfrage nutzt {percent} % der maximal möglichen Textmenge ({length} von {max} Zeichen inkl. technischer Daten). Sie kann als Entwurf gespeichert, aber nicht deployt werden. Bitte kürzen Sie längere Texte.",
			announceWarn: "Warnung: Die Textmenge der Umfrage hat {percent} % des Limits erreicht.",
			announceExceeded: "Die Textmenge der Umfrage ist zu groß. Deployen ist erst möglich, wenn längere Texte gekürzt wurden.",
			announceOk: "Die Textmenge der Umfrage liegt wieder im unkritischen Bereich."
		},
		discardConfirm: {
			header: "Änderungen verwerfen",
			message: "Möchten Sie alle nicht gespeicherten Änderungen wirklich verwerfen?",
			acceptLabel: "Ja, verwerfen",
			rejectLabel: "Abbrechen",
			toastSummary: "Zurückgesetzt",
			toastDetail: "Änderungen wurden verworfen."
		},
		saveConflict: {
			header: "Umfrage wurde zwischenzeitlich geändert",
			message: "An dieser Umfrage wurden zwischenzeitlich Änderungen gespeichert, z. B. von einem anderen Nutzer (Ihr Stand basiert auf v{expected}, gespeichert ist v{current}). Möchten Sie die gespeicherte Fassung mit Ihren Änderungen überschreiben oder die gespeicherte Fassung laden? Beim Laden gehen Ihre ungespeicherten Änderungen verloren.",
			overwriteLabel: "Überschreiben",
			cancelLabel: "Abbrechen",
			loadLabel: "Änderungen laden",
			loadedSummary: "Neu geladen",
			loadedDetail: "Die gespeicherte Fassung v{version} wurde geladen.",
			loadErrorSummary: "Laden fehlgeschlagen"
		},
		deleteConfirm: {
			header: "Umfrage löschen",
			message: "Möchten Sie die Umfrage „{title}“ wirklich unwiderruflich löschen? Alle gesammelten Ergebnisse der Umfrage werden dabei ebenfalls endgültig gelöscht.",
			acceptLabel: "Ja, löschen",
			rejectLabel: "Abbrechen",
			successSummary: "Umfrage gelöscht",
			successDetail: "Die Umfrage „{title}“ wurde erfolgreich gelöscht.",
			errorSummary: "Fehler beim Löschen",
			errorFallback: "Fehler beim Löschen der Umfrage aus der Data Table.",
			resultsSummary: "Ergebnisse werden gelöscht",
			resultsDetail: "Die Ergebnisse der Umfrage werden im Hintergrund gelöscht. Das kann einige Zeit dauern.",
			resultsErrorSummary: "Ergebnisse nicht gelöscht",
			resultsErrorFallback: "Die Umfrage wurde gelöscht, das Löschen der Ergebnisse konnte aber nicht gestartet werden."
		}
	},

	surveyLock: {
		unknownUser: "Unbekannter Benutzer",
		conflict: {
			header: "Umfrage wird bereits bearbeitet",
			message: "Diese Umfrage wird seit {date} von „{user}“ bearbeitet. Möchten Sie die Umfrage trotzdem bearbeiten oder nur ansehen?",
			acceptLabel: "Trotzdem bearbeiten",
			rejectLabel: "Nur anschauen"
		},
		readOnlyBanner: "Schreibgeschützt: Diese Umfrage wird gerade von „{user}“ bearbeitet. Änderungen sind deaktiviert."
	},

	surveyQuestions: {
		title: "Fragenkatalog",
		countStatus: "{count} von maximal {max} Fragen belegt (inkl. Folgefragen)",
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
			detail: "Eine Umfrage darf maximal {max} Fragen (inkl. Folgefragen) enthalten."
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
		valueChoice: "Antwort entspricht Option",
		valueOther: "Vergleichswert",
		choicePlaceholder: "Wähle Option...",
		unnamedOption: "Option ({id})"
	},

	ratingOptions: {
		scaleLabel: "Bewertungsskala konfigurieren ({min} bis max. {max}):",
		min: "Minimalwert ({min} bis {max})",
		max: "Maximalwert ({min} bis {max})",
		previewLabel: "Vorschau der Skala:",
		minLabel: "Label für den Minimalwert (optional)",
		maxLabel: "Label für den Maximalwert (optional)",
		labelsHint: "Wird nur in Web-Umfragen an den Enden der Skala angezeigt und nicht vorgelesen.",
		minLabelPlaceholder: "z. B. sehr schlecht",
		maxLabelPlaceholder: "z. B. ausgezeichnet"
	},

	choiceOptions: {
		label: "Auswahloptionen ({min} bis max. {max} Optionen):",
		add: "Option hinzufügen",
		hint: "Optional Synonyme durch Komma getrennt angeben, z. B. „Orange, Apfelsine, Saftorange“. Das erste Wort ist die Option, alle weiteren sind Synonyme.",
		optionSrLabel: "Option {number}",
		optionPlaceholder: "Option {number}, Synonym 1, Synonym 2",
		defaultLabel: "Option {number}",
		removeAriaLabel: "Option {number} entfernen"
	},

	typeHint: {
		nps: "Net Promoter Score verwendet eine standardisierte Skala von 0 (Sehr unwahrscheinlich) bis 10 (Sehr wahrscheinlich).",
		yesNo: "Ja / Nein Frage mit zwei standardisierten Antwortmöglichkeiten.",
		comment: "Offenes Freitextfeld für Rückmeldungen des Teilnehmers."
	},

	promptTextarea: {
		ttsLimitHint: "Wird per Sprachausgabe vorgelesen, maximal {max} Zeichen.",
		ttsCounter: "{length} von maximal {max} Zeichen",
		ttsTooLong: "Text zu lang: {length} von maximal {max} Zeichen. Bitte kürzen Sie den Text, sonst kann die Umfrage nicht gespeichert werden.",
		ttsAnnounceTooLong: "Text zu lang: {length} von maximal {max} Zeichen. Die Umfrage kann so nicht gespeichert werden.",
		ttsAnnounceOk: "Textlänge wieder innerhalb des Limits."
	},

	validation: {
		summaryTitle: "Bitte beheben Sie folgende Fehler:",
		summaryHint: "Ein Klick auf einen Fehler springt zum betroffenen Feld.",
		questionTitleRequired: "Fragetitel darf nicht leer sein.",
		questionNameRequired: "Name der Frage darf nicht leer sein.",
		ratingOptionsInvalid: "Bewertungsoptionen sind ungültig.",
		ratingMinRange: "Minimalwert muss zwischen {min} und {max} liegen.",
		ratingMaxRange: "Maximalwert muss zwischen {min} und {max} liegen.",
		ratingMinLessThanMax: "Minimalwert muss kleiner als der Maximalwert sein.",
		choiceOptionsInvalid: "Auswahloptionen sind ungültig.",
		choiceMinOptions: "Eine Auswahlabfrage benötigt mindestens {min} Optionen.",
		choiceMaxOptions: "Eine Auswahlabfrage darf maximal {max} Optionen haben.",
		choiceOptionEmpty: "Option {number} darf nicht leer sein.",
		choiceOptionDuplicate: "Option {number} überschneidet sich mit Option {otherNumber} (gleiches Label oder Synonym).",
		followUpMissing: "Folgefrage fehlt.",
		followUpsNotAllowed: "Fragen vom Typ Kommentar können keine Folgefragen haben. Bitte die Folgefragen entfernen oder einen anderen Fragetyp wählen.",
		followUpsTooDeep: "Folgefragen dürfen keine eigenen Folgefragen haben.",
		followUpValueRequired: "Bitte einen gültigen Wert für die Bedingung angeben.",
		followUpOperatorDuplicate: "Der Komparator \"{operator}\" wird bereits von Folgefrage {number} verwendet. Jeder Komparator darf nur einmal verwendet werden.",
		followUpValueDuplicate: "Dieser Wert wird bereits von Folgefrage {number} verwendet. Jeder mögliche Antwortwert darf nur eine Folgefrage haben.",
		surveyTitleRequired: "Der Titel der Umfrage darf nicht leer sein.",
		surveyNameRequired: "Der Name der Umfrage darf nicht leer sein.",
		surveyMinQuestions: "Eine Umfrage muss mindestens 1 Frage enthalten.",
		surveyMaxQuestions: "Eine Umfrage darf maximal {max} Fragen enthalten (inkl. Folgefragen). Aktuell: {count}.",
		ttsTextTooLong: "„{field}“ ist zu lang ({length} von maximal {max} Zeichen). Texte, die per Sprachausgabe vorgelesen werden, dürfen höchstens {max} Zeichen lang sein. Bitte kürzen Sie den Text.",
		baseUrlInvalid: "Die Basis-URL muss eine gültige, absolute https-URL sein, z. B. https://www.beispiel.de/umfrage/{placeholder}.",
		baseUrlTokenCount: "Die Basis-URL darf den Platzhalter {placeholder} höchstens einmal enthalten.",
		baseUrlTooLong: "Die Basis-URL darf höchstens {max} Zeichen lang sein.",
		languageInvalid: "Bitte eine gültige Sprache wählen.",
		webThemeInvalid: "Bitte ein gültiges Web-Design wählen.",
		scaleLabelTooLong: "„{field}“ ist zu lang (maximal {max} Zeichen)."
	},

	translator: {
		yesNoInvalidValue: "Ungültiger Bedingungswert für Fragetyp yes_no: {value}",
		equalsOnly: "Fragetyp {type} erlaubt nur den Operator \"equals\".",
		duplicateYesNo: "Mehrere Folgefragen für die Bedingung \"{value}\".",
		choiceOptionsMissing: "Fragetyp choice benötigt Auswahloptionen (options.labels).",
		unknownLabelId: "Unbekannte Auswahloption \"{labelId}\" in einer Folgefrage-Bedingung.",
		duplicateChoice: "Mehrere Folgefragen für dieselbe Auswahloption \"{labelId}\".",
		ratingOptionsMissing: "Fragetyp rating benötigt eine Skala (options.min_value/max_value).",
		duplicateOperator: "Operator \"{operator}\" ist bei den Folgefragen mehrfach vorhanden.",
		valueNotNumeric: "Bedingungswert \"{value}\" ist keine Zahl.",
		commentNoFollowUps: "Fragetyp comment darf keine Folgefragen haben.",
		unknownType: "Unbekannter Fragetyp \"{type}\".",
		noQuestions: "Die Umfrage enthält keine Fragen.",
		emptyDraft: "Der Entwurf ist leer, das Deployment wurde abgebrochen.",
		invalidJson: "Der Entwurf konnte nicht als JSON gelesen werden: {error}",
		questionContext: "{message} (Frage: {question})"
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
		alreadyInProd: "Version v{version} ist bereits in Prod deployed. Ein erneutes Prod-Deployment ist erst nach einer Änderung am Entwurf möglich.",
		unknownError: "Unbekannter Fehler beim Deployment",
		draftChanged: "Der Entwurf wurde zwischenzeitlich geändert (angezeigt: v{expected}, aktuell: v{current}), z. B. von einem anderen Nutzer. Es wurde nichts deployt. Die Ansicht zeigt jetzt den aktuellen Stand – bitte prüfen und erneut deployen.",
		prodChanged: "Prod wurde zwischenzeitlich geändert, z. B. durch ein Deployment eines anderen Nutzers. Der Rollback wurde nicht ausgeführt. Die Ansicht zeigt jetzt den aktuellen Stand – bitte prüfen und den Rollback ggf. erneut ausführen.",
		webPreview: "Webvorschau",
		webPreviewAriaLabel: "Stage-Stand als Web-Umfrage in neuem Tab öffnen",
		webPreviewHint: "Webvorschau öffnet den Stage-Stand als Web-Umfrage in einem neuen Tab. Der Link gilt {days} Tage, Antworten werden nicht gespeichert.",
		webPreviewBlocked: "Der Browser hat das neue Fenster blockiert.",
		webPreviewOpenLink: "Webvorschau öffnen",
		webPreviewErrors: {
			missingToken: "Nicht angemeldet – bitte die Seite neu laden.",
			missingRole: "Keine Berechtigung – Deployrechte fehlen.",
			noStage: "Für diese Umfrage ist kein Stage-Stand deployt.",
			throttled: "Zu viele Anfragen – bitte in einem Moment erneut versuchen.",
			generic: "Webvorschau konnte nicht geöffnet werden"
		},
		payloadTooLarge: "Die Gesamttextmenge der Umfrage ist zu groß ({length} von maximal {max} Zeichen inkl. technischer Daten), daher kann sie nicht deployt werden. Bitte kürzen Sie längere Texte im Editor und speichern Sie die Umfrage erneut."
	},

	report: {
		back: "Zurück zum Editor",
		backAriaLabel: "Zurück zum Editor",
		from: "Von",
		to: "Bis",
		range: "Zeitraum",
		quickRanges: {
			today: "Heute",
			last7Days: "Letzte 7 Tage",
			last30Days: "Letzte 30 Tage",
			currentMonth: "Aktueller Monat",
			lastMonth: "Letzter Monat"
		},
		hint: "Der Zeitraum bezieht sich auf den Start der Umfrage-Sitzung (erste Antwort).",
		version: "Survey-Version",
		allVersions: "Alle Versionen",
		versionOption: "v{version} ({sessions})",
		summary: {
			title: "Vorschau",
			loading: "Lade Vorschau … ({sessions} Sitzungen bisher)",
			liveUpdating: "Aktualisiert automatisch",
			sessions: "Sitzungen",
			completed: "Abgeschlossen",
			partial: "Laufend",
			timedOut: "Abgebrochen",
			tooltips: {
				sessions: "Alle Umfrage-Teilnahmen, die im gewählten Zeitraum begonnen wurden (mindestens eine Antwort).",
				completed: "Teilnahmen, bei denen die Umfrage bis zum Ende durchlaufen wurde.",
				partial: "Teilnahmen, die gerade laufen oder deren letzte Antwort weniger als 30 Minuten zurückliegt.",
				timedOut: "Teilnahmen, die vorzeitig verlassen wurden (z. B. aufgelegt oder Chat geschlossen) – 30 Minuten ohne weitere Antwort."
			},
			empty: "Im gewählten Zeitraum gibt es keine Sitzungen."
		},
		download: "CSV herunterladen",
		downloadAriaLabel: "CSV-Report herunterladen",
		cancel: "Abbrechen",
		progress: "{sessions} Sitzungen / {rows} Zeilen geladen",
		errors: {
			invalidRange: "Bitte einen gültigen Zeitraum wählen (Von darf nicht nach Bis liegen).",
			missingToken: "Kein Genesys-Zugriffstoken vorhanden. Bitte neu anmelden.",
			generic: "Fehler beim Laden des Reports"
		}
	},

	invitations: {
		back: "Zurück zum Editor",
		backAriaLabel: "Zurück zum Editor",
		title: "Einladungslinks",
		prodVersion: "Prod v{version}",
		intro: "Erzeugt personalisierte Links für die Web-Umfrage. Die Links zeigen auf den aktuellen Prod-Stand; ein späteres Deploy oder Rollback wirkt automatisch auch auf bereits verschickte Links.",
		noProd: "Die Umfrage hat noch keinen Prod-Stand. Bitte zuerst nach Prod deployen, dann können Einladungslinks erzeugt werden.",
		count: "Anzahl Links",
		countHint: "{min} bis {max} Links pro Erzeugung",
		expiry: "Ablaufdatum (optional)",
		expiryHint: "Gültig bis einschließlich 23:59:59 dieses Tages (Ihre Ortszeit). Ohne Datum laufen die Links nicht ab.",
		multi: "Mehrfach nutzbar",
		multiHintOn: "Jeder Link kann beliebig oft zur Teilnahme verwendet werden.",
		multiHintOff: "Jeder Link erlaubt genau eine Teilnahme.",
		linkTarget: "Ziel der Links",
		linkTargetBaseUrl: "Basis-URL aus den gespeicherten Umfrageeinstellungen:",
		linkTargetFallback: "Keine Basis-URL hinterlegt – die Links zeigen auf die Polly-Umfrageseite:",
		linkTargetDefault: "Standard-Basis-URL aus den Einstellungen:",
		generate: "Links erzeugen und CSV herunterladen",
		generateAriaLabel: "Einladungslinks erzeugen und als CSV herunterladen",
		notStoredHint: "Die Links werden nicht gespeichert. Bewahren Sie die CSV-Datei auf; verlorene Links können nur neu erzeugt werden.",
		success: "{count} Links erzeugt, die CSV-Datei wurde heruntergeladen.",
		errors: {
			missingToken: "Kein Genesys-Zugriffstoken vorhanden. Bitte neu anmelden.",
			missingRole: "Keine Berechtigung – Deployrechte fehlen.",
			noProd: "Die Umfrage hat keinen Prod-Stand (mehr). Bitte Ansicht neu laden.",
			throttled: "Genesys ist gerade ausgelastet. Bitte in einem Moment erneut versuchen.",
			expiryInPast: "Das Ablaufdatum liegt in der Vergangenheit.",
			baseUrlChanged: "Die Standard-Basis-URL wurde inzwischen geändert. Bitte das neue Ziel der Links prüfen und erneut erzeugen.",
			metaUnreadable: "Die Einstellungen in der Data Table (Zeile __meta) konnten nicht gelesen werden.",
			generic: "Fehler beim Erzeugen der Einladungslinks"
		}
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
			savedDetail: "Die Queue-Zuordnungen wurden erfolgreich aktualisiert."
		},
		loadErrorFallback: "Fehler beim Laden des Queue-Mappings",
		saveErrorFallback: "Fehler beim Speichern des Queue-Mappings in der Data Table"
	},

	controlToolbar: {
		searchPlaceholder: "Suchen...",
		close: "Schließen",
		edit: "Bearbeiten",
		toast: {
			lockedSummary: "Gesperrt",
			lockedDetail: "Die Konfiguration ist grad in Bearbeitung von: {name}"
		}
	},

	app: {
		initErrorSummary: "Fehler",
		initErrorFallback: "Initialisierung fehlgeschlagen.",
		sidebarCollapse: "Seitenleiste einklappen",
		sidebarExpand: "Seitenleiste ausklappen"
	},

	webThemes: {
		title: "Web-Designs",
		intro: "Designs der öffentlichen Umfrageseite (Schrift, Textstile, Farben). Jede Umfrage wählt im Editor ihr Design, ohne Auswahl gilt das Standard-Design. Änderungen an einem Design wirken nach höchstens 30 Sekunden auf allen Umfragen, die es nutzen.",
		list: {
			loading: "Designs werden geladen …",
			empty: "Noch keine Designs. Ohne Design erscheint die Umfrageseite im Polly-Design.",
			default: "Standard",
			edit: "Bearbeiten",
			view: "Ansehen",
			duplicate: "Duplizieren",
			delete: "Löschen",
			create: "Neues Design",
			newName: "Neues Design",
			copyName: "{name} (Kopie)",
			updated: "Geändert {date}",
			updatedBy: "Geändert {date} von {user}",
			limit: "Höchstens {max} Designs pro Mandant."
		},
		editor: {
			name: "Name",
			isDefault: "Standard-Design des Mandanten",
			font: "Schrift",
			fontHint: "Schriften des Systems; es werden keine Schriftdateien geladen.",
			textStyles: "Textstile",
			textStylesHint: "Größe in Pixeln bei Standardeinstellung des Browsers. Zoom und größere Grundschrift der Besucher wirken weiter.",
			role: "Textart",
			size: "Größe",
			weight: "Stärke",
			lineHeight: "Zeilenhöhe",
			reset: "Auf Standard zurücksetzen",
			resetAll: "Alle auf Standard",
			resetRole: "{role} auf Standard zurücksetzen",
			resetColor: "{color} auf Standard zurücksetzen",
			sizeOf: "Größe {role} in Pixeln, {min} bis {max}",
			weightOf: "Stärke {role}",
			lineHeightOf: "Zeilenhöhe {role}",
			colors: "Farben",
			transparentBackground: "Hintergrund transparent",
			transparentHint: "Für die Einbettung per iframe: Der Seitenhintergrund wird durchsichtig, die Karten behalten ihre Flächenfarbe.",
			preview: "Vorschau",
			previewHint: "Beispielumfrage mit allen Fragetypen. Beim Bearbeiten einer Textart wird sie hier markiert.",
			previewTitle: "Vorschau der Umfrageseite",
			save: "Speichern",
			cancel: "Abbrechen"
		},
		roles: {
			heading: "Überschrift",
			subheading: "Überschrift 2",
			body: "Fließtext",
			questionTitle: "Fragetitel",
			description: "Beschreibung",
			option: "Antwortoptionen",
			scaleLabel: "Skalen-Labels",
			hint: "Hinweise",
			error: "Fehlertexte",
			button: "Button"
		},
		weights: {
			w400: "Normal (400)",
			w500: "Mittel (500)",
			w600: "Halbfett (600)",
			w700: "Fett (700)"
		},
		fonts: {
			system: "Systemschrift",
			sans: "Serifenlos (Helvetica, Arial)",
			serif: "Serifenschrift (Charter, Georgia)",
			humanist: "Humanistisch (Seravek, Calibri)",
			rounded: "Abgerundet"
		},
		colors: {
			background: "Seitenhintergrund",
			surface: "Flächen (Karten)",
			text: "Text",
			heading: "Überschriften",
			textMuted: "Gedämpfter Text",
			primary: "Akzentfarbe",
			onPrimary: "Text auf Akzentfarbe",
			border: "Rahmen",
			error: "Fehler"
		},
		contrast: {
			warning: "Kontrast zu {background}: {ratio}:1, mindestens {minimum}:1 (WCAG AA).",
			summary: "Kontrastwarnungen: {count}. Speichern ist möglich, die Barrierefreiheit nach WCAG 2.2 AA ist mit diesem Design aber nicht zugesichert."
		},
		delete: {
			header: "Design löschen",
			message: "Design „{name}“ wirklich löschen?",
			usedBy: "Es wird von diesen Umfragen genutzt, die danach das Standard-Design zeigen: {surveys}.",
			unused: "Keine Umfrage nutzt dieses Design.",
			usageUnknown: "Ob Umfragen das Design nutzen, konnte nicht geprüft werden; betroffene Umfragen zeigen danach das Standard-Design.",
			accept: "Löschen",
			reject: "Abbrechen"
		},
		toast: {
			saved: "Design „{name}“ gespeichert",
			saveFailed: "Design konnte nicht gespeichert werden",
			deleted: "Design „{name}“ gelöscht",
			deleteFailed: "Design konnte nicht gelöscht werden"
		},
		errors: {
			missingToken: "Nicht angemeldet. Bitte die App neu laden.",
			missingRole: "Keine Berechtigung – Deployrechte fehlen.",
			limitReached: "Die Höchstzahl an Designs ist erreicht.",
			conflict: "Das Design wurde zwischenzeitlich von jemand anderem geändert oder gelöscht. Die Liste ist neu geladen, Ihre Eingaben sind erhalten. Erneutes Speichern überschreibt den aktuellen Stand.",
			throttled: "Der Dienst ist gerade ausgelastet. Bitte gleich erneut versuchen.",
			generic: "Fehler bei den Web-Designs"
		}
	},

	features: {
		web_survey: {
			label: "Web-Umfragen",
			description: "Umfragen per Einladungslink im Browser, inkl. Web-Designs und Web-Einstellungen im Editor."
		}
	},
	settings: {
		webDefaults: {
			title: "Web-Umfragen: Standard-Basis-URL",
			label: "Standard-Basis-URL für Einladungslinks",
			hint: "Gilt für alle Umfragen ohne eigene Basis-URL. Absolute https-URL; mit {placeholder} bestimmen Sie, wo der Token im Link steht, sonst wird ?token=… angehängt. Leer = Links zeigen auf die Polly-Umfrageseite.",
			save: "Speichern",
			saved: "Standard-Basis-URL gespeichert.",
			saveFailed: "Speichern fehlgeschlagen",
			metaUnreadable: "Die Einstellungen in der Data Table (Zeile __meta) konnten nicht gelesen werden."
		},
		features: {
			title: "Aktivierte Funktionen"
		},
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
				surveyDataTable: "Data Table Umfragen",
				mappingDataTable: "Data Table Queue-Mapping",
				dataActionIntegration: "Data-Action-Integration",
				dataAction: "Data Action",
				installedAt: "Installiert am"
			},
			uninstallHint: "Beim Deinstallieren werden die im Setup gespeicherten Ressourcen entfernt.",
			update: "Botflow aktualisieren",
			updateHint: "Das Update ersetzt den Botflow durch die aktuelle mitgelieferte Vorlage. Eigene Flow-Anpassungen werden überschrieben.",
			updateSuccess: "Botflow aktualisiert",
			updateSuccessDetail: "Der Botflow wurde erfolgreich aus der aktuellen Vorlage aktualisiert.",
			updateFailed: "Botflow konnte nicht aktualisiert werden",
			exportTemplates: "Flow-Templates exportieren",
			exportMissing: "Botflow oder Inbound-Flow fehlen in den Setup-Metadaten.",
			exportSuccess: "Botflow und Inbound-Flow wurden mit Platzhaltern exportiert.",
			exportFailed: "Fehler beim Flow-Export.",
			uninstall: "Deinstallieren"
		}
	},

	setup: {
		heroTitle: "Setup",
		logHeader: "Deployment Logs",
		startApp: "App starten",
		backToConfig: "Zurück zur Konfiguration",
		rollback: "Rollback",
		permissions: {
			title: "Fehlende Installer-Berechtigungen",
			description: "Für die Installation und den Rollback werden die folgenden Berechtigungen benötigt.",
			available: "Vorhanden",
			missing: "Fehlend",
			warningTitle: "Einige Setup-Optionen sind eingeschränkt",
			divisionHint: "Ohne Rechte zum Anlegen und Löschen einer Division kann nur eine bestehende Division verwendet werden.",
			checkedTitle: "Berechtigungen geprüft",
			checkedDetail: "Installer-Berechtigungen sind vorhanden.",
			loadErrorTitle: "Setup-Daten konnten nicht geladen werden",
			retry: "Erneut versuchen",
			requirements: {
				groupsManage: "Gruppen anlegen, lesen und löschen",
				rolesManage: "Rollen und Grants verwalten",
				integrationsView: "Integrationen lesen",
				integrationsManage: "Integrationen und Data Actions verwalten",
				oauthManage: "OAuth-Clients lesen und ändern",
				divisionsView: "Divisionen lesen",
				datatableManage: "Architect Data Tables und Rows verwalten",
				flowsManage: "Architect Flows verwalten",
				divisionCreate: "Neue Division anlegen und löschen"
			}
		},
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
			surveyDataTable: "Data Table Umfragen",
			mappingDataTable: "Data Table Queue-Mapping",
			dataTableHint: "Vollständige Namen der Data Tables. Existiert bereits eine Tabelle mit diesem Namen, wird sie übernommen und beim Deinstallieren nicht gelöscht.",
			dataTableNamesCollide: "Die beiden Data Tables brauchen unterschiedliche Namen.",
			features: "Funktionen",
			featuresHint: "Die Auswahl wird in der __meta-Zeile gespeichert und kann nach der Installation nur noch direkt in der Data Table geändert werden.",
			next: "Weiter"
		},
		step2: {
			title: "Zusammenfassung",
			description: "Es werden die Data Tables, ein Backend-OAuth-Client und eine Data Action für die Bewertungsantworten angelegt.",
			project: "Projekt",
			appIntegration: "App-Integration",
			oauthClient: "OAuth-Client",
			division: "Division",
			newDivision: "Neu: {name}_division",
			features: "Funktionen",
			noFeatures: "Keine",
			surveyDataTable: "Data Table Umfragen",
			mappingDataTable: "Data Table Queue-Mapping",
			back: "Zurück",
			start: "Installation starten"
		},
		toast: {
			successSummary: "Erfolg",
			successDetail: "Setup abgeschlossen.",
			errorSummary: "Fehler",
			errorDetail: "Setup fehlgeschlagen. Bitte Logs prüfen.",
			rollbackSummary: "Rollback erfolgreich",
			rollbackDetail: "Die bereits angelegten Ressourcen wurden entfernt.",
			rollbackErrorSummary: "Rollback fehlgeschlagen"
		}
	},

	uninstall: {
		heroTitle: "Projekt deinstallieren",
		stepTitle: "Installierte Ressourcen entfernen",
		installationLabel: "Installation:",
		warning: "Diese Aktion entfernt die durch das Setup erzeugten Genesys-Ressourcen, darunter beide Flows, beide Data Tables, die Data Action und den Backend-OAuth-Client. Der Backend-Tenant wird zur späteren Admin-Bereinigung als gelöscht markiert. Möchtest du fortfahren?",
		logHeader: "SYSTEM TERMINAL - UNINSTALL_LOG",
		cancel: "Abbrechen",
		remove: "Installation entfernen",
		retry: "Erneut versuchen",
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
