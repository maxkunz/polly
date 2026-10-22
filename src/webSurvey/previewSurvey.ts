import type { FlowAnswers } from "@/domain/survey/flowNavigation";
import type { SurveyLanguage } from "@/domain/survey/flowTypes";
import type { WebSurvey } from "@/domain/survey/webSurveyTypes";

/**
 * Feste Beispielumfrage der Design-Vorschau (`survey.html?preview=1`, siehe `previewMode.ts`): alle
 * Fragetypen, eine eingeblendete Folgefrage, Min/Max-Labels, ein Pflichtfehler (NPS unbeantwortet)
 * samt Fehlerübersicht und ein Hinweis. Ruft keine API auf.
 */

const RATING = "preview-rating";
const REASON = "preview-reason";
const NPS = "preview-nps";
const CONTACT = "preview-contact";
const COMMENT = "preview-comment";

interface PreviewTexts {
	title: string;
	greeting: string;
	closing: string;
	rating: string;
	ratingDescription: string;
	ratingMin: string;
	ratingMax: string;
	reason: string;
	reasons: string[];
	nps: string;
	npsMin: string;
	npsMax: string;
	contact: string;
	comment: string;
	commentDescription: string;
	commentAnswer: string;
}

const TEXTS: Record<SurveyLanguage, PreviewTexts> = {
	de: {
		title: "Wie zufrieden waren Sie mit unserem Service?",
		greeting: "Vielen Dank, dass Sie sich kurz Zeit nehmen. Die Umfrage dauert etwa zwei Minuten.",
		closing: "Vielen Dank für Ihre Rückmeldung.",
		rating: "Wie bewerten Sie das Gespräch insgesamt?",
		ratingDescription: "1 = sehr schlecht, 5 = sehr gut",
		ratingMin: "sehr schlecht",
		ratingMax: "sehr gut",
		reason: "Was hat Sie am meisten gestört?",
		reasons: ["Wartezeit", "Freundlichkeit", "Lösung meines Anliegens"],
		nps: "Wie wahrscheinlich ist es, dass Sie uns weiterempfehlen?",
		npsMin: "unwahrscheinlich",
		npsMax: "sehr wahrscheinlich",
		contact: "Dürfen wir Sie zu Ihrer Rückmeldung kontaktieren?",
		comment: "Möchten Sie uns noch etwas mitteilen?",
		commentDescription: "Optional, höchstens 2000 Zeichen.",
		commentAnswer: "Die Wartezeit war etwas lang, sonst alles gut."
	},
	en: {
		title: "How satisfied were you with our service?",
		greeting: "Thank you for taking a moment. The survey takes about two minutes.",
		closing: "Thank you for your feedback.",
		rating: "How would you rate the conversation overall?",
		ratingDescription: "1 = very poor, 5 = very good",
		ratingMin: "very poor",
		ratingMax: "very good",
		reason: "What bothered you most?",
		reasons: ["Waiting time", "Friendliness", "Resolution of my request"],
		nps: "How likely are you to recommend us?",
		npsMin: "not likely",
		npsMax: "very likely",
		contact: "May we contact you about your feedback?",
		comment: "Is there anything else you would like to tell us?",
		commentDescription: "Optional, up to 2000 characters.",
		commentAnswer: "The waiting time was a bit long, otherwise all good."
	},
	fr: {
		title: "Êtes-vous satisfait de notre service ?",
		greeting: "Merci de prendre un instant. L’enquête dure environ deux minutes.",
		closing: "Merci pour votre retour.",
		rating: "Comment évaluez-vous l’échange dans l’ensemble ?",
		ratingDescription: "1 = très mauvais, 5 = très bon",
		ratingMin: "très mauvais",
		ratingMax: "très bon",
		reason: "Qu’est-ce qui vous a le plus dérangé ?",
		reasons: ["Temps d’attente", "Amabilité", "Résolution de ma demande"],
		nps: "Quelle est la probabilité que vous nous recommandiez ?",
		npsMin: "peu probable",
		npsMax: "très probable",
		contact: "Pouvons-nous vous contacter au sujet de votre retour ?",
		comment: "Souhaitez-vous ajouter quelque chose ?",
		commentDescription: "Facultatif, 2000 caractères au maximum.",
		commentAnswer: "L’attente était un peu longue, sinon tout allait bien."
	}
};

export function previewSurvey(language: SurveyLanguage): WebSurvey {
	const text = TEXTS[language];
	return {
		id: "preview",
		title: text.title,
		description: "",
		greeting_prompt: text.greeting,
		closing_prompt: text.closing,
		language,
		start_question_id: RATING,
		version: 1,
		questions: [
			{
				id: RATING,
				type: "rating",
				prompt: text.rating,
				description: text.ratingDescription,
				mandatory: true,
				default_next_question_id: NPS,
				options: { values: [1, 2, 3, 4, 5], min_value: 1, max_value: 5, min_label: text.ratingMin, max_label: text.ratingMax },
				conditional_next_question: [
					{ operator: "equals", value: -1, next_question_id: null },
					{ operator: "less_than", value: 3, next_question_id: REASON },
					{ operator: "greater_than", value: 1000, next_question_id: null }
				]
			},
			{
				id: REASON,
				type: "choice",
				prompt: text.reason,
				description: "",
				mandatory: false,
				default_next_question_id: null,
				labels: text.reasons,
				next_question_ids: text.reasons.map(() => null)
			},
			{
				id: NPS,
				type: "nps",
				prompt: text.nps,
				description: "",
				mandatory: true,
				default_next_question_id: CONTACT,
				options: { min_label: text.npsMin, max_label: text.npsMax },
				conditional_next_question: [
					{ operator: "equals", value: -1, next_question_id: null },
					{ operator: "less_than", value: -1000, next_question_id: null },
					{ operator: "greater_than", value: 1000, next_question_id: null }
				]
			},
			{
				id: CONTACT,
				type: "yes_no",
				prompt: text.contact,
				description: "",
				mandatory: false,
				default_next_question_id: COMMENT,
				options: { yes_next_question_id: null, no_next_question_id: null }
			},
			{
				id: COMMENT,
				type: "comment",
				prompt: text.comment,
				description: text.commentDescription,
				mandatory: false,
				default_next_question_id: null
			}
		]
	};
}

/** Antworten der Vorschau: Bewertung 2 blendet die Folgefrage ein, NPS bleibt leer (Pflichtfehler). */
export function previewAnswers(language: SurveyLanguage): FlowAnswers {
	const text = TEXTS[language];
	return {
		[RATING]: 2,
		[REASON]: text.reasons[0],
		[CONTACT]: true,
		[COMMENT]: text.commentAnswer
	};
}
