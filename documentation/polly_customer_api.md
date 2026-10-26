# Polly Kunden-API – Spezifikation (Version 1)

Mit der Kunden-API rufen Sie Daten aus Polly maschinell ab, ohne Genesys-Login:

| API | Zweck | Scope | Stand |
|---|---|---|---|
| Reporting | Antworten der Umfragen abrufen (dieselben Daten wie der CSV-Export der App) | `polly-api/reporting.read` | verfügbar |
| Einladungen | Einladungslinks für Web-Umfragen erzeugen | `polly-api/invitations.write` | verfügbar |
| Umfragedetails | Fragetexte, Optionen und Skalen der veröffentlichten Umfragen lesen | `polly-api/surveys.read` | verfügbar |
| Reporting-Summary | Anzahl und Verteilung der Sitzungen eines Zeitraums | `polly-api/reporting.read` | verfügbar |
| Reporting-Aggregate | Zählung pro Frage über die ganze Laufzeit | `polly-api/reporting.read` | geplant |
| Web-Designs | Designs der Umfrageseite exportieren und importieren | `polly-api/themes.read`, `polly-api/themes.write` | geplant |

Alle Anfragen und Antworten sind JSON in UTF-8. Zeitangaben sind UTC.

---

## 1. Zugangsdaten

Ihren Zugang richtet der Polly-Betrieb ein. Sie erhalten:

| Angabe | Beispiel | Hinweis |
|---|---|---|
| Token-URL | `https://app-m2m-<umgebung>.auth.eu-central-1.amazoncognito.com/oauth2/token` | Adresse für den Token-Abruf |
| Client-ID | `4p1k…` | |
| Client-Secret | `1q2w…` | Wird getrennt von der Client-ID übermittelt. Vertraulich behandeln und nicht im Browser oder in Apps verwenden. |
| Scope-String | `polly-api/reporting.read polly-api/surveys.read` | Die Scopes, die Ihr Zugang erlaubt |
| `[API_URL]` | `https://<app-domain>/api/ext/v1/reporting` | Basisadresse je API |

Ein Zugang gehört immer zu genau einer Polly-Installation (Mandant). Sie sehen nur Daten dieses Mandanten.

## 2. Anmeldung

Die API verwendet **OAuth 2.0 Client Credentials**. Sie holen mit Client-ID und Client-Secret ein Access Token und senden es bei jedem Aufruf mit.

### 2.1 Token abrufen

```bash
curl -X POST "<Token-URL>" \
  -u "<Client-ID>:<Client-Secret>" \
  -H "content-type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=polly-api/reporting.read"
```

- `scope` ist optional. Fehlt er, enthält das Token alle Scopes Ihres Zugangs. Mehrere Scopes werden durch Leerzeichen getrennt (in der URL-Kodierung `%20`).
- Statt `-u` können Client-ID und Client-Secret auch als Formularfelder `client_id` und `client_secret` gesendet werden.

**Antwort `200`:**

```json
{
  "access_token": "eyJraWQiOi…",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

Das Token ist **60 Minuten** gültig (`expires_in` in Sekunden). Verwenden Sie es für alle Aufrufe in dieser Zeit wieder und holen Sie erst kurz vor Ablauf ein neues. Ein Token pro Aufruf ist nicht nötig und kann vom Token-Dienst gedrosselt werden.

Fehler beim Token-Abruf (z. B. `400 invalid_client` bei falschem Secret, `400 invalid_scope` bei einem Scope, den Ihr Zugang nicht hat) meldet der Token-Dienst im OAuth-Format `{ "error": "…" }`.

### 2.2 API aufrufen

```bash
curl "[API_URL]/…" \
  -H "Authorization: Bearer <access_token>"
