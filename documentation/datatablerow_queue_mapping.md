# Mapping Umfrage zu Queue(s)

Eine Umfrage kann beliebig vielen Queues zugeordnet werden.
Dazu wird in der Data Table der Umfragen die Zeile mit dem Key "queue_mapping" verwendet.
Im Feld "Prod" dieser Zeile ist eine JSON-Struktur gespeichert, welche das Mapping abbildet.

Dieses Mapping wird vom Flow eingelesen, der unsere Umfrage am Anschluss eines Calls auslöst. Dabei ist auch angegeben, wie hoch die Wahrscheinlichkeit ist (deliveryRate), dass die Umfrage am Anschluss eines Calls, welcher einer Queue zugeordnet ist, geliefert werden soll.

Das Mapping kann auf der Deployment-Seite bearbeitet werden, sobald für die Umfrage entweder eine Stage- oder eine Prod-Version deployt ist (das Formular "Queue Mapping" erscheint dann zusätzlich). Das Mapping selbst kennt aber keine Trennung zwischen Stage und Prod - es gibt nur ein gemeinsames Mapping pro Umfrage, das immer im Feld "Prod" der Zeile "queue_mapping" gespeichert wird.

Die Wahrscheinlichkeit wählt man über eine Auswahl aus den festen Werten 25 %, 50 %, 75 % oder 100 % aus (Standard: 25 %); sie ist für alle Queues der Umfrage gleich. Technisch ist im gespeicherten JSON jeder ganzzahlige Wert von 1 bis 100 möglich, im Editor stehen aber nur diese vier Stufen zur Auswahl.
Die Queues werden über ein Freitextfeld eingegeben. Man kann pro Zeile eine Queue definieren.

Erzeugt wird daraus das unten angegebene JSON, welches im Feld "Prod" gespeichert wird. Dabei muss zuerst der alte JSON-Inhalt im Feld "Prod" ausgelesen werden und dort die neuen Änderungen eingepflegt werden. Es darf danach jeweils nur einen Eintrag pro Queue geben (der Vergleich der Queue-Namen erfolgt ohne Beachtung der Groß-/Kleinschreibung). Existiert also vorher bereits ein Eintrag für eine Queue, wird dieser gelöscht und durch den neuen ersetzt. Es können keine doppelten Queues existieren.

* Falls es bereits ein Mapping für eine Queue zu einer anderen Umfrage gibt, wird beim Speichern zunächst ein Bestätigungsdialog angezeigt ("Bestehende Zuordnungen überschreiben?"). Bestätigt der User, wird die Queue der anderen Umfrage entzogen und stattdessen der aktuellen Umfrage zugeordnet.
* Um das Mapping für die aktuelle Umfrage zu entfernen, reicht es, das Textfeld zu leeren und zu speichern.

# Beispiel JSON

[
    {
        "queueName": "Queue 1",
        "surveyId": "0d9815bc-65d5-4f64-a363-5ef5a0c96b75",
        "deliveryRate": 25
    },
    {
        "queueName": "Queue 2",
        "surveyId": "0d9815bc-65d5-4f64-a363-5ef5a0c96b75",
        "deliveryRate": 25
    },
    {
        "queueName": "Queue 3",
        "surveyId": "ab098764-8a8f-4f64-a363-5ef5a0c96b75",
        "deliveryRate": 50
    }
]

