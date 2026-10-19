# Web Umfragen

Zusätzlich zu den Kanälen Telefon und Chat (Genesys Architect) gibt es den Kanal **Web**: öffentliche Umfragen, die über personalisierte Einladungslinks (JWT) aufgerufen werden. Antworten landen erst beim Absenden in DynamoDB.

Zielniveau der Umfrageseite: **WCAG 2.2 AA**.

## Entscheidungen im Überblick

1. **Signatur im Backend:** `POST /api/invitations` signiert die Einladungen mit HS256. Der Schlüssel liegt in AWS Secrets Manager, der JWT-Header enthält `kid` (Rotation).
2. **Umfrageseite** ist ein zweiter Vite-Einstiegspunkt desselben Repos (`survey.html`, `src/webSurvey/`), ohne Genesys-SDK und ohne `appStore`, ausgeliefert über dasselbe Amplify-Hosting.
3. **Ausgespielt wird der Prod-Stand** (Flow-JSON, siehe [survey_translator_for_flow.md](survey_translator_for_flow.md)). Ohne Prod-Deploy ist die Umfrage nicht verfügbar; ein Rollback wirkt automatisch auch im Web.
4. **Darstellung als ein Formular:** Alle Hauptfragen stehen auf einer Seite, Folgefragen erscheinen direkt unter ihrer Elternfrage, sobald die Bedingung zutrifft. `mandatory` macht eine Frage zur Pflichtangabe. Abgeschickt wird mit „Absenden“.
5. **Links erzeugen** erfordert die Rolle `polly_deploy` (Frontend und serverseitig, siehe [permissions.md](permissions.md)).
6. **Angezeigte Texte:** Titel, Begrüßung, Fragetitel, Beschreibung (Hilfetext), Optionen, Min/Max-Labels und nach dem Absenden die Verabschiedung. Reprompt und Synonyme werden im Web nicht angezeigt.
7. **Sprache:** Das Draft-Feld `language` (`de`/`en`/`fr`, Default `de`) steuert die festen UI-Texte und `<html lang>`. Fehlerseiten, die vor dem Laden der Umfrage erscheinen, nutzen die Browsersprache. **Fehlt `language` im Flow-JSON** (ältere Prod-Stände), gilt auf der Seite und im Backend ausdrücklich `de`.
8. **Reporting:** Web-Antworten bekommen `channel: "web"` und `tokenId`. Die CSV hat eine neue letzte Spalte `Channel` (Antworten ohne Feld: `flow`).

## Änderungen im Editor

* **Labels bei rating und nps:** Pro Frage gibt es ein optionales Label für den minimalen und den maximalen Wert (`min_label`, `max_label` in `options`, höchstens 100 Zeichen). Sie werden nicht vorgelesen und sind nur im Web (und in der Skalenvorschau des Editors) sichtbar.
* **Basis-URL der Umfrage** (`base_url`): Die Umfrage wird oft in iframes eingebunden, die personalisierten Links müssen auf diese URL zeigen. Optional; wenn gesetzt eine absolute `https://`-URL mit höchstens einem Platzhalter `{token}`.
* **Sprache der Umfrage** (`language`): siehe oben. Neue Umfragen starten mit `de`.

Format der Felder: [survey_definition.md](survey_definition.md). Übernahme ins Flow-JSON: [survey_translator_for_flow.md](survey_translator_for_flow.md).

## Einladungslinks

Eine Einladung ist ein JWT (HS256) mit folgender Payload:

```json
{
  "tenant_id": "org-tenant-123",
  "survey_id": "3ee3807f-5ace-4e8a-9b9b-f48139f05c31",
  "token_id": "65ca85ba-9137-4ebb-b845-06e4d7c2e960",
  "multi": true,
  "iat": 1792155364,
  "exp": 1793487599
}
```

Header: `{ "alg": "HS256", "typ": "JWT", "kid": "<8 Zeichen>" }`.

