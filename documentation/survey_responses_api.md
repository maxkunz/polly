# Survey Responses API – Dokumentation

Diese API dient der Erfassung und Auswertung von Umfrageergebnissen (Survey Responses). Sie wird primär aus **Genesys Cloud Inbound/Outbound Flows** während eines laufenden Telefonats aufgerufen, kann aber auch von Frontend- und Reporting-Systemen (z. B. Admin-Dashboard) abgefragt werden.

---

## 1. Architektur & Konzepte

### 1.1 Datenspeicherung (DynamoDB)
Das System nutzt zwei DynamoDB-Tabellen:

1. **`SurveyResponsesTable` (Rohdaten pro Anruf-Session)**
   - **Partition Key (PK):** `tenantId` (String)
   - **Sort Key (SK):** `responseId` (String, entspricht der Genesys `conversationId`)
   - **GSI `byTenantSurvey`:** PK `tenantId`, SK `surveyStartedAt` (`${surveyId}#${ISO-Timestamp}`) für chronologische Abfragen und Paginierung.
   - **GSI `byStatus`:** PK `status`, SK `updatedAt` für das automatische Cleanup von verlassenen Sessions.

2. **`SurveyAggregatesTable` (Echtzeit-Statistiken pro Frage)**
   - **Partition Key (PK):** `tenantSurveyId` (`${tenantId}#${surveyId}`)
   - **Sort Key (SK):** `questionName` (unveränderlicher Bezeichner der Frage)
   - Ermöglicht O(1)-Abfragen von aggregierten Kennzahlen (Durchschnittswerte, Häufigkeitsverteilung) ohne Scan über alle Einzelsessions.

### 1.2 Session-Lifecycle & Status
Ein Anrufer kann eine Umfrage jederzeit abbrechen (Auflegen). Daher wird jede Antwort inkrementell per Upsert gespeichert:

```
[Erste Antwort] ───────► Status: partial
                            │
       ┌────────────────────┴────────────────────┐
       ▼                                         ▼
[Letzte Frage beantwortet]              [Anrufer legt auf]
(isCompleted: true gesendet)             (inaktiv > 30 Min.)
       │                                         │
       ▼                                         ▼
Status: completed                       Status: timed_out
                                        (automatisch via Cleanup-Lambda)
```

- **`partial`**: Die Session ist aktiv oder wurde vorzeitig abgebrochen.
- **`completed`**: Der Flow hat die Umfrage regulär mit `isCompleted: true` beendet.
- **`timed_out`**: Die Session verblieb länger als 30 Minuten im Zustand `partial` und wurde durch die periodische Cleanup-Lambda (alle 15 Minuten) als abgebrochen markiert.

> **Hinweis:** Trifft nach einem `timed_out` noch eine weitere Antwort (`questionName` + `value`, ohne `isCompleted: true`) für dieselbe `conversationId` ein, wird diese trotzdem in `answers` gespeichert; der Status bleibt aber auf `timed_out` stehen (kein automatischer Rücksprung zu `partial`). Ein späterer Aufruf mit `isCompleted: true` setzt den Status dagegen immer auf `completed`, auch wenn die Session zuvor bereits `timed_out` war.

---

## 2. Authentifizierung & Mandantentrennung

Jeder Request muss authentifiziert sein. Die Tenant-Zuordnung (`tenantId`) erfolgt serverseitig automatisch über das `Authorization`-Token.

### Authentifizierungsarten
1. **Genesys Cloud Flow (Bearer Token):**
   - Header: `Authorization: Bearer <GENESYS_BEARER_TOKEN>`
   - Header: `x-genesys-region: <REGION>` (z. B. `mypurecloud.de` oder `mypurecloud.com`, Standard: `mypurecloud.de`)
2. **Cognito User Pool (Admin/Web-UI):**
   - Header: `Authorization: Bearer <COGNITO_ACCESS_TOKEN>`
   - Es wird ausschließlich ein **Access Token** akzeptiert (`token_use: "access"`); ein Cognito **ID Token** (`token_use: "id"`) wird abgelehnt.
   - Anhand des JWT-Issuers (`iss`-Claim) wird automatisch erkannt, ob es sich um ein Cognito- oder ein Genesys-Token handelt; `x-genesys-region` ist für den Cognito-Pfad nicht erforderlich.

