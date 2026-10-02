# CSV Report der Umfrageergebnisse

## Frontend

In der Umfragenansicht (Editor-Toolbar, neben "Deploy") führt der Button "Report" auf eine Subpage
(`/surveys?id=<id>&report=1`). Dort kann ein CSV-Report der Antworten dieser Umfrage heruntergeladen werden.
Der Button ist nur für gespeicherte Umfragen sichtbar und – wie "Deploy" – bei ungespeicherten Änderungen deaktiviert.

Vorher kann man den Report zeitlich filtern, indem man ein von - bis Datum einstellt:

- Standard: die letzten 30 Tage. Schnellauswahl: Heute, Letzte 7 Tage, Letzte 30 Tage, Aktueller Monat, Letzter Monat.
- Die Tage werden in der **lokalen Zeitzone** gewählt (von 00:00:00.000 bis 23:59:59.999) und als UTC an das Backend übergeben.
- Der Zeitraum bezieht sich auf den **Start der Umfrage-Sitzung** (Zeitpunkt der ersten Antwort, Feld `surveyStartedAt`),
  nicht auf `answeredAt` der einzelnen Antwort. Eine Sitzung, die vor Mitternacht beginnt und danach endet,
  wird komplett dem Starttag zugerechnet.
- Optional kann auf eine **Survey-Version** gefiltert werden. Das Dropdown wird aus der Vorschau befüllt
  (nur Versionen, die im Zeitraum vorkommen, inkl. Anzahl Sitzungen).
- Eine **Vorschau** zeigt vor dem Download die Anzahl der Sitzungen sowie die Aufteilung nach Status.
  Sie wird bei jeder Änderung des Zeitraums neu geladen. Bei 0 Sitzungen ist der Download deaktiviert.
  Die Anzahl der Antworten wird bewusst nicht angezeigt: Dafür müssten alle Antwort-Maps gelesen werden,
  was bei großen Datenmengen die Vorschau stark verlangsamt.
- Solange die Report-Subpage offen ist, aktualisiert sich die Vorschau zusätzlich **einmal pro Minute**
  automatisch im Hintergrund (kleines Sync-Icon neben "Vorschau" statt des großen Lade-Spinners), damit
  neu eingehende Antworten sichtbar werden, ohne den Zeitraum neu wählen zu müssen. Pausiert, während ein
  Download läuft (dessen Fortschrittsanzeige liest `summary.versions`) oder der Browser-Tab im
  Hintergrund ist. Haben sich die Werte dabei tatsächlich geändert, pulsiert die Vorschau kurz
  (inhaltlicher Vergleich, nicht nur neu geladen).
- Beim Download wird ein Fortschritt angezeigt; er kann abgebrochen werden.
- Dateiname: `<Survey-Name>_<von>_<bis>[_v<version>].csv`.

## Backend

Eine neue Lambda Funktion (`amplify/functions/survey_responses_export/`) kümmert sich um den Export der Daten aus der
DynamoDB der Umfrageantworten (`SurveyResponsesTable`, Index `byTenantSurvey`). Sie hat nur Lesezugriff.
Endpunkte und Parameter: siehe [survey_responses_api.md](survey_responses_api.md#45-get-survey-responsesexport-und-survey-responsesexportsummary).

### Export in Teilabrufen

Eine Lambda-Antwort hinter API Gateway ist auf 6 MB begrenzt, die HTTP API bricht nach 30 s ab. Bei 500–5.000 Sitzungen pro
Tag wäre ein Monatsreport um ein Vielfaches größer. Der Export läuft deshalb in **Teilabrufen** mit Cursor:

- Jeder Teilabruf liefert höchstens ca. 4 MB CSV (`EXPORT_CHUNK_BYTES`) bzw. endet, sobald weniger als 9 s Laufzeit
  übrig sind, und immer an einer Sitzungsgrenze.
- Existiert der Header `x-next-cursor`, ruft das Frontend mit `cursor=<wert>` erneut auf, bis er fehlt.
- Das Frontend setzt die Teilstücke zu einer Datei zusammen (UTF-8 **mit BOM**, damit Excel Umlaute richtig liest).
  Die Kopfzeile steht nur im ersten Teilstück.
- Dasselbe Verfahren gilt für die Vorschau (`/export/summary`), deren Teil-Aggregate das Frontend addiert.
- `/export/summary` fragt den Zeitraum intern in mehreren parallelen Zeitabschnitten ab (statt einer
  einzigen sequenziellen Abfrage), um bei großen Datenmengen deutlich schneller zu sein. Das ist ein
  Implementierungsdetail hinter dem Cursor und ändert nichts am Aufrufverhalten.

### CSV Format

```
responseId;Survey Name;Survey-Version;QuestionId;Type;answeredAt;value;status
```

| Spalte | Quelle |
| :--- | :--- |
| `responseId` | Genesys `conversationId` der Sitzung |
| `Survey Name` | `surveyName` (technischer Name, nicht der Titel) |
| `Survey-Version` | `surveyVersion` |
| `QuestionId` | technischer Fragename (`questionName`, z. B. `nps_ce9b05b7`) – eine Fragen-UUID wird nicht gespeichert |
| `Type` | technischer Typ: `yes_no`, `nps`, `rating`, `choice`, `comment` |
| `answeredAt` | Zeitpunkt der Antwort, ISO-8601 in UTC |
| `value` | Antwortwert (`yes_no`: `true`/`false`, `nps`/`rating`: Zahl, `choice`: Label, `comment`: Text) |
| `status` | Sitzungsstatus: `partial`, `completed`, `timed_out` (Ergänzung zur ursprünglichen Spezifikation, zum Filtern in Excel) |

Regeln:

- Eine Zeile pro Antwort. Sitzungen ohne Antworten erzeugen keine Zeile. Ein erneut gesendeter Wert überschreibt die
  Antwort (es zählt der letzte Wert je Frage).
- Trennzeichen `;`, Zeilenende `\r\n`. Felder mit `;`, `"` oder Zeilenumbrüchen werden nach RFC 4180 gequotet
  (`"` wird verdoppelt).
- **Formel-Schutz:** Textwerte, die mit `=`, `+`, `-`, `@`, Tab oder CR beginnen, bekommen ein `'` vorangestellt, damit
  Excel sie nicht als Formel ausführt. Zahlen sind nicht betroffen.
- Reihenfolge: Sitzungen aufsteigend nach Start, innerhalb einer Sitzung aufsteigend nach `answeredAt`.

### Grenzen und Fehlerfälle

- Der Cursor ist an Mandant und Umfrage gebunden; ein fremder oder manipulierter Cursor wird mit `400` abgelehnt.
- Fehlende/ungültige `from`/`to` oder `from > to` ergeben `400`, ein fehlendes Token `401`.
- Die Vorschau muss ebenfalls alle Sitzungen im Zeitraum lesen; bei sehr großen Zeiträumen dauert sie entsprechend länger
  (mehrere Teilabrufe, Zwischenstand wird angezeigt).
