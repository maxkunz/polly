# Mapping Umfrage zu Queue(s)

Eine Umfrage kann beliebig vielen Queues zugeordnet werden.
Dazu gibt es eine eigene Genesys Data Table. Ihr Name wird im Setup frei gewählt (vorbelegt mit `POLLY_MAPPING_DATA_TABLE_NAME` aus `constants/surveyConstants.ts`, aktuell `Bund_KSC_Atip_Polly_Mapping`), ID und Name stehen danach in `meta.setup.mappingDataTable` der `__meta`-Zeile. Installationen ohne diesen Eintrag suchen die Tabelle über den Konstantennamen - im Gegensatz zu den Umfragen selbst (siehe `datatablerow_survey_entry.md`) liegt das Mapping nicht als JSON-String in einer Zeile der Umfrage-Tabelle, sondern jede Queue ist eine eigene Zeile dieser Tabelle. Das erlaubt dem Architect Flow einen direkten Lookup über den Queue-Namen, ohne JSON parsen zu müssen.

## Spalten

| Spalte | Typ | Bedeutung |
| --- | --- | --- |
| `QueueName` | string | Key-Spalte der Tabelle. **Wichtig:** Genesys benennt die Key-Spalte im Schema/UI zwar "QueueName", das JSON-Property beim Lesen/Schreiben einer Zeile heißt aber wie bei jeder Data-Table-Zeile schlicht `key` - ein zusätzliches Feld `QueueName` im Payload wird vom Schema abgelehnt (`additionalProperties: false`). Der Name der Queue ist eindeutig ohne Beachtung der Groß-/Kleinschreibung. |
| `SurveyId` | string | ID der Umfrage, der diese Queue zugeordnet ist. |
| `DeliveryRate` | int | Wahrscheinlichkeit in Prozent (1-100), mit der die Umfrage am Anschluss eines Calls, welcher dieser Queue zugeordnet ist, geliefert werden soll. |

Dieses Mapping wird vom Flow eingelesen, der unsere Umfrage am Anschluss eines Calls auslöst.

Das Mapping kann auf der Deployment-Seite bearbeitet werden, sobald für die Umfrage entweder eine Stage- oder eine Prod-Version deployt ist (das Formular "Queue Mapping" erscheint dann zusätzlich). Das Mapping selbst kennt keine Trennung zwischen Stage und Prod - es gibt nur ein gemeinsames Mapping pro Umfrage.

Die Wahrscheinlichkeit wählt man über eine Auswahl aus den festen Werten 25 %, 50 %, 75 % oder 100 % aus (Standard: 25 %); sie ist für alle Queues der Umfrage gleich. Technisch ist in der Spalte `DeliveryRate` jeder ganzzahlige Wert von 1 bis 100 möglich, im Editor stehen aber nur diese vier Stufen zur Auswahl.
Die Queues werden über ein Freitextfeld eingegeben. Man kann pro Zeile eine Queue definieren.

## Speicherlogik

Da `QueueName` die Key-Spalte ist, kann es pro Queue nur eine Zeile geben - es gibt keine doppelten Queues (der Vergleich der Queue-Namen erfolgt ohne Beachtung der Groß-/Kleinschreibung). Beim Speichern werden zunächst alle Zeilen der Tabelle geladen, danach für die aktuelle Umfrage:

1. Zeilen dieser Umfrage, deren Queue nicht mehr in der neuen Liste steht, werden gelöscht.
2. Für jede gewünschte Queue:
   - Existiert bereits eine Zeile mit exakt passendem Key, wird sie aktualisiert (`SurveyId`, `DeliveryRate`).
   - Existiert eine Zeile mit abweichender Schreibweise (z. B. "queue 1" statt "Queue 1"), wird die alte Zeile gelöscht und mit der neu eingegebenen Schreibweise neu angelegt (Data-Table-Keys lassen sich nicht umbenennen).
   - Existiert noch keine Zeile, wird sie neu angelegt.

* Falls es bereits ein Mapping für eine Queue zu einer anderen Umfrage gibt, wird beim Speichern zunächst ein Bestätigungsdialog angezeigt ("Bestehende Zuordnungen überschreiben?"). Bestätigt der User, wird die Queue der anderen Umfrage entzogen und stattdessen der aktuellen Umfrage zugeordnet (die Zeile wird dabei mit der neuen `SurveyId` überschrieben).
* Um das Mapping für die aktuelle Umfrage zu entfernen, reicht es, das Textfeld zu leeren und zu speichern.

## Beispiel

| QueueName (Key) | SurveyId | DeliveryRate |
| --- | --- | --- |
| Queue 1 | 0d9815bc-65d5-4f64-a363-5ef5a0c96b75 | 25 |
| Queue 2 | 0d9815bc-65d5-4f64-a363-5ef5a0c96b75 | 25 |
| Queue 3 | ab098764-8a8f-4f64-a363-5ef5a0c96b75 | 50 |

## Hinweis zur Migration

Vor dieser Umstellung wurde das Mapping als JSON-Array im Feld `Prod` der Zeile `queue_mapping` in der Umfrage-Tabelle gespeichert. Diese Zeile wird von Code und UI nicht mehr gelesen oder geschrieben und bleibt unangetastet in der Umfrage-Tabelle liegen (keine automatische Migration).