### Basis-URL
```text
https://<amplify-api-domain>/api
```

---

## 3. Fragetypen & Wertebereiche

Das Feld `questionName` ist der unveränderliche technische Bezeichner der Frage aus der Umfragedefinition.

| `questionType` | Erwarteter `value`-Typ | Beispiel | Aggregation in `SurveyAggregatesTable` |
| :--- | :--- | :--- | :--- |
| `yes_no` | `boolean` | `true` / `false` | `counts.true`, `counts.false`, `totalResponses` |
| `nps` | `number` (0–10 Ganzzahl) | `9` | `counts["9"]`, `sum`, `totalResponses` |
| `rating` | `number` (Ganzzahl, z. B. 0–5 oder 0–8) | `4` | `counts["4"]`, `sum`, `totalResponses` |
| `choice` | `string` (Label der gewählten Option) | `"Dashboard-Analysen"` | `counts["Dashboard-Analysen"]`, `totalResponses` |
| `comment` | `string` (transkribierter Text) | `"Sehr freundlich"` | Nur `totalResponses` (keine Häufigkeitsverteilung) |

> Bei `choice` kennt das flow-optimierte JSON (siehe @survey_translator_for_flow.md) keine Options-IDs mehr, sondern nur noch die Labels der Auswahlmöglichkeiten - der Flow kann daher nur das Label als `value` senden, keine ID.

---

## 4. Endpunkte

### 4.1 POST `/survey-responses`
Speichert eine einzelne Antwort oder schließt die Session ab. Führt einen atomaren Upsert in `SurveyResponsesTable` und aktualisiert `SurveyAggregatesTable`.

#### Request Headers
```http
Authorization: Bearer <TOKEN>
x-genesys-region: mypurecloud.de
Content-Type: application/json
```

#### Request Body
```typescript
interface SubmitSurveyAnswerBody {
  conversationId: string;    // Genesys Conversation ID (Pflicht)
  surveyId: string;          // Eindeutige ID der Umfrage (Pflicht)
  surveyName?: string;       // Technischer Name der Umfrage
  surveyVersion?: number;    // Version der Umfrage (Standard: 1)
  questionName?: string;     // Technischer Name der Frage (Pflicht, falls isCompleted nicht true)
  questionType?: "rating" | "nps" | "choice" | "yes_no" | "comment";
  value?: any;               // Antwortwert (boolean, number oder string)
  isCompleted?: boolean;     // true bei der letzten Frage oder Abschluss-Aufruf
}
```

> **Hinweis:** `surveyName` und `surveyVersion` werden bei **jedem** Aufruf neu geschrieben, nicht nur beim ersten. Wird `surveyName` bei einem späteren Aufruf für dieselbe `conversationId` weggelassen, wird der zuvor gespeicherte Name mit `""` überschrieben; wird `surveyVersion` weggelassen, fällt sie auf den Standardwert `1` zurück und überschreibt damit einen zuvor gespeicherten anderen Wert. Es empfiehlt sich daher, beide Felder bei jedem Aufruf innerhalb derselben Session konsistent mitzuschicken.

> **Hinweis:** Mindestens `questionName` (mit `value`) **oder** `isCompleted: true` muss übergeben werden.

#### Beispiel 1: Antwort auf Einzelfrage während des Telefonats
```http
POST /survey-responses HTTP/1.1
Content-Type: application/json

{
  "conversationId": "4f9d2a60-9d21-4f4c-bf6b-734ebda99d91",
  "surveyId": "1718e427-0661-4716-95f5-4b1e4bc0233a",
  "surveyName": "kundenzufriedenheit_2026",
  "surveyVersion": 2,
  "questionName": "nps_ce9b05b7",
  "questionType": "nps",
  "value": 9,
  "isCompleted": false
}
```