| Feld | Bedeutung |
| :--- | :--- |
| `tenant_id` | Mandant. Die Payload der ursprünglichen Spezifikation enthielt keinen Mandanten; ohne ihn könnte das öffentliche Backend die Umfrage nicht zuordnen. |
| `survey_id` | Umfrage, für die die Einladung gilt. |
| `token_id` | UUID der Einladung. Bei Einmal-Einladungen (`multi=false`) wird sie beim Absenden gespeichert (Tabelle `InvitationTokens`, TTL 180 Tage). |
| `multi` | `true`: jeder mit dem Link kann beliebig oft teilnehmen. `false`: genau eine Teilnahme. |
| `iat` | Ausstellungszeitpunkt (Epoch-Sekunden). |
| `exp` | Optionales Ablaufdatum der Einladung (Epoch-Sekunden). Fehlt es, läuft die Einladung nie ab. |

`exp` ergibt sich aus dem gewählten Ablaufdatum als **Tagesende 23:59:59 in der lokalen Zeit des Erstellers**. `exp` ist damit die letzte gültige Sekunde: Abgelaufen ist die Einladung erst, wenn die aktuelle Zeit `exp` überschreitet. Ein `exp` in der Vergangenheit wird beim Erzeugen abgelehnt (`400`), ein `iat` in der Zukunft (mehr als 5 min Uhrabweichung) macht den Token ungültig.

**Schlüssel:** Ein Schlüssel pro Umgebung (Branch), beim Deploy automatisch in AWS Secrets Manager erzeugt (`polly-web-survey-jwt-<envSuffix>`, 64 Zeichen, `RemovalPolicy.RETAIN`; nur in der lokalen Sandbox setzt Amplify alle Ressourcen auf Löschen). Wird der Stack einer Umgebung gelöscht und neu aufgebaut, bleibt der alte Schlüssel stehen und der Name ist belegt: Der Deploy schlägt dann fehl, bis der alte Schlüssel gelöscht wird (bisherige Links werden damit ungültig). Er verlässt AWS nie: Er steht weder im Repo noch im Frontend oder in Umgebungsvariablen; die Lambdas bekommen nur den ARN und lesen den Wert zur Laufzeit (mit Cache im Container). `kid` = die ersten 8 Zeichen des SHA-256-Hashs des Schlüssels. Die Prüfung akzeptiert `AWSCURRENT` und `AWSPREVIOUS`, eine manuelle Rotation macht bestehende Links also nicht sofort ungültig. Automatische Rotation ist nicht vorgesehen.

### Link-Aufbau

* Enthält die Basis-URL `{token}`, wird der Platzhalter ersetzt, z. B. `https://baseurl.com/{token}` → `https://baseurl.com/<jwt>`.
* Sonst wird `?token=<jwt>` angehängt, bzw. `&token=<jwt>`, wenn die URL schon eine Query enthält.
* Ohne Basis-URL wird `<polly-origin>/s/<jwt>` verwendet.
* Die Polly-Seite versteht `/s/<jwt>` und `?token=<jwt>`.

### Einbindung per iframe

Die Umfrage wird auf der Seite des Betreibers eingebettet. Die Betreiberseite reicht den Token aus ihrer eigenen URL an die iframe-`src` weiter:

```html
<iframe id="polly" title="Umfrage" style="width:100%;border:0" height="600"></iframe>
<script>
  const token = new URLSearchParams(location.search).get("token");
  document.getElementById("polly").src =
    "https://<polly-origin>/s/" + encodeURIComponent(token);

  // optional: Höhe anpassen
  window.addEventListener("message", (e) => {
    if (e.origin === "https://<polly-origin>" && e.data?.type === "polly:height") {
      document.getElementById("polly").height = e.data.height;
    }
  });
</script>
```

Die Umfrageseite darf in iframes eingebettet werden (kein `X-Frame-Options`, `frame-ancestors` nicht eingeschränkt).

## Einladungs-Unterseite (Genesys-App)

Über den Button „Einladungslinks“ in der Umfrage erreicht man eine Unterseite (`/surveys?id=<id>&invite=1`). Der Button ist nur mit `polly_deploy` aktiv.

Eingabefelder: **Anzahl** (1 bis 5000 pro Erzeugung), **Ablaufdatum** (optional, nicht in der Vergangenheit), **mehrfach nutzbar**. Ohne Prod-Stand der Umfrage ist die Erzeugung gesperrt.

Die erzeugten Tokens werden nicht gespeichert; in der Tabelle `InvitationTokens` landen nur bereits benutzte Einmal-Tokens. Das Ergebnis wird als CSV heruntergeladen (UTF-8 mit BOM, Trennzeichen `;`, Escape und Formelschutz wie im Report-Export):

