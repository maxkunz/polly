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
9. **Designs:** Schrift, Textstile pro Textart und Farben der Umfrageseite sind pro Mandant als benannte Designs in DynamoDB gespeichert und werden in der App gepflegt (Einstellungen → Web-Designs, mit Live-Vorschau), ohne Deploy. Ein Design ist Standard; jede Umfrage kann im Editor ein Design wählen (`web_theme_id`). Details: Abschnitt „Designs“.

## Änderungen im Editor

* **Labels bei rating und nps:** Pro Frage gibt es ein optionales Label für den minimalen und den maximalen Wert (`min_label`, `max_label` in `options`, höchstens 100 Zeichen). Sie werden nicht vorgelesen und sind nur im Web (und in der Skalenvorschau des Editors) sichtbar.
* **Basis-URL der Umfrage** (`base_url`): Die Umfrage wird oft in iframes eingebunden, die personalisierten Links müssen auf diese URL zeigen. Optional; wenn gesetzt eine absolute `https://`-URL mit höchstens einem Platzhalter `{token}`.
* **Sprache der Umfrage** (`language`): siehe oben. Neue Umfragen starten mit `de`.
* **Design der Umfrage** (`web_theme_id`, optional): Auswahl „Standard des Mandanten“ (Feld fehlt) oder eines der Designs aus `GET /web-themes`. Ein inzwischen gelöschtes Design bleibt mit Hinweis sichtbar; die Seite zeigt dann das Standard-Design.

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

Die erzeugten Tokens werden nicht gespeichert; in der Tabelle `InvitationTokens` landen nur bereits benutzte Einmal-Tokens. Das Ergebnis wird als CSV heruntergeladen (UTF-8 mit BOM, Trennzeichen `;`, Zeilenende CRLF, Escape und Formelschutz wie im Report-Export, Dateiname `<name>_invitations_<JJJJ-MM-TT>.csv`):

```
Expiration;Multi use;Complete URL
2026-12-31T23:59:59+01:00;false;https://baseurl.com/survey?token=eyJhbGciOi…
;true;https://<polly-origin>/s/eyJhbGciOi…
```

* `Expiration`: ISO 8601 in der lokalen Zeit des Erstellers mit Offset; leer, wenn kein Ablaufdatum gewählt wurde.
* `Multi use`: `true` / `false`.
* `Complete URL`: fertiger Link nach den Regeln aus „Link-Aufbau“. Die Basis-URL stammt aus dem **gespeicherten** Draft (nicht aus Prod, `base_url` steht nicht im Flow-JSON); die Unterseite zeigt sie samt Beispiel-Link an. Fallback-Origin ist der Origin der Polly-App.

Umsetzung: `components/survey/SurveyInvitationView.vue`, Logik in `composables/useSurveyInvitations.ts` und `services/invitationService.ts`, Link-Aufbau und CSV rein in `domain/survey/invitationLinks.ts` (Test `test/invitationLinks.test.ts`). Die Grenzen 1–5000 kommen von dort auch in die Lambda `invitations`.

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
  * Zusätzlich optional `"theme": { … }` (bereinigte Tokens, siehe „Designs“): bei `ok` und `used` das Design der Umfrage (bei `used` aus dem gecachten Prod-Stand; ist er nicht ladbar, das Standard-Design), bei `unavailable` das Standard-Design des Mandanten. So erscheinen auch diese Meldungen im iframe im CI. `invalid`/`expired` haben kein Design. Fehlt ein passendes Design, fehlt das Feld.
* Weitere Antworten: `429 { "status": "throttled" }` (Drosselung der API oder von Genesys), `502 { "status": "error" }` (Genesys nicht erreichbar).
* Der Prod-Stand wird pro Lambda-Container **30 Sekunden** zwischengespeichert, damit große Kampagnen das Genesys-Rate-Limit des Mandanten nicht ausschöpfen. Ein neuer Prod-Deploy ist deshalb beim Laden der Seite spätestens nach 30 s sichtbar; beim Absenden wird immer frisch gelesen.

**`POST /api/web-survey/submit`** (öffentlich)