#### Beispiel 2: Letzte Frage mit Session-Abschluss
```http
POST /survey-responses HTTP/1.1
Content-Type: application/json

{
  "conversationId": "4f9d2a60-9d21-4f4c-bf6b-734ebda99d91",
  "surveyId": "1718e427-0661-4716-95f5-4b1e4bc0233a",
  "surveyName": "kundenzufriedenheit_2026",
  "surveyVersion": 2,
  "questionName": "kommentar_e80f5583",
  "questionType": "comment",
  "value": "Sehr schnelle und kompetente Hilfe am Telefon.",
  "isCompleted": true
}
```

#### Response (200 OK)
```json
{
  "message": "Saved successfully",
  "session": {
    "tenantId": "org-tenant-123",
    "responseId": "4f9d2a60-9d21-4f4c-bf6b-734ebda99d91",
    "surveyId": "1718e427-0661-4716-95f5-4b1e4bc0233a",
    "surveyName": "kundenzufriedenheit_2026",
    "surveyVersion": 2,
    "status": "completed",
    "startedAt": "2026-09-04T13:00:10.123Z",
    "updatedAt": "2026-09-04T13:01:45.678Z",
    "completedAt": "2026-09-04T13:01:45.678Z",
    "surveyStartedAt": "1718e427-0661-4716-95f5-4b1e4bc0233a#2026-09-04T13:00:10.123Z",
    "answers": {
      "nps_ce9b05b7": {
        "type": "nps",
        "value": 9,
        "answeredAt": "2026-09-04T13:00:10.123Z"
      },
      "kommentar_e80f5583": {
        "type": "comment",
        "value": "Sehr schnelle und kompetente Hilfe am Telefon.",
        "answeredAt": "2026-09-04T13:01:45.678Z"
      }
    }
  }
}
```

---

### 4.2 GET `/survey-responses/aggregates`
Liefert die vorberechneten Aggregat-Daten aller Fragen einer Umfrage für den Mandanten. Geeignet für Dashboard-Kacheln, Diagramme und Kennzahlen-Übersichten.

#### Query Parameters
| Parameter | Typ | Pflicht | Beschreibung |
| :--- | :--- | :--- | :--- |
| `surveyId` | `string` | **Ja** | Eindeutige ID der Umfrage |

#### Beispiel Request
```http
GET /survey-responses/aggregates?surveyId=1718e427-0661-4716-95f5-4b1e4bc0233a HTTP/1.1
Authorization: Bearer <TOKEN>
x-genesys-region: mypurecloud.de
```

#### Response (200 OK)
```json
{
  "surveyId": "1718e427-0661-4716-95f5-4b1e4bc0233a",
  "tenantId": "org-tenant-123",
  "items": [
    {
      "tenantSurveyId": "org-tenant-123#1718e427-0661-4716-95f5-4b1e4bc0233a",
      "questionName": "ja_oder_nein_46d4db2f",
      "questionType": "yes_no",
      "surveyId": "1718e427-0661-4716-95f5-4b1e4bc0233a",
      "surveyName": "kundenzufriedenheit_2026",
      "tenantId": "org-tenant-123",
      "totalResponses": 142,
      "updatedAt": "2026-09-04T13:01:45.678Z",
      "counts": {
        "true": 118,
        "false": 24
      }
    },
    {
      "tenantSurveyId": "org-tenant-123#1718e427-0661-4716-95f5-4b1e4bc0233a",
      "questionName": "nps_ce9b05b7",
      "questionType": "nps",
      "surveyId": "1718e427-0661-4716-95f5-4b1e4bc0233a",
      "surveyName": "kundenzufriedenheit_2026",
      "tenantId": "org-tenant-123",
      "totalResponses": 139,
      "sum": 1195,
      "updatedAt": "2026-09-04T13:01:45.678Z",
      "counts": {
        "7": 12,
        "8": 35,
        "9": 52,
        "10": 40
      }
    },
    {
      "tenantSurveyId": "org-tenant-123#1718e427-0661-4716-95f5-4b1e4bc0233a",
      "questionName": "kommentar_e80f5583",
      "questionType": "comment",
      "surveyId": "1718e427-0661-4716-95f5-4b1e4bc0233a",
      "surveyName": "kundenzufriedenheit_2026",
      "tenantId": "org-tenant-123",
      "totalResponses": 64,
      "updatedAt": "2026-09-04T13:01:45.678Z"
    }
  ]
}
```

