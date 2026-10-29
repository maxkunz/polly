import type { MessageSchema } from "./de";

export const fr: MessageSchema = {
	common: {
		back: "Retour",
		backToOverview: "Retour à la vue d'ensemble",
		cancel: "Annuler",
		save: "Enregistrer",
		delete: "Supprimer",
		edit: "Modifier",
		close: "Fermer",
		discard: "Abandonner",
		unknownUser: "Utilisateur inconnu",
		otherUser: "un autre utilisateur",
		unknownError: "Erreur inconnue",
		selection: "Sélection"
	},

	language: {
		title: "Langue / Language",
		label: "Langue",
		de: "Deutsch",
		en: "English",
		fr: "Français",
		tlh: "tlhIngan Hol (i18n-Test)",
		la: "Latin (i18n-Test)"
	},

	modules: {
		dashboard: {
			title: "Tableau de bord",
			description: "Vue d'ensemble des modules disponibles dans le modèle."
		},
		surveys: {
			title: "Enquêtes",
			description: "Création, configuration et analyse des enquêtes.",
			unnamedSurvey: "Enquête {index}"
		},
		settings: {
			title: "Paramètres",
			description: "Paramètres globaux et métadonnées d'installation."
		}
	},

	dashboard: {
		title: "Tableau de bord"
	},

	permissions: {
		missingWrite: "Non autorisé – droits d'écriture manquants.",
		missingDeploy: "Non autorisé – droits de déploiement manquants.",
		missingExport: "Non autorisé – droits d'export des résultats manquants.",
		readOnlyBanner: "Accès en lecture seule : la création, la modification, le clonage et la suppression d'enquêtes nécessitent des droits d'écriture.",
		deployReadOnlyBanner: "Accès en lecture seule : les déploiements, le Rollback et le mapping des Queues nécessitent des droits de déploiement."
	},

	surveys: {
		searchPlaceholder: "Rechercher une enquête...",
		actions: {
			back: "Retour à la vue d'ensemble",
			new: "Nouvelle enquête",
			reload: "Recharger les enquêtes"
		},
		newSurveyTitle: "Nouvelle enquête",
		cloneSurveyTitle: "Cloner l'enquête",
		leaveConfirm: {
			header: "Modifications non enregistrées",
			message: "Vous avez des modifications non enregistrées. Voulez-vous vraiment quitter la page ?",
			queueMappingMessage: "Vous avez des modifications non enregistrées dans le mapping des Queues. Voulez-vous vraiment quitter la page ?",
			acceptLabel: "Quitter",
			rejectLabel: "Rester"
		},
		detail: {
			loading: "Chargement des détails de l'enquête...",
			errorTitle: "Erreur lors du chargement de l'enquête",
			emptyDraft: "Aucune donnée d'enquête disponible pour cet ID.",
			loadErrorFallback: "Erreur lors du chargement de l'enquête '{id}'",
			rowNotFound: "Aucune ligne trouvée pour '{key}' dans la Data Table."
		},
		list: {
			availableCount: "Enquêtes disponibles ({count})",
			loading: "Chargement des données d'enquête...",
			loadErrorFallback: "Erreur lors du chargement des données d'enquête",
			invalidIndex: "La liste des enquêtes (ligne survey_list) est corrompue et ne sera pas écrasée.",
			unnamedSurvey: "Enquête sans nom",
			openAriaLabel: "Ouvrir l'enquête : {title}",
			edit: "Modifier",
			view: "Afficher",
			emptySearch: "Aucune enquête trouvée pour cette recherche.",
			empty: "Aucune enquête disponible."
		}
	},

	surveyEditor: {
		toolbar: {
			back: "Retour à la vue d'ensemble",
			backAriaLabel: "Retour à la vue d'ensemble des enquêtes",
			statusUnsaved: "Non enregistré",
			statusSaved: "Enregistré",
			discard: "Abandonner",
			delete: "Supprimer",
			deleteAriaLabel: "Supprimer l'enquête",
			clone: "Cloner",
			cloneAriaLabel: "Cloner l'enquête",
			deploy: "Deploy",
			deployAriaLabel: "Vers la vue de déploiement",
			report: "Rapport",
			reportAriaLabel: "Vers la vue du rapport",
			invite: "Liens d'invitation",
			inviteAriaLabel: "Vers les liens d'invitation (web)",
			save: "Enregistrer"
		},
		stickyBar: {
			unsaved: "● Modifications non enregistrées",
			allSaved: "✓ Toutes les modifications sont enregistrées",
			back: "Retour",
			save: "Enregistrer l'enquête"
		},
		meta: {
			title: "Paramètres généraux de l'enquête",
			surveyTitle: "Titre de l'enquête",
			technicalName: "Nom technique (généré automatiquement à partir du titre et de l'ID)",
			description: "Description",
			greeting: "Message de bienvenue",
			closing: "Message de fin",
			baseUrl: "URL de base des liens d'invitation (web)",
			baseUrlHint: "Facultatif. URL https absolue, p. ex. la page dans laquelle le sondage est intégré. {placeholder} indique où placer le jeton dans le lien, sinon ?token=… est ajouté. Sans valeur, le lien pointe vers la page de sondage Polly.",
			baseUrlHintDefault: "Sans valeur, l'URL de base par défaut des paramètres s'applique : {url}",
			language: "Langue du sondage web",
			webTheme: "Design du sondage web",
			webThemeHint: "Police, tailles de texte et couleurs de la page du sondage. Gestion sous Paramètres → Designs web. Un changement prend effet après le déploiement en Prod.",
			webThemeDefault: "Standard du client (design Polly)",
			webThemeDefaultNamed: "Standard du client ({name})",
			webThemeMissing: "Le design choisi a été supprimé. Le sondage utilise le design standard jusqu’à ce que vous en choisissiez un autre.",
			webThemeMissingOption: "Design supprimé",
			webThemeLoadingOption: "Design choisi (chargement …)",
			webThemeUnavailableOption: "Design choisi (liste indisponible)",
			placeholders: {
				title: "p. ex. Satisfaction client",
				description: "Description interne ou contexte de l'enquête...",
				greeting: "Merci de prendre quelques instants...",
				closing: "Merci pour vos précieux retours !",
				baseUrl: "https://www.exemple.fr/sondage/{placeholder}"
			}
		},
		save: {
			validationErrorSummary: "Erreur de validation",
			validationErrorFallback: "Veuillez corriger les erreurs signalées avant d'enregistrer.",
			successSummary: "Enregistrement réussi",
			successDetail: "L'enquête « {title} » a été mise à jour.",
			errorSummary: "Erreur d'enregistrement",
			errorFallback: "Erreur lors de l'enregistrement de l'enquête dans la Data Table."
		},
		flowSize: {
			warnTitle: "Le volume de texte de l'enquête approche de la limite",
			warnDetail: "L'enquête utilise {percent} % du volume de texte maximal ({length} sur {max} caractères, données techniques comprises). Au-delà de 100 %, elle peut toujours être enregistrée, mais plus déployée.",
			exceededTitle: "Le volume de texte de l'enquête est trop important",
			exceededDetail: "L'enquête utilise {percent} % du volume de texte maximal ({length} sur {max} caractères, données techniques comprises). Elle peut être enregistrée comme brouillon, mais pas déployée. Veuillez raccourcir les textes les plus longs.",
			announceWarn: "Avertissement : le volume de texte de l'enquête a atteint {percent} % de la limite.",
			announceExceeded: "Le volume de texte de l'enquête est trop important. Le déploiement ne sera possible qu'après avoir raccourci les textes les plus longs.",
			announceOk: "Le volume de texte de l'enquête est de nouveau dans la plage non critique."
		},
		discardConfirm: {
			header: "Abandonner les modifications",
			message: "Voulez-vous vraiment abandonner toutes les modifications non enregistrées ?",
			acceptLabel: "Oui, abandonner",
			rejectLabel: "Annuler",
			toastSummary: "Réinitialisé",
			toastDetail: "Les modifications ont été abandonnées."
		},
		saveConflict: {
			header: "L'enquête a été modifiée entre-temps",
			message: "Des modifications de cette enquête ont été enregistrées entre-temps, par ex. par un autre utilisateur (votre version est basée sur v{expected}, la version enregistrée est v{current}). Voulez-vous écraser la version enregistrée avec vos modifications ou charger la version enregistrée ? Le chargement supprime vos modifications non enregistrées.",
			overwriteLabel: "Écraser",
			cancelLabel: "Annuler",
			loadLabel: "Charger les modifications",
			loadedSummary: "Rechargée",
			loadedDetail: "La version enregistrée v{version} a été chargée.",
			loadErrorSummary: "Échec du chargement"
		},
		deleteConfirm: {
			header: "Supprimer l'enquête",
			message: "Voulez-vous vraiment supprimer définitivement l'enquête « {title} » ? Tous les résultats collectés pour cette enquête seront également supprimés définitivement.",
			acceptLabel: "Oui, supprimer",
			rejectLabel: "Annuler",
			successSummary: "Enquête supprimée",
			successDetail: "L'enquête « {title} » a été supprimée avec succès.",
			errorSummary: "Erreur lors de la suppression",
			errorFallback: "Erreur lors de la suppression de l'enquête dans la Data Table.",
			resultsSummary: "Suppression des résultats en cours",
			resultsDetail: "Les résultats de l'enquête sont supprimés en arrière-plan. Cela peut prendre un certain temps.",
			resultsErrorSummary: "Résultats non supprimés",
			resultsErrorFallback: "L'enquête a été supprimée, mais la suppression de ses résultats n'a pas pu être lancée."
		}
	},

	surveyLock: {
		unknownUser: "Utilisateur inconnu",
		conflict: {
			header: "Enquête déjà en cours de modification",
			message: "Cette enquête est en cours de modification par « {user} » depuis {date}. Voulez-vous la modifier quand même ou l'ouvrir en lecture seule ?",
			acceptLabel: "Modifier quand même",
			rejectLabel: "Lecture seule"
		},
		readOnlyBanner: "Lecture seule : cette enquête est en cours de modification par « {user} ». Les modifications sont désactivées."
	},

	surveyQuestions: {
		title: "Catalogue de questions",
		countStatus: "{count} sur {max} questions maximum utilisées (questions de suivi comprises)",
		maxReached: "Maximum atteint",
		addQuestion: "Ajouter une question",
		addQuestionAriaLabel: "Ajouter une nouvelle question à l'enquête",
		addAnotherAriaLabel: "Ajouter une autre question à l'enquête",
		empty: {
			title: "Cette enquête ne contient encore aucune question.",
			description: "Créez votre première question pour commencer à configurer l'enquête.",
			cta: "Créer la première question"
		},
		limitToast: {
			summary: "Limite atteinte",
			detail: "Une enquête peut contenir au maximum {max} questions (questions de suivi comprises)."
		}
	},

	surveyQuestion: {
		numberAriaLabel: "Numéro de la question",
		mandatoryTag: "Obligatoire",
		moveUpAriaLabel: "Déplacer la question {number} vers le haut",
		moveDownAriaLabel: "Déplacer la question {number} vers le bas",
		delete: "Supprimer",
		deleteAriaLabel: "Supprimer la question {number}",
		deleteConfirm: {
			header: "Supprimer la question",
			message: "Voulez-vous vraiment supprimer définitivement « {title} » et toutes les questions de suivi associées ?",
			acceptLabel: "Supprimer",
			rejectLabel: "Annuler",
			fallbackTitle: "Question n° {number}"
		},
		followUps: {
			title: "Questions de suivi conditionnelles ({count})",
			hint: "Affichée uniquement si la condition de réponse définie est remplie.",
			add: "Ajouter une question de suivi",
			addAriaLabel: "Ajouter une question de suivi à la question {number}"
		}
	},

	surveyQuestionFields: {
		technicalName: "Identifiant technique (nom)",
		technicalNameHintShort: "(Non modifiable pour le reporting)",
		technicalNameHint: "L'identifiant est utilisé à des fins de reporting et ne peut pas être modifié.",
		type: "Type de question",
		typeSavedHint: "(Enregistré - type non modifiable)",
		mandatory: "Question obligatoire",
		title: "Titre / Prompt",
		titlePlaceholder: "p. ex. Dans quelle mesure êtes-vous satisfait de notre service ?",
		reprompt: "Relance (Reprompt)",
		repromptPlaceholder: "Seconde invitation à répondre à la question (facultatif).",
		description: "Description / texte d'aide",
		descriptionPlaceholder: "Informations complémentaires pour la personne interrogée..."
	},

	surveyFollowUp: {
		legend: "Question de suivi n° {number}",
		fieldsetAriaLabel: "Question de suivi {number}",
		delete: "Supprimer",
		deleteAriaLabel: "Supprimer la question de suivi {number}",
		deleteConfirm: {
			header: "Supprimer la question de suivi",
			message: "Voulez-vous vraiment supprimer cette question de suivi ?",
			acceptLabel: "Supprimer",
			rejectLabel: "Annuler"
		},
		title: "Titre / Prompt",
		titlePlaceholder: "p. ex. Quelle est la raison de votre évaluation ?",
		type: "Type de question",
		typeSavedHint: "(Enregistré - type non modifiable)",
		reprompt: "Relance (Reprompt)",
		repromptPlaceholder: "Seconde invitation à répondre à la question (facultatif).",
		description: "Description / texte d'aide",
		descriptionPlaceholder: "Explication complémentaire pour le participant..."
	},

	surveyCondition: {
		label: "Condition d'affichage :",
		operator: "Opérateur",
		valueChoice: "La réponse correspond à l'option",
		valueOther: "Valeur de comparaison",
		choicePlaceholder: "Choisir une option...",
		unnamedOption: "Option ({id})"
	},

	ratingOptions: {
		scaleLabel: "Configurer l'échelle d'évaluation ({min} à {max} max.) :",
		min: "Valeur minimale ({min} à {max})",
		max: "Valeur maximale ({min} à {max})",
		previewLabel: "Aperçu de l'échelle :",
		minLabel: "Libellé de la valeur minimale (facultatif)",
		maxLabel: "Libellé de la valeur maximale (facultatif)",
		labelsHint: "Affiché uniquement aux extrémités de l'échelle dans les sondages web et non lu à voix haute.",
		minLabelPlaceholder: "p. ex. très mauvais",
		maxLabelPlaceholder: "p. ex. excellent"
	},

	choiceOptions: {
		label: "Options de réponse ({min} à {max} options max.) :",
		add: "Ajouter une option",
		hint: "Vous pouvez indiquer des synonymes séparés par des virgules, p. ex. « orange, mandarine, clémentine ». Le premier mot est l'option, tous les autres sont des synonymes.",
		optionSrLabel: "Option {number}",
		optionPlaceholder: "Option {number}, synonyme 1, synonyme 2",
		defaultLabel: "Option {number}",
		removeAriaLabel: "Supprimer l'option {number}"
	},

	typeHint: {
		nps: "Le Net Promoter Score utilise une échelle standardisée de 0 (très improbable) à 10 (très probable).",
		yesNo: "Question oui / non avec deux réponses possibles standardisées.",
		comment: "Champ de texte libre pour les retours du participant."
	},

	promptTextarea: {
		ttsLimitHint: "Lu par synthèse vocale, {max} caractères maximum.",
		ttsCounter: "{length} sur {max} caractères maximum",
		ttsTooLong: "Texte trop long : {length} sur {max} caractères maximum. Veuillez raccourcir le texte, sinon l'enquête ne pourra pas être enregistrée.",
		ttsAnnounceTooLong: "Texte trop long : {length} sur {max} caractères maximum. L'enquête ne peut pas être enregistrée en l'état.",
		ttsAnnounceOk: "La longueur du texte est de nouveau dans la limite."
	},

	validation: {
		summaryTitle: "Veuillez corriger les erreurs suivantes :",
		summaryHint: "Cliquez sur une erreur pour accéder au champ concerné.",
		questionTitleRequired: "Le titre de la question ne doit pas être vide.",
		questionNameRequired: "Le nom de la question ne doit pas être vide.",
		ratingOptionsInvalid: "Les options d'évaluation ne sont pas valides.",
		ratingMinRange: "La valeur minimale doit être comprise entre {min} et {max}.",
		ratingMaxRange: "La valeur maximale doit être comprise entre {min} et {max}.",
		ratingMinLessThanMax: "La valeur minimale doit être inférieure à la valeur maximale.",
		choiceOptionsInvalid: "Les options de réponse ne sont pas valides.",
		choiceMinOptions: "Une question à choix nécessite au moins {min} options.",
		choiceMaxOptions: "Une question à choix peut comporter au maximum {max} options.",
		choiceOptionEmpty: "L'option {number} ne doit pas être vide.",
		choiceOptionDuplicate: "L'option {number} recoupe l'option {otherNumber} (même libellé ou synonyme).",
		followUpMissing: "La question de suivi est manquante.",
		followUpsNotAllowed: "Les questions de type commentaire ne peuvent pas avoir de questions de suivi. Veuillez supprimer les questions de suivi ou choisir un autre type de question.",
		followUpsTooDeep: "Les questions de suivi ne peuvent pas avoir leurs propres questions de suivi.",
		followUpValueRequired: "Veuillez indiquer une valeur valide pour la condition.",
		followUpOperatorDuplicate: "Le comparateur \"{operator}\" est déjà utilisé par la question de suivi {number}. Chaque comparateur ne peut être utilisé qu'une seule fois.",
		followUpValueDuplicate: "Cette valeur est déjà utilisée par la question de suivi {number}. Chaque valeur de réponse possible ne peut avoir qu'une seule question de suivi.",
		surveyTitleRequired: "Le titre de l'enquête ne doit pas être vide.",
		surveyNameRequired: "Le nom de l'enquête ne doit pas être vide.",
		surveyMinQuestions: "Une enquête doit contenir au moins 1 question.",
		surveyMaxQuestions: "Une enquête peut contenir au maximum {max} questions (questions de suivi comprises). Actuellement : {count}.",
		ttsTextTooLong: "« {field} » est trop long ({length} sur {max} caractères maximum). Les textes lus par synthèse vocale ne doivent pas dépasser {max} caractères. Veuillez raccourcir le texte.",
		baseUrlInvalid: "L'URL de base doit être une URL https absolue valide, p. ex. https://www.exemple.fr/sondage/{placeholder}.",
		baseUrlTokenCount: "L'URL de base ne peut contenir le paramètre {placeholder} qu'une seule fois.",
		baseUrlTooLong: "L'URL de base ne peut pas dépasser {max} caractères.",
		languageInvalid: "Veuillez choisir une langue valide.",
		webThemeInvalid: "Veuillez choisir un design web valide.",
		scaleLabelTooLong: "« {field} » est trop long ({max} caractères maximum)."
	},

	translator: {
		yesNoInvalidValue: "Valeur de condition invalide pour le type de question yes_no : {value}",
		equalsOnly: "Le type de question {type} n'autorise que l'opérateur \"equals\".",
		duplicateYesNo: "Plusieurs questions de suivi pour la condition \"{value}\".",
		choiceOptionsMissing: "Le type de question choice nécessite des options de réponse (options.labels).",
		unknownLabelId: "Option de réponse inconnue \"{labelId}\" dans une condition de suivi.",
		duplicateChoice: "Plusieurs questions de suivi pour la même option de réponse \"{labelId}\".",
		ratingOptionsMissing: "Le type de question rating nécessite une échelle (options.min_value/max_value).",
		duplicateOperator: "L'opérateur \"{operator}\" est utilisé plusieurs fois dans les questions de suivi.",
		valueNotNumeric: "La valeur de condition \"{value}\" n'est pas un nombre.",
		commentNoFollowUps: "Le type de question comment ne peut pas avoir de questions de suivi.",
		unknownType: "Type de question inconnu \"{type}\".",
		noQuestions: "L'enquête ne contient aucune question.",
		emptyDraft: "Le brouillon est vide, le déploiement a été annulé.",
		invalidJson: "Le brouillon n'a pas pu être lu en JSON : {error}",
		questionContext: "{message} (question : {question})"
	},

	deployment: {
		back: "Retour à l'éditeur",
		backAriaLabel: "Retour à l'éditeur",
		stage: "Stage",
		prod: "Prod",
		backup: "Backup",
		unnamedSurvey: "Enquête sans nom",
		none: "–",
		deployStage: "Déployer sur Stage",
		deployStageAriaLabel: "Déployer le Draft sur Stage",
		deployProd: "Déployer sur Prod",
		deployProdAriaLabel: "Déployer le Draft sur Prod",
		rollback: "Rollback",
		rollbackAriaLabel: "Restaurer la dernière version sur Prod",
		alreadyInProd: "La version v{version} est déjà déployée sur Prod. Un nouveau déploiement sur Prod n'est possible qu'après une modification du brouillon.",
		unknownError: "Erreur inconnue lors du déploiement",
		draftChanged: "Le brouillon a été modifié entre-temps (affiché : v{expected}, actuel : v{current}), p. ex. par un autre utilisateur. Rien n'a été déployé. La vue affiche maintenant l'état actuel – veuillez vérifier et déployer à nouveau.",
		prodChanged: "Prod a été modifié entre-temps, p. ex. par le déploiement d'un autre utilisateur. Le Rollback n'a pas été effectué. La vue affiche maintenant l'état actuel – veuillez vérifier et relancer le Rollback si nécessaire.",
		webPreview: "Aperçu web",
		webPreviewAriaLabel: "Ouvrir la version Stage comme enquête web dans un nouvel onglet",
		webPreviewHint: "L’aperçu web ouvre la version Stage comme enquête web dans un nouvel onglet. Le lien est valable {days} jours, les réponses ne sont pas enregistrées.",
		webPreviewBlocked: "Le navigateur a bloqué la nouvelle fenêtre.",
		webPreviewOpenLink: "Ouvrir l’aperçu web",
		webPreviewErrors: {
			missingToken: "Non connecté – veuillez recharger la page.",
			missingRole: "Aucune autorisation – les droits de déploiement manquent.",
			noStage: "Aucune version Stage n’est déployée pour cette enquête.",
			throttled: "Trop de requêtes – veuillez réessayer dans un instant.",
			generic: "Impossible d’ouvrir l’aperçu web"
		},
		payloadTooLarge: "Le volume total de texte de l'enquête est trop important ({length} sur {max} caractères maximum, données techniques comprises) ; elle ne peut donc pas être déployée. Veuillez raccourcir les textes les plus longs dans l'éditeur et enregistrer à nouveau l'enquête."
	},

	report: {
		back: "Retour à l'éditeur",
		backAriaLabel: "Retour à l'éditeur",
		from: "Du",
		to: "Au",
		range: "Période",
		quickRanges: {
			today: "Aujourd'hui",
			last7Days: "7 derniers jours",
			last30Days: "30 derniers jours",
			currentMonth: "Mois en cours",
			lastMonth: "Mois dernier"
		},
		hint: "La période se rapporte au début de la session d'enquête (première réponse).",
		version: "Version de l'enquête",
		allVersions: "Toutes les versions",
		versionOption: "v{version} ({sessions})",
		summary: {
			title: "Aperçu",
			loading: "Chargement de l'aperçu … ({sessions} sessions jusqu'à présent)",
			liveUpdating: "Mise à jour automatique",
			sessions: "Sessions",
			completed: "Terminées",
			partial: "En cours",
			timedOut: "Abandonnées",
			tooltips: {
				sessions: "Toutes les participations à l'enquête commencées pendant la période sélectionnée (au moins une réponse).",
				completed: "Participations au cours desquelles l'enquête a été menée jusqu'au bout.",
				partial: "Participations en cours ou dont la dernière réponse date de moins de 30 minutes.",
				timedOut: "Participations interrompues prématurément (p. ex. appel raccroché ou chat fermé) – 30 minutes sans nouvelle réponse."
			},
			empty: "Aucune session pendant la période sélectionnée."
		},
		download: "Télécharger le CSV",
		downloadAriaLabel: "Télécharger le rapport CSV",
		cancel: "Annuler",
		progress: "{sessions} sessions / {rows} lignes chargées",
		errors: {
			invalidRange: "Veuillez choisir une période valide (la date de début ne doit pas être postérieure à la date de fin).",
			missingToken: "Aucun jeton d'accès Genesys disponible. Veuillez vous reconnecter.",
			generic: "Erreur lors du chargement du rapport"
		}
	},

	invitations: {
		back: "Retour à l'éditeur",
		backAriaLabel: "Retour à l'éditeur",
		title: "Liens d'invitation",
		prodVersion: "Prod v{version}",
		intro: "Crée des liens personnalisés pour l'enquête web. Les liens pointent vers la version Prod actuelle ; un déploiement ou un rollback ultérieur s'applique automatiquement aux liens déjà envoyés.",
		noProd: "L'enquête n'a pas encore de version Prod. Déployez d'abord en Prod, puis créez les liens d'invitation.",
		count: "Nombre de liens",
		countHint: "{min} à {max} liens par génération",
		expiry: "Date d'expiration (facultative)",
		expiryHint: "Valable jusqu'à 23:59:59 ce jour-là inclus (votre heure locale). Sans date, les liens n'expirent pas.",
		multi: "Utilisable plusieurs fois",
		multiHintOn: "Chaque lien peut être utilisé pour participer un nombre illimité de fois.",
		multiHintOff: "Chaque lien permet exactement une participation.",
		linkTarget: "Cible des liens",
		linkTargetBaseUrl: "URL de base issue des paramètres enregistrés de l'enquête :",
		linkTargetFallback: "Aucune URL de base définie – les liens pointent vers la page d'enquête Polly :",
		linkTargetDefault: "URL de base par défaut des paramètres :",
		generate: "Créer les liens et télécharger le CSV",
		generateAriaLabel: "Créer les liens d'invitation et les télécharger en CSV",
		notStoredHint: "Les liens ne sont pas enregistrés. Conservez le fichier CSV ; des liens perdus ne peuvent qu'être recréés.",
		success: "{count} liens créés, le fichier CSV a été téléchargé.",
		errors: {
			missingToken: "Aucun jeton d'accès Genesys disponible. Veuillez vous reconnecter.",
			missingRole: "Aucune autorisation – droits de déploiement manquants.",
			noProd: "L'enquête n'a pas (plus) de version Prod. Veuillez recharger la vue.",
			throttled: "Genesys est actuellement surchargé. Veuillez réessayer dans un instant.",
			expiryInPast: "La date d'expiration est dans le passé.",
			generic: "Erreur lors de la création des liens d'invitation"
		}
	},

	queueMapping: {
		title: "Mapping des Queues",
		queueCount: "{count} Queue associée | {count} Queues associées",
		rate: "Taux de {rate}%",
		loading: "Chargement du mapping des Queues...",
		retry: "Réessayer",
		intro: "Définissez à quelles Queues cette enquête est associée après la fin de l'appel et avec quelle probabilité (Delivery Rate) elle doit être proposée.",
		deliveryRateLabel: "Probabilité de diffusion (Delivery Rate)",
		deliveryRateAriaLabel: "Probabilité de diffusion en pourcentage",
		queuesLabel: "Queues (une Queue par ligne)",
		entriesCount: "{count} entrée | {count} entrées",
		queuesHint: "Saisissez les noms exacts des Queues, une par ligne. Pour supprimer complètement le mapping de cette enquête, videz le champ de texte et enregistrez.",
		conflictHint: "Remarque : {count} Queue est déjà associée à une autre enquête : | Remarque : {count} Queues sont déjà associées à une autre enquête :",
		conflictSurveyId: "ID de l'enquête actuelle : {id}",
		conflictFooter: "Lors de l'enregistrement, une confirmation vous sera demandée avant que l'association existante ne soit écrasée.",
		save: "Enregistrer le mapping des Queues",
		reset: "Réinitialiser les modifications",
		overwriteConfirm: {
			header: "Écraser les associations existantes ?",
			message: "Les Queues suivantes sont actuellement déjà associées à une autre enquête :\n\n{list}\n\nVoulez-vous vraiment transférer ces associations vers l'enquête actuelle et écraser celles existantes ?",
			listItem: "• {queueName} (ID de l'enquête : {surveyId})",
			acceptLabel: "Oui, écraser",
			rejectLabel: "Annuler"
		},
		toast: {
			savedSummary: "Mapping des Queues enregistré",
			savedDetail: "Les associations de Queues ont été mises à jour avec succès."
		},
		loadErrorFallback: "Erreur lors du chargement du mapping des Queues",
		saveErrorFallback: "Erreur lors de l'enregistrement du mapping des Queues dans la Data Table"
	},

	controlToolbar: {
		searchPlaceholder: "Rechercher...",
		close: "Fermer",
		edit: "Modifier",
		toast: {
			lockedSummary: "Verrouillé",
			lockedDetail: "La configuration est actuellement en cours de modification par : {name}"
		}
	},

	app: {
		initErrorSummary: "Erreur",
		initErrorFallback: "Échec de l'initialisation.",
		sidebarCollapse: "Réduire la barre latérale",
		sidebarExpand: "Développer la barre latérale"
	},

	webThemes: {
		title: "Designs web",
		intro: "Designs de la page publique du sondage (police, styles de texte, couleurs). Chaque sondage choisit son design dans l’éditeur ; sans choix, le design standard s’applique. Les modifications d’un design atteignent tous les sondages qui l’utilisent en 30 secondes au plus.",
		list: {
			loading: "Chargement des designs …",
			empty: "Aucun design pour l’instant. Sans design, la page du sondage utilise le design Polly.",
			default: "Standard",
			edit: "Modifier",
			view: "Afficher",
			duplicate: "Dupliquer",
			delete: "Supprimer",
			create: "Nouveau design",
			newName: "Nouveau design",
			copyName: "{name} (copie)",
			updated: "Modifié {date}",
			updatedBy: "Modifié {date} par {user}",
			limit: "Au maximum {max} designs par client."
		},
		editor: {
			name: "Nom",
			isDefault: "Design standard du client",
			font: "Police",
			fontHint: "Polices du système ; aucun fichier de police n’est chargé.",
			textStyles: "Styles de texte",
			textStylesHint: "Taille en pixels avec le réglage par défaut du navigateur. Le zoom et une police de base plus grande des visiteurs restent effectifs.",
			role: "Type de texte",
			size: "Taille",
			weight: "Graisse",
			lineHeight: "Interligne",
			reset: "Rétablir la valeur standard",
			resetAll: "Tout rétablir",
			resetRole: "Rétablir {role}",
			resetColor: "Rétablir {color}",
			sizeOf: "Taille {role} en pixels, de {min} à {max}",
			weightOf: "Graisse {role}",
			lineHeightOf: "Interligne {role}",
			colors: "Couleurs",
			transparentBackground: "Fond transparent",
			transparentHint: "Pour l’intégration par iframe : le fond de la page devient transparent, les cartes gardent leur couleur.",
			preview: "Aperçu",
			previewHint: "Sondage d’exemple avec tous les types de questions. Le type de texte en cours de modification y est mis en évidence.",
			previewTitle: "Aperçu de la page du sondage",
			save: "Enregistrer",
			cancel: "Annuler"
		},
		roles: {
			heading: "Titre",
			subheading: "Sous-titre",
			body: "Texte courant",
			questionTitle: "Titre de question",
			description: "Description",
			option: "Options de réponse",
			scaleLabel: "Libellés d’échelle",
			hint: "Indications",
			error: "Textes d’erreur",
			button: "Bouton"
		},
		weights: {
			w400: "Normal (400)",
			w500: "Moyen (500)",
			w600: "Demi-gras (600)",
			w700: "Gras (700)"
		},
		fonts: {
			system: "Police système",
			sans: "Sans empattement (Helvetica, Arial)",
			serif: "Avec empattement (Charter, Georgia)",
			humanist: "Humaniste (Seravek, Calibri)",
			rounded: "Arrondie"
		},
		colors: {
			background: "Fond de page",
			surface: "Surfaces (cartes)",
			text: "Texte",
			heading: "Titres",
			textMuted: "Texte atténué",
			primary: "Couleur d’accent",
			onPrimary: "Texte sur couleur d’accent",
			border: "Bordures",
			error: "Erreurs"
		},
		contrast: {
			warning: "Contraste avec {background} : {ratio}:1, au moins {minimum}:1 (WCAG AA).",
			summary: "Avertissements de contraste : {count}. L’enregistrement est possible, mais l’accessibilité selon WCAG 2.2 AA n’est pas garantie avec ce design."
		},
		delete: {
			header: "Supprimer le design",
			message: "Supprimer vraiment le design « {name} » ?",
			usedBy: "Il est utilisé par ces sondages, qui afficheront ensuite le design standard : {surveys}.",
			unused: "Aucun sondage n’utilise ce design.",
			usageUnknown: "Impossible de vérifier si des sondages utilisent ce design ; les sondages concernés afficheront le design standard.",
			accept: "Supprimer",
			reject: "Annuler"
		},
		toast: {
			saved: "Design « {name} » enregistré",
			saveFailed: "Le design n’a pas pu être enregistré",
			deleted: "Design « {name} » supprimé",
			deleteFailed: "Le design n’a pas pu être supprimé"
		},
		errors: {
			missingToken: "Non connecté. Veuillez recharger l’application.",
			missingRole: "Pas d’autorisation – droits de déploiement manquants.",
			limitReached: "Le nombre maximal de designs est atteint.",
			conflict: "Quelqu’un d’autre a modifié ou supprimé le design entre-temps. La liste a été rechargée et vos saisies sont conservées. Un nouvel enregistrement écrase la version actuelle.",
			throttled: "Le service est surchargé. Veuillez réessayer dans un instant.",
			generic: "Erreur des designs web"
		}
	},

	features: {
		web_survey: {
			label: "Enquêtes web",
			description: "Enquêtes via lien d'invitation dans le navigateur, y compris les designs web et les paramètres web dans l'éditeur."
		}
	},
	settings: {
		webDefaults: {
			title: "Sondages web : URL de base par défaut",
			label: "URL de base par défaut pour les liens d'invitation",
			hint: "S'applique à tous les sondages sans URL de base propre. URL https absolue ; {placeholder} indique où placer le jeton dans le lien, sinon ?token=… est ajouté. Vide = les liens pointent vers la page de sondage Polly.",
			save: "Enregistrer",
			saved: "URL de base par défaut enregistrée.",
			saveFailed: "Échec de l'enregistrement"
		},
		features: {
			title: "Fonctionnalités activées"
		},
		setup: {
			title: "Installation",
			empty: "Aucune métadonnée d'installation disponible.",
			fields: {
				projectTag: "Tag du projet",
				domain: "Domaine",
				launchUrl: "URL de démarrage",
				oauthFrontend: "OAuth frontend",
				integrationApp: "Intégration d'application",
				division: "Division",
				backendGroup: "Groupe backend",
				backendRole: "Rôle backend",
				backendAuth: "Authentification backend",
				backendClient: "Client backend",
				dataTable: "Data Table",
				surveyDataTable: "Data Table des enquêtes",
				mappingDataTable: "Data Table du mapping des Queues",
				dataActionIntegration: "Intégration Data Action",
				dataAction: "Data Action",
				installedAt: "Installé le"
			},
			uninstallHint: "La désinstallation supprime les ressources enregistrées lors de l'installation.",
			update: "Mettre à jour le Bot Flow",
			updateHint: "La mise à jour remplace le Bot Flow par le modèle actuel fourni. Vos propres modifications du flow seront écrasées.",
			updateSuccess: "Bot Flow mis à jour",
			updateSuccessDetail: "Le Bot Flow a été mis à jour avec succès à partir du modèle actuel.",
			updateFailed: "Impossible de mettre à jour le Bot Flow",
			exportTemplates: "Exporter les modèles de flux",
			exportMissing: "Le flux bot ou le flux entrant est absent des métadonnées d'installation.",
			exportSuccess: "Le flux bot et le flux entrant ont été exportés avec des espaces réservés.",
			exportFailed: "Erreur lors de l'exportation des flux.",
			uninstall: "Désinstaller"
		}
	},

	setup: {
		heroTitle: "Installation",
		logHeader: "Journaux de déploiement",
		startApp: "Démarrer l'application",
		backToConfig: "Retour à la configuration",
		rollback: "Rollback",
		permissions: {
			title: "Autorisations d'installation manquantes",
			description: "Les autorisations suivantes sont nécessaires pour l'installation et le Rollback.",
			available: "Disponible",
			missing: "Manquante",
			warningTitle: "Certaines options d'installation sont restreintes",
			divisionHint: "Sans les droits de création et de suppression d'une division, seule une division existante peut être utilisée.",
			checkedTitle: "Autorisations vérifiées",
			checkedDetail: "Les autorisations d'installation sont disponibles.",
			loadErrorTitle: "Impossible de charger les données d'installation",
			retry: "Réessayer",
			requirements: {
				groupsManage: "Créer, consulter et supprimer des groupes",
				rolesManage: "Gérer les rôles et les autorisations (grants)",
				integrationsView: "Consulter les intégrations",
				integrationsManage: "Gérer les intégrations et les Data Actions",
				oauthManage: "Consulter et modifier les clients OAuth",
				divisionsView: "Consulter les divisions",
				datatableManage: "Gérer les Data Tables et lignes Architect",
				flowsManage: "Gérer les flows Architect",
				divisionCreate: "Créer et supprimer une division"
			}
		},
		steps: {
			installation: "Installation",
			summary: "Récapitulatif"
		},
		step1: {
			title: "Installation",
			description: "Choisissez l'intégration d'application, l'OAuth frontend et la division cible pour l'installation.",
			projectTag: "Tag du projet",
			projectTagPlaceholder: "p. ex. survey_app",
			integration: "Intégration",
			integrationPlaceholder: "Sélectionner une intégration",
			oauthClient: "Client OAuth",
			oauthClientPlaceholder: "Sélectionner un client OAuth",
			division: "Division",
			useExistingDivision: "Utiliser une division existante",
			createNewDivision: "Créer une nouvelle division",
			divisionPlaceholder: "Sélectionner une division",
			surveyDataTable: "Data Table des enquêtes",
			mappingDataTable: "Data Table du mapping des Queues",
			dataTableHint: "Noms complets des Data Tables. Si une table portant ce nom existe déjà, elle est reprise et n'est pas supprimée lors de la désinstallation.",
			dataTableNamesCollide: "Les deux Data Tables doivent avoir des noms différents.",
			features: "Fonctionnalités",
			featuresHint: "La sélection est enregistrée dans la ligne __meta et ne peut être modifiée après l'installation que directement dans la Data Table.",
			next: "Suivant"
		},
		step2: {
			title: "Récapitulatif",
			description: "Les Data Tables, un client OAuth backend et une Data Action pour les réponses d'évaluation seront créés.",
			project: "Projet",
			appIntegration: "Intégration d'application",
			oauthClient: "Client OAuth",
			division: "Division",
			newDivision: "Nouvelle : {name}_division",
			features: "Fonctionnalités",
			noFeatures: "Aucune",
			surveyDataTable: "Data Table des enquêtes",
			mappingDataTable: "Data Table du mapping des Queues",
			back: "Retour",
			start: "Lancer l'installation"
		},
		toast: {
			successSummary: "Succès",
			successDetail: "Installation terminée.",
			errorSummary: "Erreur",
			errorDetail: "Échec de l'installation. Veuillez consulter les journaux.",
			rollbackSummary: "Rollback réussi",
			rollbackDetail: "Les ressources déjà créées ont été supprimées.",
			rollbackErrorSummary: "Échec du Rollback"
		}
	},

	uninstall: {
		heroTitle: "Désinstaller le projet",
		stepTitle: "Supprimer les ressources installées",
		installationLabel: "Installation :",
		warning: "Cette action supprime les ressources Genesys créées lors de l'installation, notamment les deux flows, les deux Data Tables, la Data Action et le client OAuth backend. Le tenant backend est marqué comme supprimé en vue d'un nettoyage ultérieur par un administrateur. Voulez-vous continuer ?",
		logHeader: "SYSTEM TERMINAL - UNINSTALL_LOG",
		cancel: "Annuler",
		remove: "Supprimer l'installation",
		retry: "Réessayer",
		back: "Retour au menu",
		finish: "Terminer",
		toast: {
			removedSummary: "Installation supprimée",
			removedDetail: "Les ressources installées de l'application ont été supprimées.",
			failedSummary: "Échec de la suppression",
			divisionKeptSummary: "Division conservée",
			divisionKeptDetail: "La division créée n'a pas pu être supprimée et est conservée."
		}
	},

	questionTypes: {
		rating: "Évaluation (rating)",
		choice: "Choix (choice)",
		yes_no: "Oui / Non (yes_no)",
		nps: "NPS (nps)",
		comment: "Commentaire / texte (comment)",
		commentFollowUp: "Texte libre / commentaire (comment)"
	},

	operators: {
		equals: "est égal à (equals)",
		less_than: "est inférieur à (less_than)",
		greater_than: "est supérieur à (greater_than)"
	},

	booleanOptions: {
		yes: "Oui (true)",
		no: "Non (false)"
	}
};