* Request: `{ "token": "<jwt>", "surveyVersion": <int>, "answers": { "<questionId>": <wert> }, "submissionId": "<uuid>" }`
* `submissionId` (optional, UUID): erzeugt die Seite einmal pro Seitenaufruf und schickt sie bei jeder Wiederholung mit. Sie wird zur `responseId`. Fehlt sie, vergibt die Lambda eine zufällige UUID. **Idempotenz:** Ist unter dieser ID schon eine Antwort mit derselben Einladung gespeichert (bei Einmal-Token: Der verbrauchte Eintrag in `InvitationTokens` verweist auf sie), antwortet die Lambda mit `200 ok`, ohne erneut zu speichern. Eine Absendung, deren Antwort verloren ging (Zeitüberschreitung, Netzabbruch), erzeugt beim erneuten Versuch also weder `409 used` noch eine doppelte Antwort. Geänderte Antworten einer solchen Wiederholung werden nicht übernommen: Gespeichert bleibt die erste Absendung.
* Prüft den Token erneut und lädt Prod (ohne Cache). Weicht `surveyVersion` von `Prod.version` ab, antwortet es mit `409 { "status": "survey_changed", "survey": { … }, "theme": { … } }` und liefert die neue Fassung samt Design (optional) gleich mit; nichts wird gespeichert, der Token bleibt unverbraucht.
* Die Antworten werden gegen das Flow-JSON geprüft (`flowNavigation`): erreichbare Fragen, Pflichtangaben, Wertebereiche (rating min..max, nps 0..10, choice = Label, yes_no = bool, comment höchstens 2000 Zeichen). Bei Verstoß `400`, nichts wird gespeichert.
* Gespeichert werden nur beantwortete, gültige Antworten auf erreichbare Fragen (`pruneFlowAnswers`), im Format der Architect-Sitzungen: Schlüssel ist der technische Fragename, Wert `{ type, value, answeredAt }`.
* Speichern in einer DynamoDB-Transaktion: bei Einmal-Token ein Put in `InvitationTokens` mit `attribute_not_exists`, dazu der Put der Antwort mit `status: "completed"`, `channel: "web"`, `tokenId`, `responseId` = `submissionId` bzw. zufällige UUID. Schlägt eine Bedingung fehl und ist es nicht die eigene, schon gespeicherte Absendung, antwortet es mit `409 used` – auch bei gleichzeitigem Absenden kann dieselbe Einladung nicht doppelt genutzt werden. Bei mehrfach nutzbaren Links bedeutet das eine schon fremd belegte `submissionId` (`400 invalid_request`). Danach werden die Aggregate aktualisiert (ein Fehler dort macht die gespeicherte Antwort nicht ungültig).
* Antworten (immer mit Feld `status`):

| Status | `status` | Bedeutung |
| :--- | :--- | :--- |
| `200` | `ok` | gespeichert (oder mit dieser `submissionId` schon gespeichert) |
| `400` | `invalid_request` | Body kein JSON, `token` fehlt, `surveyVersion` keine Ganzzahl, `answers` kein Objekt, `submissionId` keine UUID oder fremd belegt |
| `400` | `invalid_answers` | Prüfung fehlgeschlagen; `errors: [{ questionId, code }]` mit `code` aus `required`, `invalid_value`, `not_reachable`, `unknown_question` |
| `403` | `invalid`, `expired` | Einladung ungültig bzw. abgelaufen |
| `404` | `unavailable` | kein Prod-Stand, Umfrage gelöscht oder Löschung läuft |
| `409` | `used` | Einmal-Einladung bereits benutzt |
| `409` | `survey_changed` | Prod hat sich geändert, neue Fassung in `survey` |
| `413` | `payload_too_large` | Body über 64 KB |
| `429` | `throttled` | Drosselung durch Genesys; drosselt API Gateway selbst, kommt `429` mit `{ "message": "Too Many Requests" }` ohne `status` |
| `502` | `error` | Genesys nicht erreichbar |

**`GET /api/web-themes`**, **`PUT /api/web-themes/{id}`**, **`DELETE /api/web-themes/{id}`** (Genesys-Bearer, Lambda `web_themes`)