```
Expiration;Multi use;Complete URL
```

## Backend

### Endpunkte

**`POST /api/invitations`** (Genesys-Bearer, Lambda `invitations`)

* Request: `{ "surveyId": "<uuid>", "count": 1..5000, "exp": <epoch-sekunden, optional>, "multi": true|false }`
* Response `200`: `{ "tokens": [{ "jwt": "...", "exp": 1793487599, "multi": true }] }`. Ohne `exp` im Request fehlt `exp` auch in den Tokens. Den Link baut das Frontend.
* Ablauf: Token prüfen (Mandant `APPROVED`) → nur Genesys-User → Body prüfen → Projekt-Tag aus der Zeile `__meta` lesen → Rollen des Aufrufers laden und `polly_deploy` prüfen → Prod-Stand laden → signieren.
* Fehler (Body `{ "code", "message" }`):

| Status | `code` | Bedeutung |
| :--- | :--- | :--- |
| `400` | `invalid_request` | `surveyId` keine UUID, `count` nicht 1..5000, `multi` kein Boolean, `exp` keine Epoch-Sekunden oder nicht in der Zukunft |
| `401` | `unauthorized` | Token ungültig oder Mandant nicht freigegeben |
| `403` | `forbidden_m2m` | Cognito-M2M-Token; die Data Action des Flows hat keine Benutzerrollen, Links erzeugt nur die App-Oberfläche |
| `403` | `missing_role` | Rolle `polly_deploy` fehlt (serverseitig über `/api/v2/users/me?expand=authorization` geprüft, inkl. `projectTag`-Präfix; fehlt dem Token der Scope `authorization:readonly`, gilt der User wie im Frontend als ohne Rolle) |
| `409` | `no_prod` | Umfrage hat keinen Prod-Stand, ist gelöscht oder wird gerade gelöscht |
| `429` | `genesys_error` | Genesys hat gedrosselt |
| `502` | `no_credentials`, `genesys_error` | Keine Backend-Credentials des Mandanten oder Genesys-Fehler |

**`GET /api/web-survey?token=<jwt>`** (öffentlich, Lambda `web_survey`)

* Prüft Signatur, `kid`, `exp`, den Mandanten (`APPROVED` mit Backend-Credentials), bei Einmal-Token den Eintrag in `InvitationTokens` und lädt den Prod-Stand mit den Client Credentials des Mandanten (Zeile `survey_<id>` der Umfrage-Data-Table `surveyDataTableId` aus dem Mandanteneintrag; Mandanten, die vor diesem Feld eingerichtet wurden, nutzen `allowedDataTableIds[0]`, die Reihenfolge des Setups). Liegt ein Lösch-Job für die Umfrage vor, gilt sie als nicht verfügbar.
* Response `200`:
  * `{ "status": "ok", "survey": { … } }` – bereinigtes Flow-JSON (Whitelist, Typ `WebSurvey` in `src/domain/survey/webSurveyTypes.ts`): ohne `name`, `reprompt`, `synonyms` und Zeitstempel; `language` immer gesetzt (Default `de`), `version` immer eine Zahl (ältere Stände ohne Version: `0`).
  * `{ "status": "invalid" | "expired" | "used" | "unavailable" }`
* Weitere Antworten: `429 { "status": "throttled" }` (Drosselung der API oder von Genesys), `502 { "status": "error" }` (Genesys nicht erreichbar).
* Der Prod-Stand wird pro Lambda-Container **30 Sekunden** zwischengespeichert, damit große Kampagnen das Genesys-Rate-Limit des Mandanten nicht ausschöpfen. Ein neuer Prod-Deploy ist deshalb beim Laden der Seite spätestens nach 30 s sichtbar; beim Absenden wird immer frisch gelesen.

**`POST /api/web-survey/submit`** (öffentlich)

