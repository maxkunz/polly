### Die folgende Liste wird in der Zeile "survey_list" der Data Table gespeichert
Diese Data-Table-Zeile enthält eine JSON-Liste von Umfragen, um zu verhindern, dass jedes Mal alle Zeilen der Data Table gelesen werden müssen, um die Umfragen in der Auswahl darzustellen.

Die Liste liegt (wie bei den anderen Umfrage-Zeilen) im Feld "Draft" dieser Zeile als JSON-String und wird bei jedem Anlegen, Speichern oder Löschen einer Umfrage automatisch mitaktualisiert.

### Beispiel JSON

[
    {
        "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        "title": "Kundenzufriedenheit 2026"
    },
    {
        "id": "d4b8e6a1-7c9f-402a-9e12-3a4b5c6d7e8f",
        "title": "Umweltschutz und Klimawandel 2026"
    },
    {
        "id": "d6e8a002-c9a1-432d-9610-18e38d380e22",
        "title": "Zufriedenheit mit dem IT-Helpdesk 2026"
    },
    {
        "id": "f1a8e1e0-32b0-4d43-982d-48612198c253",
        "title": "Bewertung Zufriedenheit mit dem Contact Center"
    }
]

* "title" entspricht dem Titel der Umfrage (Fallback auf den technischen Namen bzw. "Unbenannte Umfrage", falls kein Titel gesetzt ist).