> **Berechnungshinweise für das Reporting:**
> - **Durchschnitt (Rating/NPS):** `avg = item.sum / item.totalResponses`
> - **NPS-Score (% Promotoren - % Detektoren):** Kann anhand von `item.counts` (Promotoren: 9–10, Passive: 7–8, Detektoren: 0–6) errechnet werden.

> **Hinweis zur Zählung:** Jeder POST-Aufruf mit `questionName` + `value` erhöht `totalResponses` (und ggf. `sum`/`counts`) für diese Frage um 1, unabhängig davon, ob für diese `conversationId` bereits einmal eine Antwort auf dieselbe Frage gesendet wurde. Ein erneutes Senden (z. B. bei einem Retry oder wenn eine Frage im Flow wiederholt wird) führt also zu einer doppelten Zählung in den Aggregaten - in den Rohdaten (`SurveyResponsesTable`) wird die Antwort pro `questionName` dagegen überschrieben; dort bleibt nur der letzte Wert erhalten.

---

### 4.3 GET `/survey-responses/raw`
Liefert Rohdaten-Sessions einer Umfrage sortiert nach Startzeit (neueste zuerst). Unterstützt Filterung nach Status sowie Cursor-basierte Paginierung.

#### Query Parameters
| Parameter | Typ | Pflicht | Standard | Beschreibung |
| :--- | :--- | :--- | :--- | :--- |
| `surveyId` | `string` | **Ja** | - | Eindeutige ID der Umfrage |
| `status` | `string` | Nein | alle | Filtert nach Session-Status (`completed`, `partial`, `timed_out`) |
| `limit` | `number` | Nein | `50` | Anzahl Einträge pro Seite (min. `1`, max. `200`) |
| `cursor` | `string` | Nein | - | Base64-kodierter Cursor für die nächste Seite (`nextCursor`) |

#### Beispiel Request
```http
GET /survey-responses/raw?surveyId=1718e427-0661-4716-95f5-4b1e4bc0233a&status=completed&limit=2 HTTP/1.1
Authorization: Bearer <TOKEN>
x-genesys-region: mypurecloud.de
```

#### Response (200 OK)
```json
{
  "items": [
    {
      "tenantId": "org-tenant-123",
      "responseId": "conv-987123",
      "surveyId": "1718e427-0661-4716-95f5-4b1e4bc0233a",
      "surveyName": "kundenzufriedenheit_2026",
      "surveyVersion": 2,
      "status": "completed",
      "startedAt": "2026-09-04T14:10:00.000Z",
      "updatedAt": "2026-09-04T14:11:30.000Z",
      "completedAt": "2026-09-04T14:11:30.000Z",
      "surveyStartedAt": "1718e427-0661-4716-95f5-4b1e4bc0233a#2026-09-04T14:10:00.000Z",
      "answers": {
        "nps_ce9b05b7": {
          "type": "nps",
          "value": 10,
          "answeredAt": "2026-09-04T14:10:20.000Z"
        }
      }
    }
  ],
  "nextCursor": "eyd0ZW5hbnRJZCc6J29yZy0xMjMnLCdzdXJ2ZXlTdGFydGVkQXQnOic...=="
}
```

> **Paginierungs-Workflow:**
> Wenn `nextCursor` nicht `null` ist, kann der Wert im nächsten Request als `&cursor=<nextCursor>` übergeben werden, um die nächste Seite abzurufen.

> **Hinweis zum `status`-Filter:** `limit` begrenzt die Anzahl der aus der Tabelle gelesenen Einträge, bevor der optionale `status`-Filter angewendet wird. Eine Seite kann dadurch weniger Einträge enthalten als `limit` (oder sogar leer sein), obwohl `nextCursor` weiterhin gesetzt ist - es lohnt sich also, bei aktivem Filter so lange nachzublättern, bis `nextCursor` `null` ist, auch wenn eine Seite leer war.

---

### 4.4 GET `/survey-responses/session`
Gibt die Detaildaten einer einzelnen Anruf-Session anhand der Genesys `conversationId` zurück.

#### Query Parameters
| Parameter | Typ | Pflicht | Beschreibung |
| :--- | :--- | :--- | :--- |
| `conversationId` | `string` | **Ja** | Genesys Conversation ID |

