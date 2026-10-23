# Polly Kunden-API – Spezifikation (Version 1)

Mit der Kunden-API rufen Sie Daten aus Polly maschinell ab, ohne Genesys-Login:

| API | Zweck | Scope | Stand |
|---|---|---|---|
| Reporting | Antworten der Umfragen abrufen (dieselben Daten wie der CSV-Export der App) | `polly-api/reporting.read` | folgt |
| Einladungen | Einladungslinks für Web-Umfragen erzeugen | `polly-api/invitations.write` | folgt |
| Umfragedetails | Fragetexte, Optionen und Skalen der veröffentlichten Umfragen lesen | `polly-api/surveys.read` | folgt |

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
| `429` | | Zu viele Anfragen. Später erneut versuchen, am besten mit wachsendem Abstand. Die Antwort kommt vom API Gateway und hat das Format `{ "message": "Too Many Requests" }`. |
| `500` | `internal_error` | Interner Fehler. Bei wiederholtem Auftreten den Polly-Betrieb mit Uhrzeit und Route informieren. |

## 4. Versionierung

Die Version steht im Pfad (`/ext/v1/…`).

- **Zusätzliche Felder tolerieren:** Neue Felder in Antworten und neue optionale Parameter können jederzeit in der bestehenden Version dazukommen. Ihr Programm muss unbekannte Felder ignorieren.
- **Neue Version:** Eine neue Version (z. B. `/ext/v2/…`) gibt es nur, wenn Felder umbenannt oder entfernt werden, sich Typ oder Bedeutung eines Felds ändern oder ein Pflichtparameter dazukommt.
- **Übergangszeit:** Nach Erscheinen einer neuen Version läuft die alte noch eine vereinbarte Zeit weiter und wird danach abgeschaltet.
- Ihr Zugang und seine Scopes gelten für alle Versionen. Für eine neue Version brauchen Sie keine neuen Zugangsdaten.

## 5. API 1: Reporting

Folgt.

## 6. API 2: Einladungen

Folgt.

## 7. API 3: Umfragedetails

Folgt.

---

## Für Entwickler: So entsteht eine v2

Dieser Abschnitt richtet sich an das Polly-Entwicklungsteam, nicht an Kunden. Hintergrund und Aufteilung: [implementationsplan_external_api.md](implementationsplan_external_api.md#versionierung).

- **Kern ohne Version** in `amplify/functions/shared/`: Anmeldung (`api_client_auth.ts`, `resolveApiClient`), Scopes (`api_scopes.ts`), Lesen der Sitzungen, internes Antwortmodell, Signieren, Linkaufbau, Laden der Umfragen. Er kennt weder Pfade noch Feldnamen der Kunden-API.
- **Versionsschicht:** Für jede API eine neue Datei neben der v1, z. B. `reporting_api/v2.ts`. Sie prüft den Request und bildet die Antwort Feld für Feld ab (`toV2Record` …). Das interne Modell nie direkt durchreichen. Die v1-Datei bleibt unverändert.
- **Routing:** Ein neuer Eintrag in der Routing-Tabelle des Handlers (z. B. `"GET /ext/v2/reporting/data": v2.data`) und eine neue Route in `amplify/backend.ts`, mit Drosselung in `defaultStageCfn.routeSettings` und Eintrag in `addDependency`.
- **Scopes:** Die vorhandenen Scopes gelten weiter, bestehende Clients funktionieren ohne Änderung.
- **Tests:** Eigene Tests für v2 in `test/customerApi.test.ts`. Die v1-Tests (feste Feldlisten) bleiben bestehen und müssen grün bleiben.
- **Doku:** Diese Datei um die v2 ergänzen, die Übergangszeit der v1 mit den Kunden vereinbaren.