* `GET`: `{ "themes": [{ "id", "name", "isDefault", "tokens", "updatedAt", "updatedBy"? }] }`, nach Name sortiert. Für jeden angemeldeten App-Nutzer (Auswahl im Umfrage-Editor).
* `PUT`: Body `{ "name": "1–60 Zeichen", "isDefault": true|false, "tokens": { … }, "expectedUpdatedAt": "<ISO>"|null }` (höchstens 8 KB), legt an oder ändert. **Optimistisches Sperren:** `expectedUpdatedAt` ist das `updatedAt` des Stands, den der Editor geladen hat; `null` bzw. fehlend bedeutet „neues Design“. Weicht der gespeicherte Stand ab (zwischenzeitlich geändert oder gelöscht, bzw. ID schon vergeben), kommt `409 conflict` und nichts wird gespeichert. Die App lädt dann die Liste neu, behält die Eingaben, und erst ein erneutes Speichern überschreibt den neuen Stand (bzw. legt ein gelöschtes Design neu an). `{id}` ist eine UUID (von der App erzeugt). Die Tokens laufen durch `sanitizeWebThemeTokens`. Mit `isDefault: true` verliert das bisherige Standard-Design die Markierung in derselben Transaktion. Antwort `200 { "theme": { … } }`.
* `DELETE`: `200 { "ok": true }`. Umfragen mit diesem Design fallen auf das Standard-Design zurück.
* Schreiben erfordert serverseitig `polly_deploy` (gleiche Prüfung wie `POST /invitations`, `shared/caller_roles.ts`). `updatedBy` ist der Name des Genesys-Users.
* Fehler (Body `{ "code", "message" }`): `400 invalid_request` (ID keine UUID, Name, Tokens ungültig), `401 unauthorized`, `403 forbidden_m2m` (Schreiben mit Cognito-M2M-Token), `403 missing_role`, `404 not_found` (Löschen eines unbekannten Designs), `409 limit_reached` (mehr als 50 Designs), `409 conflict` (Design zwischenzeitlich geändert oder gelöscht, oder bisheriges Standard-Design gleichzeitig gelöscht), `413 payload_too_large`, `429`/`502 genesys_error`, `502 no_credentials`.

### Tabelle `WebSurveyThemesTable`

| Attribut | Bedeutung |
| :--- | :--- |
| `tenantId` (PK) | Mandant |
| `themeId` (SK) | UUID des Designs |
| `name` | Anzeigename (1–60 Zeichen) |
| `isDefault` | Standard-Design des Mandanten (höchstens eines) |
| `tokens` | Map mit den Tokens (siehe „Designs“) |
| `updatedAt`, `updatedBy` | Letzte Änderung (ISO) und Name des Bearbeiters |

`PAY_PER_REQUEST`, `RETAIN`. Höchstens 50 Designs pro Mandant (prüft die Lambda). `web_survey` liest, `web_themes` liest und schreibt.

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
* **Zeitüberschreitung:** Die Seite wartet 35 s auf eine Antwort, also länger als API Gateway (30 s) und Lambda (20 s). Sie bricht also nicht ab, solange das Backend noch antworten kann. Danach erscheint „Erneut versuchen“; dank `submissionId` speichert die Wiederholung nicht doppelt.
* Meldungen werden per `role="alert"` angesagt.
* Folgefragen erscheinen direkt unter ihrer Elternfrage (`aria-live="polite"`). Fällt eine Folgefrage wieder weg, wird ihre Antwort verworfen.
* Nach dem Absenden zeigt die Seite die Verabschiedung (leer: „Ihre Antworten wurden gespeichert.“), der Fokus wechselt auf diese Meldung.
* Im iframe meldet die Seite ihre Höhe per `postMessage({ type: "polly:height", height })` an die einbettende Seite (Ziel-Origin `*`, die Nachricht enthält nur die Höhe; siehe Snippet oben). Eingehende Nachrichten verarbeitet sie nur im Vorschaumodus (`?preview=1`, siehe „Designs“).
* Angezeigt werden Titel, Begrüßung, Fragetitel, Beschreibung, Optionen und Min/Max-Labels. Die Umfrage-`description` (interne Beschreibung im Editor) wird nicht angezeigt.
* Fehler beim Absenden (Drosselung nach dem automatischen Versuch, Netzwerk, `5xx`) erscheinen als Hinweis über dem Formular mit „Erneut versuchen“; beim Laden als eigene Seite mit demselben Button. Fehler beim Absenden, die die Einladung betreffen (`invalid`, `expired`, `used`, `unavailable`), ersetzen das Formular durch die jeweilige Meldung.
* `400 invalid_answers` (sollte nach der Prüfung auf der Seite nicht vorkommen) wird wie ein Eingabefehler in der Fehlerübersicht angezeigt.

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
* **Designs:** Die Zusicherung gilt für das eingebaute Polly-Design und für Designs **ohne Kontrastwarnung** im Editor. Kontraste unter 4.5:1 (Text) bzw. 3:1 (Rahmen, Fokus) lassen sich speichern; die Verantwortung liegt dann beim Mandanten. Schriftgrößen werden in `rem` gesetzt, Zoom und eine größere Grundschrift der Besucher wirken also weiter.