```

## 3. Antwortcodes und Fehlerformat

Fehler der Kunden-API haben dieses Format:

```json
{
  "error": "insufficient_scope",
  "message": "Token lacks scope polly-api/invitations.write"
}
```

`error` ist ein fester Code, auf den Sie im Programm reagieren können. `message` ist ein Hinweis für Menschen und kann sich ändern.

Diese Codes gelten für alle APIs. Die einzelnen APIs ergänzen eigene Codes in ihrem Abschnitt.

| HTTP | `error` | Bedeutung |
|---|---|---|
| `401` | `invalid_token` | Kein, ein ungültiges oder ein abgelaufenes Token. Neues Token holen. |
| `403` | `insufficient_scope` | Das Token hat nicht den Scope, den die Route verlangt. |
| `403` | `access_denied` | Der Zugang ist gesperrt bzw. gelöscht, oder die Polly-Installation ist nicht mehr aktiv. Ein noch gültiges Token hilft dann nicht. |
| `404` | `not_found` | Unbekannte Route. Kann auch direkt vom API Gateway kommen, dann im Format `{ "message": "Not Found" }`. |
| `429` | | Zu viele Anfragen. Später erneut versuchen, am besten mit wachsendem Abstand. Die Antwort kommt vom API Gateway und hat das Format `{ "message": "Too Many Requests" }`. Die Grenze gilt pro Route für alle Aufrufer zusammen, nicht pro Zugang; ein `429` kann also auch ohne eigene hohe Last auftreten. |
| `500` | `internal_error` | Interner Fehler. Bei wiederholtem Auftreten den Polly-Betrieb mit Uhrzeit und Route informieren. |

## 4. Versionierung

Die Version steht im Pfad (`/ext/v1/…`).

- **Zusätzliche Felder tolerieren:** Neue Felder in Antworten und neue optionale Parameter können jederzeit in der bestehenden Version dazukommen. Ihr Programm muss unbekannte Felder ignorieren.
- **Neue Version:** Eine neue Version (z. B. `/ext/v2/…`) gibt es nur, wenn Felder umbenannt oder entfernt werden, sich Typ oder Bedeutung eines Felds ändern oder ein Pflichtparameter dazukommt.
- **Übergangszeit:** Nach Erscheinen einer neuen Version läuft die alte noch eine vereinbarte Zeit weiter und wird danach abgeschaltet.
- Ihr Zugang und seine Scopes gelten für alle Versionen. Für eine neue Version brauchen Sie keine neuen Zugangsdaten.

## 5. API 1: Reporting

Liefert die Antworten einer Umfrage in einem Zeitraum, dieselben Daten wie der CSV-Export der App. Ein Datensatz entspricht einer Antwort (einer CSV-Zeile).

- **Scope:** `polly-api/reporting.read`
- **`[API_URL]`:** `https://<app-domain>/api/ext/v1/reporting`

### 5.1 `GET [API_URL]/data`

| Parameter | Pflicht | Format / Standard | Hinweis |
|---|---|---|---|
| `surveyId` | ja | UUID der Umfrage | Es gibt keine Abfrage über alle Umfragen. |
| `from` | ja | `YYYY-MM-DDTHH:mm:ss` (UTC, ohne `Z`) | Inklusiv, bezogen auf den Start der Sitzung. |
| `to` | ja | wie `from` | Exklusiv, muss nach `from` liegen. `to − from` darf höchstens 24 Stunden betragen. |
| `version` | nein | Ganzzahl | Nur Antworten dieser Umfrageversion. |
| `page` | nein | positive Ganzzahl, Standard `1` | |
| `limit` | nein | positive Ganzzahl, Standard und Maximum `1000` | Größere Werte werden auf 1000 begrenzt. |

```bash
curl "[API_URL]/data?surveyId=123e4567-e89b-12d3-a456-426614174000&from=2026-10-01T00:00:00&to=2026-10-02T00:00:00&page=1&limit=500" \
  -H "Authorization: Bearer <access_token>"
```

**Antwort `200`:**

