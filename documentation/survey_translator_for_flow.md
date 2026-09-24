# survey translator for flow

Der Genesys Architect Flow benötigt eine optimierte json struktur um eine umfrage abzuarbeiten.

Dazu muss das Baumförmige "Draft" JSON Format (siehe @survey_definition.md) in eine Flache verkettete JSON Struktur übersetzt werden.

Ale Fragen müssen in einer verketteten struktur vorliegen damit der Flow weiss welche Frage als nächstes zu stellen ist. Die Nächste Frgae wird über "default_next_question_id" in Hauptfragen und "next_question_id" in Folgefragen mit Bedingungen gesteuert. Gibt es keine weitere Frage wird dort null hinterlegt.

Die JSON Notation für Folgefragen ist Typabhänggig, siehe BEispiel JSON unten.
Typ "TEXT" hat keine Folgefragen.
Typ "NPS" und "RATING" muss im JSON "conditional_next_question" gesetzt werden, dort müssen immer für alle Bedingungen Einträge vorhanden sein. Ist keine Folgefrage für eine Bedingung vorhanden wird muss im JSON für den Flow eine Folgefrage mit einer ungültigen Bedingung angelegt werden, zum Beispiel mit value -1 bei equals oder mit value 1000 bei greater_than oder mit value -1000 bei less_than. Trifft keine Bedingung zu greift "default_next_question_id


Bei Typ Rating bitte beachten dass im Flow JSON Format alle möglichen Antworten noch explizit als array angegeben werden müssen. Siehe beispiel json rating unten.


# Beispiel json

{
  "id": "4b4ff810",
  "name": "test_sophie_4b4ff810",
  "title": "Test Sophie",
  "description": "Helfen Sie uns, unseren Service aktiv zu verbessern.",
  "greeting_prompt": "Schön, dass sie sich Zeit für ein kurzes Feedback nehmen. Im Folgenden werden Ihnen fünf zu Fragen zu Ihrer Erfahrung mit unserem Kundenservice gestellt.",
  "closing_prompt": "Vielen Dank für die Teilnahme. Bis bald!",
  "created_at": "2026-08-17T12:05:00Z",
  "updated_at": "2026-08-25T12:38:23.564Z",
  "start_question_id": "cf4f602a",
  "version": 45,
  "type": "Flow",
  "questions": [
    {
      "id": "cf4f602a",
      "name": "zufriedenheit_cf4f602a",
      "type": "rating",
      "prompt": "Wie zufrieden waren Sie mit dem Service?",
      "description": "Geben Sie uns eine Schulnote von 1 bis 6.",
      "reprompt": "Bitte bewerten Sie Ihre Zufriedenheit mit einer Schulnote von 1 bis 6.",
      "mandatory": true,
      "options": {
        "values": [0,1,2,3,4,5,6],
        "min_value": 0,
        "max_value": 6
      },
      "default_next_question_id": null,
      "conditional_next_question": [
        {
          "operator": "equals",
          "value": 4,
          "next_question_id": "50108b54"
        },              
        {
          "operator": "less_than",
          "value": 2,
          "next_question_id": "1c353c7d"
        },        
        {
          "operator": "greater_than",
          "value": 4,
          "next_question_id": "50108b54"
        }
        
      ]
    },
    {
      "id": "50108b54",
      "name": "warum_unzufrieden_50108b54",
      "type": "choice",
      "prompt": "Warum waren Sie mit dem Service unzufrieden?",
      "description": "Lag es an dem Inhalt des Gesprächs oder an der Freundlichkeit des Personals?",
      "reprompt": "Warum waren Sie mit dem Service unzufrieden?",
      "mandatory": false,
      "default_next_question_id": null,
      "labels": ["Inhalt", "Freundlichkeit", "beides"],
      "next_question_ids": ["06498151", "06498151", "06498151"]
    },
    {
      "id": "1c353c7d",
      "name": "weiterer_kommentar_1c353c7d",
      "type": "comment",
      "prompt": "Danke! ",
      "description": "Wobei könnten wir dennoch besser werden?",
      "reprompt": "",
      "mandatory": false,
      "default_next_question_id": "06498151"
    },    
    {
      "id": "06498151",
      "name": "thema_06498151",
      "type": "choice",
      "prompt": "Zu welchem Thema haben Sie sich von uns beraten lassen?",
      "description": "Bitte wählen sie aus: zur Immobilienfinanzierung, zur privaten Altersvorsorge oder zum Thema Fonds",
      "reprompt": "Haben Sie sich zur Immobilienfinanzierung, zur privaten Altersvorsorge oder zum Thema Fonds beraten lassen?",
      "mandatory": false,
      "default_next_question_id": "e5286947",
      "labels": ["Immobilienfinanzierung", "private Altersvorsorge", "Fonds"],
      "next_question_ids": [null, null, "62fc395f"]
    },
    {
      "id": "62fc395f",
      "name": "fonds_62fc395f",
      "type": "yes_no",
      "prompt": "Ging es dabei auch um das Thema Riester?",
      "description": "",
      "reprompt": "Sagen Sie mir bitte, ob es dabei um das Thema Riester ging.",
      "mandatory": false,
      "default_next_question_id": "e5286947",
      "options": {
          "yes_next_question_id": "e5286947",
          "no_next_question_id": "e5286947"
      }      
    },
    {
      "id": "e5286947",
      "name": "abschluss_e5286947",
      "type": "yes_no",
      "prompt": "Konnte Ihr Thema abschließend geklärt werden?",
      "description": "Sagen Sie bitte ja oder nein.",
      "reprompt": "Sagen Sie mir bitte, ob ihr Thema telefonisch geklärt werden konnte.",
      "default_next_question_id": "0c9e9f5d",
      "mandatory": true,
      "options": {
        "yes_next_question_id": null,
        "no_next_question_id": "758b691e"
      }
    },
    {
      "id": "758b691e",
      "name": "warum_758b691e",
      "type": "comment",
      "prompt": "Warum konnte ihr Thema nicht abschließend bearbeitet werden?",
      "description": "Bitte beschreiben Sie das Problem genau.",
      "default_next_question_id": "0c9e9f5d"
    },
    {
      "id": "758b691e",
      "name": "weiterempfehlung_758b691e",
      "type": "nps",
      "prompt": "Wie wahrscheinlich ist es, dass sie uns weiterempfehlen?",
      "description": "Auf einer Skala von 0, gar nicht wahrscheinlich bis 10, sehr wahrscheinlich",
      "reprompt": "Bitte geben Sie eine Wahrscheinlichkeit zwischen 0 und 10 an.",
      "mandatory": false,
      "default_next_question_id": "76512969",
      "conditional_next_question": [
        {
          "operator": "equals",
          "value": -1,
          "next_question_id": null
        },        
        {
          "operator": "less_than",
          "value": 7,
          "next_question_id": "8caec475"
        },
        {
          "operator": "greater_than",
          "value": 10,
          "next_question_id": null
        }        
      ]      
    },
    {
      "id": "8caec475",
      "name": "grund_8caec475",
      "type": "comment",
      "prompt": "Warum würden Sie uns nicht weiterempfehlen?",
      "description": "",
      "reprompt": "",
      "mandatory": false,
      "default_next_question_id": "76512969"
    },
    {
      "id": "76512969",
      "name": "verbesserung_76512969",
      "type": "comment",
      "prompt": "Welche Verbesserungsvorschläge haben Sie für unseren Service?",
      "description": "",
      "reprompt": "Sagen Sie uns, was Sie Sich von uns wünschen",
      "mandatory": true,
      "default_next_question_id": null
    }
  ]
}