### Umsetzung

| Datei | Inhalt |
| :--- | :--- |
| `survey.html` | Zweiter Vite-Einstiegspunkt |
| `src/webSurvey/main.ts` | Start ohne Genesys-SDK, Pinia, Router, PrimeVue und `appStore`; Browsersprache bis zum Laden der Umfrage |
| `src/webSurvey/WebSurveyApp.vue` | Zustände, Fehlerübersicht, Hinweise, Fokusführung, Live-Region |
| `src/webSurvey/components/WebQuestion.vue` | Darstellung pro Fragetyp (native Formularelemente) |
| `src/webSurvey/services/webSurveyApi.ts` | `GET /web-survey`, `POST /web-survey/submit` über `API_PREFIX` |
| `src/webSurvey/i18n/` | Eigene feste Texte in `de`/`en`/`fr` (Schema `de.ts`) und ein minimaler Übersetzer; bewusst nicht `src/i18n/` der App, damit das öffentliche Bundle klein bleibt |
| `src/webSurvey/frameHeight.ts` | Höhenmeldung im iframe |
| `src/webSurvey/webSurvey.css` | Styles (Tailwind nur für `src/webSurvey/` und nur für Layout); alle Farben und Schriftwerte über `--ws-*`, eine Klasse pro Textrolle |
| `src/webSurvey/applyTheme.ts` | Setzt die Tokens eines Designs als `--ws-*` am Root (`style.setProperty`) bzw. entfernt sie |
| `src/webSurvey/previewMode.ts`, `previewSurvey.ts` | Vorschaumodus für den Design-Editor der App mit fester Beispielumfrage |
| `src/domain/webTheme/webTheme.ts` | Tokens, Defaults, `sanitizeWebThemeTokens`, `toCssVariables`, Kontrastprüfung, Vorschau-Protokoll (aliasfrei, gemeinsam mit App und Lambdas; Test `test/webTheme.test.ts`) |
| `src/domain/survey/webSurveyPage.ts` | Reine Logik: Token aus der URL, Browsersprache, Prüfung der API-Antworten, einmaliger 429-Wiederholungsversuch, Einrückung der Folgefragen, Skalenwerte (Test `test/webSurveyPage.test.ts`) |

Die Navigation (`flowNavigation`) arbeitet direkt auf dem bereinigten Flow-JSON (`WebSurvey`): Sie braucht weder `name` noch `reprompt` oder `synonyms`.

### Sicherheit

Die Seite ist öffentlich; Zugang hat, wer einen gültigen Link besitzt. Maßnahmen auf der Seite:

* **Keine HTML-Ausgabe von Umfragetexten:** Alle Texte aus der Data Table werden nur als Text gerendert (kein `v-html`), Zeilenumbrüche per CSS.
* **Content-Security-Policy** (vom Build als `<meta>` in `survey.html` eingefügt, siehe `vite.config.ts`): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`. Keine Inline-Skripte oder -Styles, keine fremden Quellen, Aufrufe nur an den eigenen Origin. Der Dev-Server setzt die CSP nicht (HMR braucht Inline-Styles).
* **Token:** Die Seite akzeptiert nur Text in JWT-Form (drei Base64url-Teile, höchstens 2048 Zeichen, dieselbe Grenze wie die Lambda); alles andere ergibt „Einladung ist ungültig“ ohne Backend-Aufruf. Signatur und Ablauf prüft ausschließlich das Backend. Der Token wird nicht gespeichert (kein `localStorage`/Cookie).
* **Kein Abfluss des Tokens über den Referrer:** `<meta name="referrer" content="no-referrer">`, Requests mit `referrerPolicy: "no-referrer"` und ohne Cookies (`credentials: "omit"`).
* **Nicht indexieren:** `<meta name="robots" content="noindex, nofollow">`.
* **Antworten der API werden geprüft**, bevor die Seite sie darstellt (`isWebSurvey`); eine unerwartete Antwort ergibt eine Fehlermeldung statt eines Absturzes. Skalen mit mehr als 101 Werten werden abgelehnt.
* **Kleines Bundle:** Die Seite lädt nur Vue und ihre eigenen Module (kein Genesys-SDK, keine App-Texte, kein `eval`).
* **Einbettung:** Die Seite darf in fremde Seiten eingebettet werden (gewollt, siehe iframe). Ein Angreifer, der sie einbettet, kann nur das tun, was der Linkinhaber ohnehin kann.
* **Designs nur als Tokens:** Ein Design enthält nur Hex-Farben (`#rrggbb`), Zahlen in festen Grenzen und Enum-Schlüssel, nie CSS. `url()`, `@import` oder Selektoren sind damit ausgeschlossen. Dieselbe Whitelist-Prüfung läuft beim Speichern, beim Ausliefern und auf der Seite. Die Seite setzt die Werte über die CSSOM (`style.setProperty`); die CSP bleibt unverändert, Schriftdateien werden nicht geladen.
* **Vorschaumodus** (`?preview=1`): ruft keine API auf und nimmt `postMessage` nur vom eigenen Origin und vom einbettenden Fenster an (`event.origin === location.origin`, `event.source === window.parent`); danach laufen die Tokens durch dieselbe Prüfung. Eine fremde Seite, die `survey.html?preview=1` einbettet, kann also kein Design einspielen.

