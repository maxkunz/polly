## constraints
* eine umfrage darf 1 bis maximal 20 Fragen haben (folgefragen zählen zu den 20)
* der fragetyp "rating" kann von 0 bis maximal 8 frei konfiguriert werden, es ist also auch möglich rating 0 bis 3 oder 0 bis 4, etc zu definieren
* der fragetyp "choice" darf maximal 5 auswahlmöglichkeiten haben und muss mindestens zwei auswahlmöglichkeiten haben
* erstelle als ids immer valide und zufällige eindeutige UUIDs
* das erstellte json muss valide sein
* das feld "name" bei der umfrage und den fragen wird ist eine unmutable bezeichner der nach dem erstellen nicht mehr geändert werden darf (fürs reporting)

### beispiel json

{
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "name": "Kundenzufriedenheit 2026",
    "title": "Kundenzufriedenheit 2026",
    "description": "Jährliche Umfrage zur Nutzerzufriedenheit.",
    "greeting_message": "Vielen Dank, dass Sie sich 3 Minuten Zeit nehmen, um Ihre Gedanken mit uns zu teilen.",
    "closing_message": "Vielen Dank für Ihr Feedback!",
    "created_at": "2026-06-30T12:00:00Z",
    "updated_at": "2026-08-06T12:00:00Z",
    "version": 1,
    "questions": [
        {
            "id": "c2aab111-1e2f-6aa0-dd8f-8dd1df502c33",
            "type": "yes_no",
            "name": "Unveränderbarer Name der Frage",
            "title": "Würden Sie unseren Service weiterempfehlen?",
            "description": "Berücksichtigen Sie Ihre Gesamterfahrung der letzten 12 Monate.",
            "reprompt_message": "Bitte beantworten Sie diese Frage.",
            "mandatory": false,
            "follow_ups": [
                {
                    "condition": {
                        "operator": "equals",
                        "value": false
                    },
                    "question": {
                        "id": "7d52f6c9-0a63-4b08-8e6f-4a377d611867",
                        "name": "Unveränderbarer Name der Frage",
                        "type": "comment",
                        "title": "Was war das Hauptproblem?",
                        "description": "Bitte beschreiben Sie, was Sie unzufrieden gemacht hat."
                    }
                }
            ]
        },
        {
            "id": "25f822ac-d1a1-4ea6-b9b0-9f44e13fc1ab",
            "name": "Unveränderbarer Name der Frage",
            "type": "choice",
            "title": "Welche Funktion nutzen Sie am häufigsten?",
            "description": "Wählen Sie die Hauptfunktion, die Ihren Workflow bestimmt.",
            "reprompt_message": "Bitte beantworten Sie diese Frage.",
            "mandatory": false,
            "options": {
                "labels": [
                    {
                        "id": "58cf7b44-9336-4074-b5b8-5188f553a633",
                        "label": "Dashboard-Analysen"
                    },
                    {
                        "id": "9ab33f3e-3294-4f40-8f9f-07ec812d3345",
                        "label": "Automatisierte Exporte"
                    }
                ]
            },
            "follow_ups": [
                {
                    "condition": {
                        "operator": "equals",
                        "value": "9ab33f3e-3294-4f40-8f9f-07ec812d3345"
                    },
                    "question": {
                        "id": "341fb62c-8cd7-48f0-b997-759081e7d82e",
                        "name": "Unveränderbarer Name der Frage",
                        "type": "rating",
                        "title": "Wie zufrieden sind Sie mit der Leistung der automatisierten Exporte?",
                        "description": "Bewerten Sie mit 1 bis 5 Sternen.",
                        "options": {
                            "min_value": 1,
                            "max_value": 5
                        }
                    }
                }
            ]
        },
        {
            "id": "8b7fc93c-cf8e-4a64-9a3b-2401f11a84f5",
            "name": "Unveränderbarer Name der Frage",
            "type": "rating",
            "title": "Wie würden Sie unser UI-Design bewerten?",
            "description": "Skala von 1 (schlecht) bis 8 (ausgezeichnet).",
            "reprompt_message": "Bitte beantworten Sie diese Frage.",
            "mandatory": false,
            "options": {
                "min_value": 1,
                "max_value": 8
            },
            "follow_ups": [
                {
                    "condition": {
                        "operator": "less_than",
                        "value": 3
                    },
                    "question": {
                        "id": "f6211181-e234-4a8f-8cb4-3074092b35a3",
                        "name": "Unveränderbarer Name der Frage",
                        "type": "comment",
                        "title": "Wie können wir das Design verbessern?",
                        "description": "Sagen Sie uns, was sich unintuitiv oder klobig angefühlt hat."
                    }
                }
            ]
        },
        {
            "id": "be7d1c15-4fa8-48aa-b7bc-1e5f88cb077d",
            "name": "Unveränderbarer Name der Frage",
            "type": "nps",
            "title": "Wie wahrscheinlich ist es, dass Sie uns einem Kollegen weiterempfehlen?",
            "description": "Net Promoter Score von 0 bis 10.",
            "reprompt_message": "Bitte beantworten Sie diese Frage.",
            "mandatory": false,
            "follow_ups": [
                {
                    "condition": {
                        "operator": "greater_than_or_equal",
                        "value": 9
                    },
                    "question": {
                        "id": "ecb58dcf-336c-4f76-80db-0e693b827e8a",
                        "name": "Unveränderbarer Name der Frage",
                        "type": "comment",
                        "title": "Was gefällt Ihnen am besten an uns?",
                        "description": "Wir würden gerne erfahren, was Ihnen am besten gefällt."
                    }
                }
            ]
        },
        {
            "id": "47cc5f41-3b76-47b2-bd77-17bc2d44cfba",
            "name": "Unveränderbarer Name der Frage",
            "type": "comment",
            "title": "Haben Sie noch weitere Anmerkungen?",
            "description": "Teilen Sie uns gerne weiteres Feedback mit, das oben nicht behandelt wurde.",
            "reprompt_message": "Bitte beantworten Sie diese Frage.",
            "mandatory": false
        }
    ]
}