#### Beispiel Request
```http
GET /survey-responses/session?conversationId=4f9d2a60-9d21-4f4c-bf6b-734ebda99d91 HTTP/1.1
Authorization: Bearer <TOKEN>
x-genesys-region: mypurecloud.de
```

#### Response (200 OK)
```json
{
  "item": {
    "tenantId": "org-tenant-123",
    "responseId": "4f9d2a60-9d21-4f4c-bf6b-734ebda99d91",
    "surveyId": "1718e427-0661-4716-95f5-4b1e4bc0233a",
    "surveyName": "kundenzufriedenheit_2026",
    "surveyVersion": 2,
    "status": "completed",
    "startedAt": "2026-09-04T13:00:10.123Z",
    "updatedAt": "2026-09-04T13:01:45.678Z",
    "completedAt": "2026-09-04T13:01:45.678Z",
    "surveyStartedAt": "1718e427-0661-4716-95f5-4b1e4bc0233a#2026-09-04T13:00:10.123Z",
    "answers": {
      "ja_oder_nein_46d4db2f": {
        "type": "yes_no",
        "value": true,
        "answeredAt": "2026-09-04T13:00:15.000Z"
      },
      "nps_ce9b05b7": {
        "type": "nps",
        "value": 9,
        "answeredAt": "2026-09-04T13:00:40.000Z"
      },
      "kommentar_e80f5583": {
        "type": "comment",
        "value": "Supportmitarbeiter war sehr hilfsbereit.",
        "answeredAt": "2026-09-04T13:01:45.000Z"
      }
    }
  }
}
```

---

## 5. Fehlerbehandlung (HTTP Status Codes)

Alle Fehler werden als einheitliches JSON-Objekt mit dem Feld `message` zurückgegeben:

```json
{
  "message": "Beschreibung des Fehlers"
}
```

| HTTP Status | Ursache / Bedeutung |
| :--- | :--- |
| **`400 Bad Request`** | Fehlende Pflichtfelder (`conversationId`, `surveyId`), ungültiges JSON, weder `questionName` noch `isCompleted: true` übergeben, oder ungültiger `cursor` bei `/survey-responses/raw`. |
| **`401 Unauthorized`** | Fehlendes oder ungültiges Token (Genesys oder Cognito) bzw. Mandant nicht freigeschaltet. |
| **`404 Not Found`** | Session mit angegebener `conversationId` existiert nicht, oder falsche Route/Methode (Antwort enthält dann zusätzlich `method` und `path`). |
| **`500 Internal Server Error`** | Unerwarteter Serverfehler oder fehlende Tabellenkonfiguration in Lambda Environment. |

> Ein `OPTIONS`-Preflight-Request wird immer mit `204 No Content` (leerer Body) beantwortet.

---

## 6. Automatisches Cleanup (Timeout von Abbrüchen)

- **Lambda:** `survey_cleanup`
- **Auslöser:** Amazon EventBridge Rule mit festem Intervall alle 15 Minuten (rate-basiert, nicht an feste Uhrzeiten wie `:00`/`:15`/`:30`/`:45` gebunden, sondern relativ zum Deployment-Zeitpunkt der Regel)
- **Ablauf:**
  1. Sucht per GSI `byStatus` alle Einträge mit `status = 'partial'` und `updatedAt` älter als der Timeout (Query direkt mit Cutoff-Zeitstempel, in Seiten à max. 100 Einträgen).
  2. Aktualisiert pro gefundenem Eintrag den Status auf `timed_out` und setzt `timedOutAt = now` (nur, falls der Eintrag zwischenzeitlich nicht bereits verändert wurde).
  3. Pro Lauf werden maximal ca. 500 Einträge geprüft; verbleibende Einträge werden beim nächsten Lauf (15 Minuten später) weiterverarbeitet.
- Der Timeout ist über die Umgebungsvariable `TIMEOUT_MINUTES` konfigurierbar und steht aktuell auf **30 Minuten**.
- Dadurch fließen abgebrochene Sessions nicht dauerhaft als aktive Sessions durchs System und können im Reporting separat gefiltert werden.
