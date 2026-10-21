import type { WebSurveyMessages } from "./de";

export const fr: WebSurveyMessages = {
	pageTitle: "Enquête",
	loading: "Chargement de l’enquête …",
	requiredHint: "Les questions marquées d’un * sont obligatoires.",
	submit: "Envoyer",
	submitting: "Envoi en cours …",
	retry: "Réessayer",
	yes: "Oui",
	no: "Non",
	commentCounter: "{count} sur {max} caractères",
	followUpShown: "Question supplémentaire : {prompt}",
	done: {
		title: "Merci beaucoup !",
		fallback: "Vos réponses ont été enregistrées."
	},
	stagePreview: {
		banner: "Aperçu de la version {version} (stage) – vos réponses ne seront pas enregistrées.",
		notSaved: "Aucun résultat n’est enregistré en mode aperçu."
	},
	errorSummary: {
		title: "Veuillez vérifier votre réponse | Veuillez vérifier {count} réponses",
		required: "Veuillez répondre à cette question.",
		invalid_value: "Cette réponse n’est pas valide. Veuillez choisir à nouveau.",
		general: "Vos réponses ne correspondent pas à la version actuelle de l’enquête. Veuillez vérifier vos réponses."
	},
	notice: {
		surveyChanged: "L’enquête a été mise à jour entre-temps. Veuillez vérifier vos réponses et les envoyer à nouveau.",
		throttled: "Le service est actuellement très sollicité. Veuillez réessayer dans un instant.",
		error: "Vos réponses n’ont pas pu être envoyées. Veuillez réessayer."
	},
	status: {
		invalid: {
			title: "L’invitation n’est pas valide",
			text: "Veuillez vérifier que vous avez copié le lien complet de votre invitation."
		},
		expired: {
			title: "L’invitation a expiré",
			text: "Il n’est plus possible de participer avec ce lien."
		},
		used: {
			title: "Cette invitation a déjà été utilisée",
			text: "Ce lien a déjà été utilisé pour participer à l’enquête."
		},
		unavailable: {
			title: "Enquête non disponible",
			text: "Cette enquête n’est pas disponible pour le moment."
		},
		throttled: {
			title: "Service très sollicité",
			text: "Le service est actuellement très sollicité. Veuillez réessayer dans un instant."
		},
		error: {
			title: "L’enquête n’a pas pu être chargée",
			text: "Veuillez vérifier votre connexion Internet et réessayer."
		}
	}
};