```json
{
  "data": [
    {
      "responseId": "2f1c9a6e-…",
      "conversationId": "2f1c9a6e-…",
      "surveyId": "123e4567-e89b-12d3-a456-426614174000",
      "surveyName": "Kundenzufriedenheit_123e4567",
      "surveyVersion": 3,
      "questionId": "Zufriedenheit_9a8b7c6d",
      "questionType": "rating",
      "answeredAt": "2026-10-01T10:00:20.000Z",
      "value": 9,
      "status": "completed",
      "channel": "flow",
      "sessionStartedAt": "2026-10-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 500,
    "total": 1,
    "totalPages": 1,
    "hasPreviousPage": false,
    "hasNextPage": false
  }
}
```

| Feld | Beschreibung |
|---|---|
| `responseId` | Kennung der Sitzung. |
| `conversationId` | Bei `channel` = `flow` die Conversation-ID (gleich `responseId`), bei `web` `null`. |
| `surveyId`, `surveyName`, `surveyVersion` | Umfrage und ihre Version. |
| `questionId` | Technischer Name der Frage. Er ist derselbe wie `questionId` in den Umfragedetails. |
| `questionType` | `rating`, `nps`, `choice`, `yes_no` oder `comment`. |
| `answeredAt` | Zeitpunkt der Antwort (ISO 8601, UTC). |
| `value` | Antwort mit ihrem Typ: Zahl (`rating`, `nps`), Boolean (`yes_no`) oder Text (`choice`, `comment`). Ohne Formelschutz wie im CSV. |
| `status` | Status der Sitzung, z. B. `partial`, `completed`, `timed_out`. |
| `channel` | `flow` (Telefon/Architect) oder `web`. |
| `sessionStartedAt` | Start der Sitzung (ISO 8601, UTC). |

Die Datensätze sind nach `sessionStartedAt`, `responseId`, `answeredAt` und `questionId` sortiert. Eine `page` hinter der letzten Seite liefert `200` mit leerem `data`.

**Antwortcodes:**

| HTTP | `error` | Bedeutung |
|---|---|---|
| `200` | | Erfolg, auch bei leerem Ergebnis. |
| `400` | `invalid_request` | Ungültiger oder fehlender Parameter (`message` nennt ihn), ungültiger Zeitraum. |
| `401`, `403` | | siehe Abschnitt 3 |
| `413` | `range_too_large` | Der Zeitraum enthält zu viele Sitzungen (über 10.000) oder konnte nicht rechtzeitig gelesen werden. Kürzeren Zeitraum wählen. |
| `413` | `page_too_large` | Die Seite wäre größer als 5 MB (z. B. viele lange Freitexte). Kleineres `limit` wählen. |
| `500` | `internal_error` | siehe Abschnitt 3 |

**Hinweis:** Fragen Sie nur Zeiträume ab, die **mindestens eine Stunde zurückliegen**. Offene Sitzungen bekommen noch Antworten, und der Status `timed_out` wird erst nach etwa 45 Minuten gesetzt. Bei laufenden Zeiträumen können sich sonst die Seiten verschieben. Rufen Sie alle Seiten eines Zeitraums nacheinander ab, bis `hasNextPage` `false` ist.

### 5.2 `GET [API_URL]/summary`

Zählt die Sitzungen einer Umfrage in einem Zeitraum und verteilt sie nach Status, Kanal und Version, ohne die Antworten zu laden. Geeignet für Dashboards und Monitoring.

| Parameter | Pflicht | Format / Standard | Hinweis |
|---|---|---|---|
| `surveyId` | ja | UUID der Umfrage | |
| `from` | ja | `YYYY-MM-DDTHH:mm:ss` (UTC, ohne `Z`) | Inklusiv, bezogen auf den Start der Sitzung. |
| `to` | ja | wie `from` | Exklusiv, muss nach `from` liegen. `to − from` darf höchstens **31 Tage** betragen. |
| `version` | nein | Ganzzahl | Nur Sitzungen dieser Umfrageversion. |

```bash
curl "[API_URL]/summary?surveyId=123e4567-e89b-12d3-a456-426614174000&from=2026-10-01T00:00:00&to=2026-11-01T00:00:00" \
  -H "Authorization: Bearer <access_token>"
```

**Antwort `200`:**

