# Survey Translator for Flow

Der Genesys Architect Flow benötigt eine optimierte JSON-Struktur, um eine Umfrage abzuarbeiten.

Dazu muss das baumförmige "Draft"-JSON-Format (siehe @survey_definition.md) in eine flache, verkettete JSON-Struktur übersetzt werden.

Alle Fragen liegen in einer flachen Liste ("questions") vor, verkettet über IDs, damit der Flow weiß, welche Frage als nächstes zu stellen ist. Jede Frage bekommt beim Abflachen ihr "default_next_question_id" gesetzt: das ist immer die nächste Hauptfrage nach der aktuellen Hauptfrage (bzw. bei einer Folgefrage: die nächste Hauptfrage nach deren Elternfrage). Nur bei der letzten Hauptfrage der gesamten Umfrage (und deren Folgefragen) ist "default_next_question_id" null - das markiert das Ende der Umfrage. "start_question_id" verweist auf die ID der ersten Hauptfrage.

Die JSON-Notation für Folgefragen ist typabhängig, siehe Beispiel JSON unten. Alle typspezifischen Verweise auf eine Folgefrage-ID (bei "yes_no" die Felder "yes_next_question_id"/"no_next_question_id", bei "choice" die Einträge in "next_question_ids") sind null, wenn für diese Antwort keine Folgefrage definiert wurde - der Flow soll dann genau wie bei einer nicht zutreffenden Bedingung mit "default_next_question_id" weitermachen, nicht die Umfrage beenden.

Typ "comment" hat keine Folgefragen und daher auch kein entsprechendes Feld im JSON.
Bei Typ "nps" und "rating" muss im JSON "conditional_next_question" gesetzt werden; dort müssen immer für alle drei Bedingungen ("equals", "less_than", "greater_than") Einträge vorhanden sein, in dieser Reihenfolge. Ist für eine Bedingung keine Folgefrage vorhanden, wird im JSON für den Flow trotzdem ein Eintrag mit einer garantiert nicht zutreffenden ("ungültigen") Bedingung angelegt und "next_question_id" auf null gesetzt - zum Beispiel value -1 bei "equals", value 1000 bei "greater_than" oder value -1000 bei "less_than". Trifft keine der drei Bedingungen zu, greift "default_next_question_id".

Bei Typ "rating" bitte beachten, dass im Flow-JSON-Format zusätzlich alle möglichen Antworten explizit als Array "values" (von min_value bis max_value) angegeben werden müssen. Siehe Beispiel JSON unten.

Bei Typ "choice" gehen im Flow-JSON die Options-IDs aus dem Draft verloren: "labels", "synonyms" (pro Option ein String, in dem die Synonyme durch "; " getrennt sind, z. B. "Hammer; Zange; Schraubenzieher"; ohne Synonyme ein leerer String "") und "next_question_ids" sind drei parallele Arrays, deren Reihenfolge der Reihenfolge der Optionen im Draft entspricht (Zuordnung also ausschließlich über den Array-Index, nicht mehr über eine ID).

Folgende Felder werden beim Übersetzen aus dem Draft-Format übernommen bzw. umbenannt: "title" → "prompt", "reprompt_message" → "reprompt", bei der Umfrage "greeting_message" → "greeting_prompt" und "closing_message" → "closing_prompt". "id", "name", "description", "mandatory" sowie bei der Umfrage "created_at"/"updated_at"/"version" werden unverändert übernommen. Zusätzlich wird bei der Umfrage "type": "Flow" gesetzt.


# Beispiel JSON

Das folgende Beispiel zeigt die Übersetzung einer Umfrage mit drei Hauptfragen (rating, nps, yes_no) und ihren Folgefragen. Es entsteht aus einem Draft nach dem Format aus @survey_definition.md.

