/**
 * Feste Texte der öffentlichen Umfrageseite. Bewusst getrennt von `src/i18n/locales/` der Genesys-App:
 * Die Seite braucht nur diese Texte und nur die Umfragesprachen `de`/`en`/`fr` (`SURVEY_LANGUAGES`),
 * das öffentliche Bundle bleibt so klein. `de.ts` ist das Schema, `en.ts` und `fr.ts` haben dieselben Keys.
 */
export const de = {
	pageTitle: "Umfrage",
	loading: "Umfrage wird geladen …",
	requiredHint: "Mit * markierte Fragen sind Pflichtangaben.",
	submit: "Absenden",
	submitting: "Wird gesendet …",
	retry: "Erneut versuchen",
	yes: "Ja",
	no: "Nein",
	commentCounter: "{count} von {max} Zeichen",
	followUpShown: "Zusätzliche Frage: {prompt}",
	done: {
		title: "Vielen Dank!",
		fallback: "Ihre Antworten wurden gespeichert."
	},
	stagePreview: {
		banner: "Vorschau von Version {version} (Stage) – Ihre Antworten werden nicht gespeichert.",
		notSaved: "In der Vorschau werden keine Ergebnisse gespeichert."
	},
	errorSummary: {
		title: "Bitte prüfen Sie Ihre Angaben | Bitte prüfen Sie {count} Angaben",
		required: "Bitte beantworten Sie diese Frage.",
		invalid_value: "Diese Antwort ist ungültig. Bitte wählen Sie erneut.",
		general: "Ihre Antworten passen nicht zur aktuellen Fassung der Umfrage. Bitte prüfen Sie Ihre Angaben."
	},
	notice: {
		surveyChanged: "Die Umfrage wurde zwischenzeitlich aktualisiert. Bitte prüfen Sie Ihre Antworten und senden Sie erneut ab.",
		throttled: "Der Dienst ist gerade stark ausgelastet. Bitte versuchen Sie es in einem Moment erneut.",
		error: "Ihre Antworten konnten nicht gesendet werden. Bitte versuchen Sie es erneut."
	},
	status: {
		invalid: {
			title: "Einladung ist ungültig",
			text: "Bitte prüfen Sie, ob Sie den Link vollständig aus Ihrer Einladung übernommen haben."
		},
		expired: {
			title: "Einladung ist abgelaufen",
			text: "Die Teilnahme über diesen Link ist nicht mehr möglich."
		},
		used: {
			title: "Diese Einladung wurde bereits verwendet",
			text: "Über diesen Link wurde bereits an der Umfrage teilgenommen."
		},
		unavailable: {
			title: "Umfrage nicht verfügbar",
			text: "Diese Umfrage ist derzeit nicht verfügbar."
		},
		throttled: {
			title: "Dienst ausgelastet",
			text: "Der Dienst ist gerade stark ausgelastet. Bitte versuchen Sie es in einem Moment erneut."
		},
		error: {
			title: "Umfrage konnte nicht geladen werden",
			text: "Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut."
		}
	}
};

export type WebSurveyMessages = typeof de;