```json
{
  "surveyId": "123e4567-e89b-12d3-a456-426614174000",
  "from": "2026-10-01T00:00:00",
  "to": "2026-11-01T00:00:00",
  "version": null,
  "sessions": 120,
  "statusCounts": { "completed": 90, "partial": 10, "timed_out": 20 },
  "channelCounts": { "flow": 100, "web": 20 },
  "versionCounts": { "2": 40, "3": 80 }
}
```

| Feld | Beschreibung |
|---|---|
| `from`, `to` | Wie angefragt. |
| `version` | Der Parameter `version`, `null` ohne Angabe. |
| `sessions` | Anzahl der Sitzungen im Zeitraum, **auch Sitzungen ohne Antwort** (z. B. aufgelegt vor der ersten Frage). |
| `statusCounts` | Anzahl pro Status der Sitzung, z. B. `partial`, `completed`, `timed_out`. |
| `channelCounts` | Anzahl pro Kanal, `flow` (Telefon/Architect) oder `web`. |
| `versionCounts` | Anzahl pro Umfrageversion. Mit `version` enthält sie nur diese Version. |

Ohne Sitzungen antwortet die Route mit `200`, `sessions` `0` und leeren Objekten.

**Abgleich mit `/data`:** `/data` liefert nur Sitzungen mit mindestens einer Antwort. `sessions` kann deshalb größer sein als die Anzahl verschiedener `responseId` in `/data` für denselben Zeitraum. Der Filter `version` wirkt in beiden Routen gleich.

**Antwortcodes:**

| HTTP | `error` | Bedeutung |
|---|---|---|
| `200` | | Erfolg, auch bei leerem Ergebnis. |
| `400` | `invalid_request` | Ungültiger oder fehlender Parameter (`message` nennt ihn), ungültiger Zeitraum, Zeitraum über 31 Tage. |
| `401`, `403` | | siehe Abschnitt 3 |
| `413` | `range_too_large` | Der Zeitraum konnte nicht rechtzeitig gelesen werden. Kürzeren Zeitraum wählen. |
| `500` | `internal_error` | siehe Abschnitt 3 |

**Hinweis:** Wie bei `/data` nur Zeiträume abfragen, die **mindestens eine Stunde zurückliegen**, weil offene Sitzungen noch ihren Status ändern.

## 6. API 2: Einladungen

Erzeugt Einladungslinks für Web-Umfragen, so wie die App auf der Einladungs-Unterseite. Die Links lassen sich direkt an Teilnehmer verschicken.

- **Scope:** `polly-api/invitations.write`
- **`[API_URL]`:** `https://<app-domain>/api/ext/v1`

### 6.1 `POST [API_URL]/invitations`

**Request (JSON):**

| Feld | Pflicht | Format | Hinweis |
|---|---|---|---|
| `survey_uuid` | ja | UUID der Umfrage | Die Umfrage braucht einen Prod-Stand. Groß- und Kleinschreibung egal. |
| `amount` | ja | Ganzzahl von 1 bis 5000 | Anzahl der Links. |
| `is_multi` | ja | Boolean | `true`: Der Link ist beliebig oft nutzbar. `false`: Genau eine Teilnahme pro Link. |
| `expiration_date` | nein | `YYYY-MM-DD` | Der Link läuft am **Ende dieses Tages um 23:59:59 UTC** ab. Ein vergangener Tag ist ungültig, heute ist erlaubt. Ohne das Feld läuft der Link nie ab. |

```bash
curl -X POST "[API_URL]/invitations" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "survey_uuid": "123e4567-e89b-12d3-a456-426614174000", "amount": 100, "is_multi": false, "expiration_date": "2026-12-31" }'
```

**Antwort `200`:**

```json
{
  "inviteUrls": [
    {
      "inviteToken": "eyJhbGciOiJIUzI1NiIs…",
      "fullLink": "https://example.amplifyapp.com/s/eyJhbGciOiJIUzI1NiIs…",
      "expiration_date": "2026-12-31",
      "is_multi": false
    }
  ]
}
```