* Request: `{ "token": "<jwt>", "surveyVersion": <int>, "answers": { "<questionId>": <wert> } }`
* Prüft den Token erneut und lädt Prod (ohne Cache). Weicht `surveyVersion` von `Prod.version` ab, antwortet es mit `409 { "status": "survey_changed", "survey": { … } }` und liefert die neue Fassung gleich mit; nichts wird gespeichert, der Token bleibt unverbraucht.
* Die Antworten werden gegen das Flow-JSON geprüft (`flowNavigation`): erreichbare Fragen, Pflichtangaben, Wertebereiche (rating min..max, nps 0..10, choice = Label, yes_no = bool, comment höchstens 2000 Zeichen). Bei Verstoß `400`, nichts wird gespeichert.
* Gespeichert werden nur beantwortete, gültige Antworten auf erreichbare Fragen (`pruneFlowAnswers`), im Format der Architect-Sitzungen: Schlüssel ist der technische Fragename, Wert `{ type, value, answeredAt }`.
* Speichern in einer DynamoDB-Transaktion: bei Einmal-Token ein Put in `InvitationTokens` mit `attribute_not_exists`, dazu der Put der Antwort mit `status: "completed"`, `channel: "web"`, `tokenId`, `responseId` = zufällige UUID. Schlägt die Bedingung fehl, antwortet es mit `409 used` – auch bei gleichzeitigem Absenden kann dieselbe Einladung nicht doppelt genutzt werden. Danach werden die Aggregate aktualisiert (ein Fehler dort macht die gespeicherte Antwort nicht ungültig).
* Antworten (immer mit Feld `status`):

| Status | `status` | Bedeutung |
| :--- | :--- | :--- |
| `200` | `ok` | gespeichert |
| `400` | `invalid_request` | Body kein JSON, `token` fehlt, `surveyVersion` keine Ganzzahl, `answers` kein Objekt |
| `400` | `invalid_answers` | Prüfung fehlgeschlagen; `errors: [{ questionId, code }]` mit `code` aus `required`, `invalid_value`, `not_reachable`, `unknown_question` |
| `403` | `invalid`, `expired` | Einladung ungültig bzw. abgelaufen |
| `404` | `unavailable` | kein Prod-Stand, Umfrage gelöscht oder Löschung läuft |
| `409` | `used` | Einmal-Einladung bereits benutzt |
| `409` | `survey_changed` | Prod hat sich geändert, neue Fassung in `survey` |
| `413` | `payload_too_large` | Body über 64 KB |
| `429` | `throttled` | Drosselung durch Genesys; drosselt API Gateway selbst, kommt `429` mit `{ "message": "Too Many Requests" }` ohne `status` |
| `502` | `error` | Genesys nicht erreichbar |

### Tabelle `InvitationTokens`

| Attribut | Bedeutung |
| :--- | :--- |
| `tenantId` (PK) | Mandant |
| `tokenId` (SK) | `token_id` der Einladung |
| `tenantSurveyId` | `${tenantId}#${surveyId}`, Schlüssel des GSI |
| `surveyId` | Umfrage |
| `usedAt` | Zeitpunkt der Nutzung (ISO) |
| `responseId` | Zugehörige Antwort |
| `ttl` | Epoch-Sekunden, Nutzungszeitpunkt + 180 Tage (DynamoDB-TTL) |

GSI `byTenantSurvey` (PK `tenantSurveyId`, SK `usedAt`, `KEYS_ONLY`) für den Lösch-Worker. `PAY_PER_REQUEST`, `RETAIN`.

Das Ablaufdatum der Einladung heißt überall `exp` (JWT-Claim und API), die Löschfrist des Eintrags überall `ttl`.

**Gelöschte Umfragen:** Der Lösch-Worker (`survey_responses_delete`) entfernt auch deren Tokens über den GSI. Danach greift die TTL von 180 Tagen.

### Drosselung

Die Drosselung der HTTP API gilt pro Route für **alle Mandanten zusammen**, nicht pro IP. Sie schützt das Backend vor Überlast, nicht gezielt vor einzelnen Angreifern. Die Grenzwerte sind deshalb großzügig, damit große Kampagnen nicht ausgebremst werden: `GET /web-survey` Rate 200/s, Burst 500; `POST /web-survey/submit` Rate 100/s, Burst 300 (Konstanten in `backend.ts`).