## Designs

Kunden passen die Umfrageseite an ihre CI an: Schrift, Schriftgrößen getrennt pro Textart, Textfarben, Hintergrund und Akzentfarbe. Gepflegt wird in der App unter **Einstellungen → Web-Designs** (Liste, Standard-Markierung, Anlegen, Duplizieren, Löschen; Bearbeiten nur mit `polly_deploy`, ansehen darf jeder App-Nutzer). Es gibt keine Dateien und keinen Deploy.

**Tokens** (`WebThemeTokens` in `src/domain/webTheme/webTheme.ts`, `schemaVersion: 1`):

* `fontFamily`: `system` (Default), `sans`, `serif`, `humanist`, `rounded` – feste Schrift-Stacks des Systems, keine Webfonts.
* `text`: pro Textrolle `size` (ganze px, Grenzen pro Rolle), `weight` (400/500/600/700), `lineHeight` (1.0–2.0, höchstens zwei Nachkommastellen).

| Rolle | Elemente | Default | Grenzen (px) |
| :--- | :--- | :--- | :--- |
| `heading` | Umfragetitel, Überschrift der Status-/Fehlerseiten | 28 / 700 / 1.25 | 16–48 |
| `subheading` | Überschrift der Fehlerübersicht | 18 / 600 / 1.56 | 14–36 |
| `body` | Begrüßung, Verabschiedung, Meldungen, Grundschrift | 16 / 400 / 1.5 | 12–24 |
| `questionTitle` | Fragetitel | 17 / 600 / 1.5 | 12–32 |
| `description` | Beschreibung der Frage | 16 / 400 / 1.5 | 12–24 |
| `option` | Antwortoptionen, Skalenwerte, Eingabe im Textfeld | 16 / 400 / 1.5 | 12–24 |
| `scaleLabel` | Min-/Max-Labels der Skala | 14 / 400 / 1.5 | 10–20 |
| `hint` | Zeichenzähler, Pflichtfeld-Hinweis | 14 / 400 / 1.43 | 10–20 |
| `error` | Fehlertexte an Feldern | 16 / 600 / 1.5 | 12–24 |
| `button` | Buttons | 16 / 600 / 1.5 | 12–24 |

