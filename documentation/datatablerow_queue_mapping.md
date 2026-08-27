# mapping umfrage zu queue(s)

eine umfrage kann beliebig vielen queues zugeordnet werden
dazu wird im umfrage data table die zeile mit dem key "queue_mapping" verwendet.
im feld "Prod" dieser zeile ist eine json struktur gespeichert, welche das mapping abbildet.

dieses mapping wird vom flow eingelesen der unsere umfrage an anschluss eines calls auslöst. dabei ist auch angegeben wie hoch die wahrscheinlichkeit ist (deliveryRate) ob die umfrage am Anschluss eines Calls welcher einer Queue zugeordnet ist geliefert werden soll. 

das mapping kann auf der deployment seite bearbeitet werden, aber nur wenn eine version in prod deployt ist (stage benötigt kein mapping es wird manuell verknüpft). solbald also eine version in prod deployt ist erscheint dort zusättzlich das formular "Queue Mapping" über welchen man das mapping bearbeiten kann.

die wahrscheinlichkeit wählt man über einen slider aus von 1 - 100%, sie ist für alle queues gleich. 
die queues werden über ein freitext feld eingegeben. man kann pro zeile eine queue definieren.

erzeugt wird daraus unten angegebenes json, welches im feld "Prod" gespeichert wird. dabei muss zuerst der alte json inhalt im feld "Prod" ausgelesen werden und dort die neuen änderungen eingepflegt werden. es darf danach jeweils nur einen eintrag pro queue geben. existiert also vorher bereits ein eintrag für eine queue, wird dieser gelöscht und durch den neuen ersetzt. es können keine doppelten queues existieren.

* falls es bereits ein mapping für eine queue zu einer anderen umfrage gibt wird ein hinweis angezeigt.
* um das mapping zu entfernen reicht es das textfeld zu leeren

# beispiel json

[
    {
        "queueName": "Queue 1",
        "surveyId": "0d9815bc-65d5-4f64-a363-5ef5a0c96b75",
        "deliveryRate": 5
    },
    {
        "queueName": "Queue 2",
        "surveyId": "0d9815bc-65d5-4f64-a363-5ef5a0c96b75",
        "deliveryRate": 5
    },
    {
        "queueName": "Queue 3",
        "surveyId": "ab098764-8a8f-4f64-a363-5ef5a0c96b75",
        "deliveryRate": 20
    }
]