| Feld | Beschreibung |
|---|---|
| `inviteToken` | Der signierte Token der Einladung. |
| `fullLink` | Fertiger Link zur Umfrage. Hat die Umfrage in Polly eine gültige Basis-URL, zeigt er auf diese Seite (Platzhalter `{token}` wird ersetzt, sonst wird `token=<jwt>` angehängt). Sonst, auch bei einer ungültigen Basis-URL, zeigt er auf die Umfrageseite von Polly (`…/s/<token>`). |
| `expiration_date` | Ablaufdatum (UTC) oder `null`, wenn die Einladung nicht abläuft. |
| `is_multi` | Wie im Request. |

Die Tokens werden bei Polly nicht gespeichert. Ein Link mit `is_multi: false` wird beim ersten Absenden der Umfrage verbraucht. Jeder Aufruf erzeugt neue Links, auch bei gleichem Request.

**Antwortcodes:**

| HTTP | `error` | Bedeutung |
|---|---|---|
| `200` | | Erfolg. |
| `400` | `invalid_request` | Ungültiges oder fehlendes Feld (`message` nennt es), vergangenes Ablaufdatum. |
| `401`, `403` | | siehe Abschnitt 3 |
| `409` | `no_prod` | Die Umfrage hat keinen Prod-Stand, existiert nicht oder wird gerade gelöscht. |
| `413` | `payload_too_large` | Der Request ist zu groß. |
| `413` | `response_too_large` | Die Antwort wäre zu groß. Weniger Links pro Aufruf anfordern. |
| `429` | `genesys_error` | Genesys drosselt gerade (oder Drosselung durch das API Gateway ohne `error`, siehe Abschnitt 3). Später erneut versuchen. |
| `500` | `internal_error` | siehe Abschnitt 3 |
| `502` | `genesys_error` | Die Umfrage konnte nicht geladen werden (Genesys nicht erreichbar oder Zugriff fehlt). |

**Hinweis:** Die Route ist stark gedrosselt (jeder Aufruf kann bis zu 5000 Links erzeugen). Erzeugen Sie lieber einen größeren Stapel als viele kleine Aufrufe. Bei 5000 Links ist die Antwort etwa 4 bis 5 MB groß (je nach Länge der Basis-URL).

## 7. API 3: Umfragedetails

Liefert Fragetexte, Optionen und Skalen der **veröffentlichten** Umfragen (Prod-Stand). Damit lassen sich die Antworten aus dem Reporting auswerten und die Umfragen z. B. in einem CMS darstellen.

- **Scope:** `polly-api/surveys.read`
- **`[API_URL]`:** `https://<app-domain>/api/ext/v1`

### 7.1 `GET [API_URL]/surveys`

Liste aller Umfragen, die einen Prod-Stand haben. Umfragen ohne Prod-Stand, gelöschte und solche, deren Löschung läuft, fehlen. Sortiert nach Titel, dann nach `surveyId`.

```bash
curl "[API_URL]/surveys" -H "Authorization: Bearer <access_token>"
```

**Antwort `200`:**

```json
{
  "surveys": [
    {
      "surveyId": "123e4567-e89b-12d3-a456-426614174000",
      "name": "kundenzufriedenheit_123e4567",
      "title": "Kundenzufriedenheit",
      "description": "Kurze Umfrage nach dem Kontakt",
      "version": 3,
      "updatedAt": "2026-10-01T09:30:00.000Z",
      "language": "de"
    }
  ]
}
```

| Feld | Beschreibung |
|---|---|
| `surveyId` | UUID der Umfrage, dieselbe wie `surveyId` im Reporting. |
| `name` | Technischer Name der Umfrage (ändert sich nie). |
| `title`, `description` | Titel und Beschreibung. |
| `version` | Version des Prod-Stands. Ältere Stände ohne Versionsnummer haben `0`. |
| `updatedAt` | Zeitpunkt der letzten Änderung (UTC) oder `null`. |
| `language` | Sprache der Web-Umfrageseite: `de`, `en` oder `fr`. |