{
  "id": "90f142be-4066-43cd-abef-31a426421b77",
  "name": "kundenservice_90f142be",
  "title": "Kundenservice Feedback",
  "description": "Helfen Sie uns, unseren Service aktiv zu verbessern.",
  "greeting_prompt": "Schön, dass Sie sich Zeit für ein kurzes Feedback nehmen.",
  "closing_prompt": "Vielen Dank für die Teilnahme. Bis bald!",
  "created_at": "2026-08-17T12:05:00Z",
  "updated_at": "2026-08-25T12:38:23.564Z",
  "start_question_id": "0c1b7195-1c3a-4856-b2f1-89733e9404b0",
  "version": 3,
  "type": "Flow",
  "questions": [
    {
      "id": "0c1b7195-1c3a-4856-b2f1-89733e9404b0",
      "name": "zufriedenheit_0c1b7195",
      "type": "rating",
      "prompt": "Wie zufrieden waren Sie mit dem Service?",
      "description": "Geben Sie uns eine Schulnote von 0 bis 6.",
      "reprompt": "Bitte bewerten Sie Ihre Zufriedenheit mit einer Schulnote von 0 bis 6.",
      "mandatory": true,
      "options": {
        "values": [0, 1, 2, 3, 4, 5, 6],
        "min_value": 0,
        "max_value": 6
      },
      "default_next_question_id": "85a238d2-78da-4ad5-9291-277394544779",
      "conditional_next_question": [
        {
          "operator": "equals",
          "value": -1,
          "next_question_id": null
        },
        {
          "operator": "less_than",
          "value": 2,
          "next_question_id": "f1f68a0b-8b3c-4715-ad03-ff9cfc8ff9b3"
        },
        {
          "operator": "greater_than",
          "value": 4,
          "next_question_id": "7aec5fd3-7f1a-41ca-82d3-25a29250837b"
        }
      ]
    },
    {
      "id": "f1f68a0b-8b3c-4715-ad03-ff9cfc8ff9b3",
      "name": "warum_unzufrieden_f1f68a0b",
      "type": "choice",
      "prompt": "Warum waren Sie mit dem Service unzufrieden?",
      "description": "Lag es an dem Inhalt des Gesprächs oder an der Freundlichkeit des Personals?",
      "reprompt": "Sagen Sie mir bitte, ob es am Inhalt, an der Freundlichkeit oder an beidem lag.",
      "mandatory": false,
      "default_next_question_id": "85a238d2-78da-4ad5-9291-277394544779",
      "labels": ["Inhalt", "Freundlichkeit", "Beides"],
      "synonyms": [
        "Content; Inhaltlich; Thema",
        "Freundlich; Unfreundlich",
        ""
      ],
      "next_question_ids": [null, null, null]
    },
    {
      "id": "7aec5fd3-7f1a-41ca-82d3-25a29250837b",
      "name": "hinweis_super_7aec5fd3",
      "type": "comment",
      "prompt": "Das freut uns!",
      "description": "Was hat Ihnen besonders gut gefallen?",
      "reprompt": "",
      "mandatory": false,
      "default_next_question_id": "85a238d2-78da-4ad5-9291-277394544779"
    },
    {
      "id": "85a238d2-78da-4ad5-9291-277394544779",
      "name": "empfehlung_85a238d2",
      "type": "nps",
      "prompt": "Wie wahrscheinlich ist es, dass Sie uns weiterempfehlen?",
      "description": "Auf einer Skala von 0 (gar nicht wahrscheinlich) bis 10 (sehr wahrscheinlich).",
      "reprompt": "Bitte geben Sie eine Wahrscheinlichkeit zwischen 0 und 10 an.",
      "mandatory": false,
      "default_next_question_id": "86c4a809-d823-4946-9750-3069112948eb",
      "conditional_next_question": [
        {
          "operator": "equals",
          "value": -1,
          "next_question_id": null
        },
        {
          "operator": "less_than",
          "value": 7,
          "next_question_id": "0f2bf646-3e62-4777-9e87-4f3445dfb8e6"
        },
        {
          "operator": "greater_than",
          "value": 8,
          "next_question_id": "c5a6e5c1-96cd-4bea-bd5e-d92696deb6a6"
        }
      ]
    },
    {
      "id": "0f2bf646-3e62-4777-9e87-4f3445dfb8e6",
      "name": "warum_nicht_empfehlen_0f2bf646",
      "type": "comment",
      "prompt": "Warum würden Sie uns nicht weiterempfehlen?",
      "description": "",
      "reprompt": "",
      "mandatory": false,
      "default_next_question_id": "86c4a809-d823-4946-9750-3069112948eb"
    },
    {
      "id": "c5a6e5c1-96cd-4bea-bd5e-d92696deb6a6",
      "name": "was_gefaellt_gut_c5a6e5c1",
      "type": "comment",
      "prompt": "Was gefällt Ihnen am besten an uns?",
      "description": "",
      "reprompt": "",
      "mandatory": false,
      "default_next_question_id": "86c4a809-d823-4946-9750-3069112948eb"
    },
    {
      "id": "86c4a809-d823-4946-9750-3069112948eb",
      "name": "kontakt_geklaert_86c4a809",
      "type": "yes_no",
      "prompt": "Konnte Ihr Anliegen abschließend geklärt werden?",
      "description": "Sagen Sie bitte ja oder nein.",
      "reprompt": "Sagen Sie mir bitte, ob Ihr Anliegen telefonisch geklärt werden konnte.",
      "mandatory": true,
      "default_next_question_id": null,
      "options": {
        "yes_next_question_id": null,
        "no_next_question_id": "15dc33d5-da74-4655-a3ae-3d8093ffc1bc"
      }
    },
    {
      "id": "15dc33d5-da74-4655-a3ae-3d8093ffc1bc",
      "name": "warum_nicht_geklaert_15dc33d5",
      "type": "comment",
      "prompt": "Warum konnte Ihr Anliegen nicht abschließend geklärt werden?",
      "description": "Bitte beschreiben Sie das Problem genau.",
      "reprompt": "",
      "mandatory": false,
      "default_next_question_id": null
    }
  ]
}

Zur Erläuterung der Verkettung:
* Die drei Hauptfragen sind "zufriedenheit" (rating), "empfehlung" (nps) und "kontakt_geklaert" (yes_no); ihre "default_next_question_id" zeigt jeweils auf die nächste Hauptfrage. Bei der letzten Hauptfrage ("kontakt_geklaert") ist sie null (Ende der Umfrage).
* Jede Folgefrage bekommt als "default_next_question_id" dieselbe nächste Hauptfrage wie ihre Elternfrage (z. B. zeigen sowohl "warum_unzufrieden" als auch "hinweis_super" auf "empfehlung", weil beides Folgefragen von "zufriedenheit" sind).
* Bei "zufriedenheit" gibt es keine Folgefrage für "equals", daher der ungültige Platzhalterwert "-1" mit "next_question_id": null.
* Bei "warum_unzufrieden" (choice) gibt es für keine der drei Optionen eine Folgefrage, daher ist "next_question_ids" komplett null - der Flow macht dann direkt mit "default_next_question_id" weiter.
* Bei "kontakt_geklaert" (yes_no) gibt es nur für die Antwort "nein" eine Folgefrage; "yes_next_question_id" ist null. Der Flow macht bei "ja" direkt mit "default_next_question_id" (hier: Ende der Umfrage) weiter.