Optional bekommt `web_survey` eine `reservedConcurrentExecutions`, damit eine Flut auf der öffentlichen Seite nicht das Lambda-Kontingent des Kontos aufbraucht und die Data Action des Telefon-Flows (`survey_responses`) ausbremst. Sie wird über die Amplify-Umgebungsvariable `WEB_SURVEY_RESERVED_CONCURRENCY` eingeschaltet (z. B. `50`, wirkt beim nächsten Deploy); ohne Variable oder mit `0` gibt es keine Reservierung. Der Default ist aus, weil AWS verlangt, dass mindestens 100 Ausführungen des Kontos unreserviert bleiben: Auf Konten mit kleinem Kontingent (z. B. neue Konten mit 10) schlüge der Deploy sonst fehl. Für produktive Konten mit Web-Kampagnen sollte sie gesetzt werden. Die Lambda begrenzt selbst die Body-Größe (64 KB) und die Länge von Kommentaren.

Eine Begrenzung pro IP wäre nur mit CloudFront + WAF vor der API möglich (HTTP APIs unterstützen WAF nicht direkt). Das ist eine spätere Option.

## Umfrageseite

Die Seite liest den Token aus `/s/<jwt>` oder `?token=<jwt>` und durchläuft diese Zustände:

`loading` → `invalid` | `expired` | `used` | `unavailable` | `form` → `submitting` → `done` | `error`

| Situation | Meldung |
| :--- | :--- |
| ungültige Signatur, unbekannter Mandant, kein Token | „Einladung ist ungültig“ |
| `exp` überschritten | „Einladung ist abgelaufen“ |
| Einmal-Token bereits benutzt | „Diese Einladung wurde bereits verwendet“ |
| kein Prod-Stand oder Umfrage gelöscht | „Umfrage nicht verfügbar“ |
| Prod hat sich zwischen Laden und Absenden geändert (`409 survey_changed`) | „Die Umfrage wurde zwischenzeitlich aktualisiert. Bitte prüfen Sie Ihre Antworten und senden Sie erneut ab.“ |
| `429` | „Der Dienst ist gerade stark ausgelastet. Bitte versuchen Sie es in einem Moment erneut.“ |

* **Prod ändert sich:** Die Seite lädt die neue Fassung und übernimmt Antworten auf weiterhin vorhandene Fragen (gleiche Frage-ID, Wert noch gültig). Der Token bleibt nutzbar. Ist kein Prod-Stand mehr vorhanden (Rollback ohne Backup, Löschung), erscheint „Umfrage nicht verfügbar“.
* **429:** Die Seite versucht es einmal nach ca. 2 s automatisch erneut, danach erscheint die Meldung mit einem Button „Erneut versuchen“. Alle Antworten bleiben erhalten.
* Meldungen werden per `role="alert"` angesagt.
* Folgefragen erscheinen direkt unter ihrer Elternfrage (`aria-live="polite"`). Fällt eine Folgefrage wieder weg, wird ihre Antwort verworfen.
* Nach dem Absenden zeigt die Seite die Verabschiedung, der Fokus wechselt auf diese Meldung.
* Optional für iframes: `postMessage({ type: "polly:height", height })`.

### Eingabeelemente

| Typ | Darstellung |
| :--- | :--- |
| `rating`, `nps` | Radio-Buttons in `fieldset`/`legend`, Min/Max-Labels an den Skalenenden (`aria-describedby`) |
| `choice` | Radio-Gruppe |
| `yes_no` | Radio-Gruppe Ja/Nein |
| `comment` | `textarea` mit Zeichenzähler (höchstens 2000 Zeichen) |

### Barrierefreiheit (WCAG 2.2 AA)

* semantische Landmarks und eine Überschriften-Hierarchie
* Pflichtfelder visuell und mit `aria-required` markiert
* beim Absenden eine Fehlerübersicht oben, die den Fokus erhält, mit Links zu den Feldern; Fehlertexte an den Feldern per `aria-describedby`
* sichtbarer Fokus, Kontrast mindestens 4.5:1, Zielgrößen mindestens 24×24 px
* volle Tastaturbedienung, kein Zeitlimit
* Umbruch bei 320 px Breite und 400 % Zoom
* `prefers-reduced-motion` wird berücksichtigt

## Hosting

`vite.config.ts` baut zwei Einstiegspunkte (`index.html`, `survey.html`). In den Amplify-Rewrites (Konsole) muss `/s/<*>` auf `/survey.html` (Status 200) zeigen. Die Umfrageseite ruft das Backend wie die App über `API_PREFIX` (`constants/apiConstants.ts`, Default `/api`) auf.