### 7.2 `GET [API_URL]/surveys/{surveyId}`

Eine Umfrage mit allen Fragen.

```bash
curl "[API_URL]/surveys/123e4567-e89b-12d3-a456-426614174000" -H "Authorization: Bearer <access_token>"
```

**Antwort `200`** (gekürzt):

```json
{
  "surveyId": "123e4567-e89b-12d3-a456-426614174000",
  "name": "kundenzufriedenheit_123e4567",
  "title": "Kundenzufriedenheit",
  "description": "Kurze Umfrage nach dem Kontakt",
  "version": 3,
  "updatedAt": "2026-10-01T09:30:00.000Z",
  "language": "de",
  "greeting": "Willkommen",
  "closing": "Vielen Dank",
  "startQuestionId": "0c1b7195-1c3a-4856-b2f1-89733e9404b0",
  "baseUrl": null,
  "webTheme": null,
  "questions": [
    {
      "id": "0c1b7195-1c3a-4856-b2f1-89733e9404b0",
      "questionId": "zufriedenheit_0c1b7195",
      "type": "rating",
      "text": "Wie zufrieden sind Sie?",
      "description": "",
      "reprompt": "Bitte nennen Sie eine Zahl von 1 bis 5.",
      "mandatory": true,
      "defaultNextQuestionId": null,
      "scale": { "min": 1, "max": 5, "values": [1, 2, 3, 4, 5], "minLabel": "gar nicht", "maxLabel": "sehr" },
      "conditions": [
        { "operator": "less_than", "value": 3, "nextQuestionId": "85a238d2-78da-4ad5-9291-277394544779" }
      ]
    }
  ]
}
```

**Felder der Umfrage** (zusätzlich zu denen der Liste):

| Feld | Beschreibung |
|---|---|
| `greeting`, `closing` | Begrüßung und Verabschiedung (am Telefon gesprochen). |
| `startQuestionId` | `id` der ersten Frage, `null` nur, wenn der Prod-Stand keine Startfrage enthält. Umfragen ohne Fragen liefert die API nicht (nicht in der Liste, Details `404`). |
| `baseUrl` | Basis-URL der Umfrageseite des Kunden, die in Polly gepflegt ist (Web-Kanal), sonst `null`. |
| `webTheme` | Design der Web-Umfrageseite (Farben, Schrift) oder `null`, wenn kein Design gewählt oder hinterlegt ist. Die Struktur steht in `schemaVersion`; Sie müssen unbekannte Felder ignorieren. |
| `questions` | Fragen in der Reihenfolge der Umfrage. |

**Felder jeder Frage:**

| Feld | Beschreibung |
|---|---|
| `id` | UUID der Frage. Folgefragen verweisen darauf. |
| `questionId` | Technischer Name der Frage, **derselbe Schlüssel wie `questionId` im Reporting**. Darüber ordnen Sie Antworten den Fragen zu. |
| `type` | `yes_no`, `choice`, `rating`, `nps` oder `comment`. |
| `text` | Fragetext. |
| `description` | Zusatztext, leer wenn keiner gepflegt ist. |
| `reprompt` | Text für eine Nachfrage bei unverständlicher Antwort am Telefon, leer wenn keiner gepflegt ist. |
| `mandatory` | `true`, wenn die Frage beantwortet werden muss. |
| `defaultNextQuestionId` | Folgefrage, wenn keine der Bedingungen zutrifft, sonst `null` (Ende der Umfrage). |

**Je nach Typ zusätzlich:**

| Typ | Felder |
|---|---|
| `yes_no` | `yesNextQuestionId`, `noNextQuestionId` (jeweils `id` oder `null`) |
| `choice` | `options`: Liste von `{ label, synonyms, nextQuestionId }`. `synonyms` ist eine Liste von Wörtern, die am Telefon wie das Label zählen (leer, wenn es keine gibt). |
| `rating` | `scale`: `{ min, max, values, minLabel, maxLabel }` (`values` sind die wählbaren Zahlen, die Labels sind `null` ohne Pflege) und `conditions` |
| `nps` | `scale`: `{ min: 0, max: 10, minLabel, maxLabel }` und `conditions` |
| `comment` | keine |