* `colors` (nur `#rrggbb`): `background` (#f8fafc), `surface` (#ffffff), `text` (#0f172a), `heading` (#0f172a), `textMuted` (#334155), `primary` (#14387f), `onPrimary` (#ffffff), `border` (#64748b), `error` (#b91c1c). Abgeleitete Töne (dunkler/heller Akzent, helle Rahmen) berechnet die CSS mit `color-mix()`; ältere Browser behalten die festen Polly-Töne.
* `transparentBackground`: Seitenhintergrund transparent (für iframes), Karten behalten `surface`.

Fehlende Rollen, Felder oder Farben werden mit den Defaults aufgefüllt (neue Rollen machen gespeicherte Designs nicht ungültig); unbekannte Felder werden verworfen, Werte außerhalb der Grenzen machen das Design ungültig.

**Auf der Seite:** Die Tokens werden zu CSS-Variablen (`--ws-font-family`, `--ws-<rolle>-size/-weight/-line-height`, Farben, `--ws-page-background`). Größen als `rem` (px / 16). Jede Textrolle hat eine eigene Klasse, Schriftgrößen stehen nur dort. Die NPS-Zeile begrenzt die Schrift der Skalenwerte auf die Zeilenbreite (`min(var(--ws-option-size), 8cqi - 2px)`) und bleibt so auch bei großer Optionsschrift einzeilig. **Bewusste Einschränkung:** Diese Grenze gilt auch, wenn Besucher nur die Grundschrift des Browsers vergrößern (ohne Zoom); die NPS-Werte wachsen dann ab rund 17 px (bei 320 px Breite) nicht mehr mit. Browser-Zoom wirkt voll (WCAG 1.4.4 ist über Zoom erfüllt). Ein Umbruch der NPS-Zeile wäre die Alternative, widerspricht aber der Vorgabe „NPS immer einzeilig“. Ohne Design (oder bei ungültigem Design) gilt das eingebaute Polly-Design; ein ungültiges Design ist kein Fehler.

**Auswahl (Fallback-Kette):** `web_theme_id` der Umfrage (aus dem Prod-Stand) → Standard-Design des Mandanten → eingebautes Polly-Design. Ein **Wechsel** des Designs wirkt wie jede Umfrageänderung erst nach dem Deploy nach Prod. **Inhaltliche Änderungen** an einem Design wirken ohne Deploy auf alle Umfragen, die es nutzen.

**Cache:** `web_survey` lädt alle Designs des Mandanten mit einer Query (parallel zum Prod-Stand) und hält sie 30 Sekunden pro Lambda-Container. Fehler beim Laden der Designs sind nicht fatal, die Seite erscheint dann im Polly-Design.

**Kontrast:** Der Editor prüft nach WCAG (relative Luminanz): 4.5:1 für `text`/`background`, `text`/`surface`, `heading`/`surface`, `textMuted`/`surface`, `primary`/`surface` (Links), `onPrimary`/`primary` (Button) und `error`/`surface`; 3:1 für `border`/`surface` und den Fokus (`primary`/`background`). Unterschreitungen erzeugen nur eine Warnung mit Verhältnis, gespeichert werden kann trotzdem (siehe Barrierefreiheit).

**Vorschau-Protokoll:** Der Editor bettet `survey.html?preview=1&lang=<de|en|fr>` (gleicher Origin) als iframe ein. Die Seite zeigt eine feste Beispielumfrage (alle Fragetypen, eine Folgefrage, Min/Max-Labels, ein Pflichtfehler mit Fehlerübersicht, ein Hinweis), ruft keine API auf, Absenden ist ohne Wirkung. Nachrichten:

| Richtung | Nachricht | Bedeutung |
| :--- | :--- | :--- |
| Seite → App | `{ type: "polly:preview-ready" }` | Seite nimmt Nachrichten an; die App schickt das Design |
| App → Seite | `{ type: "polly:theme", tokens }` | Design anwenden |
| App → Seite | `{ type: "polly:highlight", role }` | Elemente einer Textrolle markieren (`null` = keine), solange die Zeile im Editor aktiv ist |
| Seite → App | `{ type: "polly:height", height }` | Höhe des Inhalts (wie bei der normalen Einbettung) |

## Hosting

`vite.config.ts` baut zwei Einstiegspunkte (`index.html`, `survey.html`). Die Umfrageseite ruft das Backend wie die App über `API_PREFIX` (`constants/apiConstants.ts`, Default `/api`) auf.

**Rewrite-Regel** (Amplify-Konsole → Hosting → Rewrites and redirects; gilt app-weit, für alle Branches):

```json
{
  "source": "/s/<*>",
  "status": "200",
  "target": "/survey.html"
}
```

* Sie muss **vor** der SPA-Regel stehen, die alle Pfade auf `/index.html` umleitet: Ein JWT enthält Punkte, die übliche SPA-Regel (Regex auf Dateiendungen) würde `/s/<jwt>` sonst auf die Genesys-App umleiten. Die `/api…`-Regeln stehen weiterhin davor.
* `/survey.html?token=<jwt>` funktioniert auch ohne Regel.
* Amplify setzt standardmäßig weder `X-Frame-Options` noch `frame-ancestors`; die Einbettung in iframes funktioniert also ohne weitere Einstellung. Werden in Amplify eigene Header gesetzt (Custom headers), dürfen sie für `/survey.html` und `/s/**` kein `X-Frame-Options` bzw. kein einschränkendes `frame-ancestors` enthalten. Empfohlen sind dort `X-Content-Type-Options: nosniff` und `Referrer-Policy: no-referrer`.

**Lokal:** `npm run dev` bzw. `npm run preview` schreiben `/s/<jwt>` wie die Rewrite-Regel auf `survey.html` um (Plugin in `vite.config.ts`). Die Seite ruft das Backend dabei über den Dev-Proxy auf (`API_PREFIX`, also `/api` bzw. das Präfix aus `VITE_API_PREFIX`).