`conditions` ist die Liste der Verzweigungen bei `rating` und `nps`: `{ operator, value, nextQuestionId }` mit `operator` `equals`, `less_than` oder `greater_than`. Sie werden in dieser Reihenfolge geprüft; trifft keine zu, gilt `defaultNextQuestionId`. `nextQuestionId` kann `null` sein; dann geht es ebenfalls mit `defaultNextQuestionId` weiter. Für Architect intern ergänzte, unerfüllbare Platzhalter-Bedingungen liefert die API nicht.

**Antwortcodes (beide Routen):**

| HTTP | `error` | Bedeutung |
|---|---|---|
| `200` | | Erfolg. |
| `400` | `invalid_request` | `surveyId` ist keine UUID. |
| `401`, `403` | | siehe Abschnitt 3 |
| `404` | `not_found` | Die Umfrage hat keinen Prod-Stand, existiert nicht oder wird gerade gelöscht. |
| `429` | `genesys_error` | Genesys drosselt gerade (oder Drosselung durch das API Gateway ohne `error`, siehe Abschnitt 3). Später erneut versuchen. |
| `500` | `internal_error` | siehe Abschnitt 3 |
| `502` | `genesys_error` | Die Umfragen konnten nicht geladen werden (Genesys nicht erreichbar, Zugriff fehlt oder die Liste ließ sich nicht rechtzeitig lesen). |

**Hinweise:**
- **Nur der aktuelle Prod-Stand.** Es gibt keine Versionsgeschichte: Ältere Versionen sind nicht abrufbar. Antworten im Reporting tragen ihre `surveyVersion`; haben sich Fragen seit dieser Version geändert, passen Texte und Verzweigungen nicht mehr zu den alten Antworten (der technische Name `questionId` bleibt dabei gleich).
- **Bis zu 1 Minute verzögert.** Ein neuer Prod-Stand erscheint in der API erst nach bis zu einer Minute, ein geändertes Design nach bis zu anderthalb Minuten. Das gilt auch für gerade gelöschte Umfragen.
- Rufen Sie die Liste nicht bei jedem Seitenaufruf Ihres Systems ab, sondern halten Sie das Ergebnis selbst kurz vor.

---

## Für Entwickler: So entsteht eine v2

Dieser Abschnitt richtet sich an das Polly-Entwicklungsteam, nicht an Kunden. Hintergrund und Aufteilung: [implementationsplan_external_api.md](implementationsplan_external_api.md#versionierung).

- **Kern ohne Version** in `amplify/functions/shared/`: Anmeldung (`api_client_auth.ts`, `resolveApiClient`), Scopes (`api_scopes.ts`), Lesen der Sitzungen, internes Antwortmodell, Signieren, Linkaufbau, Laden der Umfragen. Er kennt weder Pfade noch Feldnamen der Kunden-API.
- **Versionsschicht:** Für jede API eine neue Datei neben der v1, z. B. `reporting_api/v2.ts`. Sie prüft den Request und bildet die Antwort Feld für Feld ab (`toV2Record` …). Das interne Modell nie direkt durchreichen. Die v1-Datei bleibt unverändert.
- **Routing:** Ein neuer Eintrag in der Routing-Tabelle des Handlers (z. B. `"GET /ext/v2/reporting/data": v2.data`) und eine neue Route in `amplify/backend.ts`, mit Drosselung in `defaultStageCfn.routeSettings` und Eintrag in `addDependency`.
- **Scopes:** Die vorhandenen Scopes gelten weiter, bestehende Clients funktionieren ohne Änderung.
- **Tests:** Eigene Tests für v2 in `test/customerApi.test.ts`. Die v1-Tests (feste Feldlisten) bleiben bestehen und müssen grün bleiben.
- **Doku:** Diese Datei um die v2 ergänzen, die Übergangszeit der v1 mit den Kunden vereinbaren.
