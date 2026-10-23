# Implementierungsplan: Kunden-API (`/ext/v1`)

Kunden bekommen eine eigene, versionierte API für Reporting-Daten, Einladungstokens und Umfragedetails. Anmeldung über OAuth 2.0 Client Credentials (Cognito). Vorbild für die Bedienung ist die ORA-/KeepTrack-Reporting-API (Version 1.1).

**Arbeitsweise:** Jeder Meilenstein ist so geschnitten, dass er in einer eigenen Session umgesetzt werden kann.
- Zu Beginn diese Datei lesen und den nächsten offenen Meilenstein nehmen.
- Nach Abschluss die Punkte abhaken, das Datum eintragen und Abweichungen unter „Abweichungen vom Plan“ beim jeweiligen Meilenstein notieren.
- Nach jedem Meilenstein müssen `npm test` und `npx vue-tsc --noEmit` grün sein.

## Fortschritt

- [x] **M1 Gemeinsame Bausteine herauslösen (ohne Verhaltensänderung)** (erledigt 2026-10-23)
  - [x] `amplify/functions/shared/answer_records.ts` mit `ExportSession`/`ExportAnswer`, `DEFAULT_CHANNEL` und `sessionToAnswerRecords`. `survey_responses_export/csv.ts` baut seine Zeilen daraus und exportiert die Typen erneut.
  - [x] `amplify/functions/shared/survey_sessions.ts` mit `iterateSessions`, aus dem Export-Handler verschoben. Liest zusätzlich `surveyId` und `startedAt`.
  - [x] `verifyCognitoJwt` und `loadTenantByTenantId` aus `tenant_auth.ts` exportieren.
  - [x] `test/surveyResponsesExport.test.ts` ist unverändert grün, die CSV-Ausgabe hat sich nicht geändert.
  - Kein Deploy nötig.

- [x] **M2 Basis: API-Clients, Scopes, Anmeldung, Admin-Routen** (siehe „Gemeinsame Basis“) (erledigt 2026-10-23)
  - [x] `backend.ts`: `ApiClientsTable` mit GSI `byTenantId` und `PollyApiResourceServer` (`polly-api`) mit allen drei Scopes.
  - [x] `amplify/functions/shared/api_client_auth.ts` mit `resolveApiClient(event, requiredScope)`.
  - [x] Admin-Routen `/onboarding/api-clients/{create,list,delete}` in der `onboarding`-Lambda, dazu die Rechte und Umgebungsvariablen in `backend.ts`.
  - [x] `deleteTenantRoute`/`wipeAllRoute` räumen die API-Clients des Mandanten mit ab.
  - [x] `test/customerApi.test.ts` anlegen (Prüfung der Scopes) und ins `test`-Script aufnehmen.
  - [x] Doku: `documentation/polly_customer_api.md` anlegen mit Abschnitt Anmeldung, Token-Abruf und Versionierung. `documentation/betrieb_api_zugaenge.md` anlegen (siehe „Doku für das Betriebsteam“).
  - [x] `CLAUDE.md`: Kunden-API, `ApiClientsTable`, Verweis auf diesen Plan und die neue Testdatei.
  - Testbar nach dem Deploy: Client per Admin-Route anlegen, Token an der `tokenUrl` holen. Der Client wird von bestehenden Routen wie `/survey-responses/aggregates` abgelehnt.

- [x] **M3 API 1: Reporting `GET /ext/v1/reporting/data`** (siehe „API 1“) (erledigt 2026-10-23)
  - [x] `amplify/functions/reporting_api/`: `resource.ts`, `pagination.ts`, `v1.ts` und `handler.ts` mit Routing-Tabelle.
  - [x] `backend.ts`: Lambda, Rechte, Route und Drosselung.
  - [x] Tests: Parameter, Seiten, feste Feldliste von `toV1Record`, `sessionToAnswerRecords`.
  - [x] Doku: Abschnitt API 1 in `polly_customer_api.md`, Verweis in `survey_responses_api.md`.
  - Testbar nach dem Deploy: `/data` liefert dieselben Antworten wie der CSV-Export derselben Umfrage und desselben Zeitraums. Fehlerfälle 400/401/403.

- [x] **M4 API 2: Einladungen `POST /ext/v1/invitations`** (siehe „API 2“) (erledigt 2026-10-23)
  - [x] `loadFlowSurvey` gibt `baseUrl` aus dem Draft mit zurück.
  - [x] `signInvitations` aus `invitations/handler.ts` auslagern. Die App-Routen bleiben unverändert.
  - [x] `amplify/functions/invitations/ext_v1.ts` und die Routing-Tabelle im Handler.
  - [x] `backend.ts`: `WEB_SURVEY_ORIGIN`, Rechte, Route und Drosselung.
  - [x] Tests: Request-Prüfung, Linkaufbau, feste Feldliste von `toV1InviteUrl`, Antwortgröße bei 5000 Einträgen.
  - [x] Doku: Abschnitt API 2 in `polly_customer_api.md`; `WEB_SURVEY_ORIGIN` in `branch_umgebung_einrichten.md` und `betrieb_api_zugaenge.md`; Verweis in `polly_web.md`.
  - Testbar nach dem Deploy: Links erzeugen, `fullLink` im Browser öffnen, `base_url`- und Fallback-Fall prüfen, Einmal-Link nur einmal nutzbar.

- [x] **M5 API 3: Umfragedetails `GET /ext/v1/surveys` und `/ext/v1/surveys/{surveyId}`** (siehe „API 3“) (erledigt 2026-10-23)
  - [x] `listProdSurveys` in `genesys_survey_check.ts`; Laden der Designs nach `shared/web_themes.ts`, falls es noch im `web_survey`-Handler steht.
  - [x] `amplify/functions/surveys_api/`: `resource.ts`, `v1.ts`, `handler.ts` und Cache für 60 s.
  - [x] `backend.ts`: Lambda, Rechte, Routen und Drosselung.
  - [x] Tests: v1-Abbildung für alle fünf Fragetypen, Filter der Platzhalter-Bedingungen, Synonyme, Liste.
  - [x] Doku: Abschnitt API 3 in `polly_customer_api.md`, Grenze „keine Versionsgeschichte“.
  - Testbar nach dem Deploy: Liste enthält nur Umfragen mit Prod. `questionId` aus den Details passt zum Reporting. 404 ohne Prod.

- [ ] **M6 Ende-zu-Ende-Test und Abschluss** (Code und Doku fertig 2026-10-23, offen ist nur der Lauf gegen eine Branch-Umgebung)
  - [x] `tools/api_tests.py`: `tests_customer_api` mit allen drei APIs und den Fehlerfällen (siehe „Tests“).
  - [ ] Prüfung nach „Prüfung“ in einer Branch-Umgebung vollständig durchlaufen (braucht Deploy und Zugangsdaten, nicht in der Sandbox möglich).
  - [x] Doku abschließend geprüft: `polly_customer_api.md` (auch der Entwicklerabschnitt „So entsteht eine v2“), `betrieb_api_zugaenge.md` und `CLAUDE.md`.

## Abweichungen vom Plan

Hier pro Meilenstein eintragen, was anders umgesetzt wurde als geplant, und warum. Außerdem was nach dem Meilenstein neu testbar ist, falls das vom Plan abweicht.

### M1
- `ExportSession` hat zusätzlich `surveyId` und `startedAt`; `sessionToAnswerRecords` liefert schon den vollständigen `AnswerRecord` (inkl. `conversationId` = `responseId` bei Kanal `flow`, sonst `null`), damit M3 nichts mehr umbauen muss.
- `iterateSessions` nimmt den Typ `SessionQueryParams` (in `survey_sessions.ts`); Seitengröße `SESSION_PAGE_SIZE` und DynamoDB-Client kommen von dort, der Export-Handler nutzt beide auch für die Vorschau.

### M2
- Resource-Server-Kennung und Scopes stehen als Konstanten in `amplify/functions/shared/api_scopes.ts` (rein, ohne AWS-SDK). `backend.ts` legt den Resource Server daraus an, `onboarding` und `api_client_auth.ts` nutzen dieselben Werte. Die Umgebungsvariable `API_RESOURCE_SERVER` entfällt, so können Resource Server und Prüfung nicht auseinanderlaufen.
- `resolveApiClient(event, requiredScope)` erwartet den vollen Scope (Typ `ApiFullScope`, z. B. `"polly-api/reporting.read"`) und liefert `{ ok: true, tenantId, clientId }` oder `{ ok: false, statusCode: 401 | 403, error, message }`. Die Schritte 2–4 liegen in `authorizeApiClient(claims, scope, deps)` mit austauschbaren Datenzugriffen; die Tests prüfen damit auch die Reihenfolge der Prüfungen, nicht nur die Scopes.
- Fehlerformat der Kunden-API festgelegt: `{ error, message }` mit den Codes `invalid_token` (401), `insufficient_scope` / `access_denied` (403), `not_found` (404) und `internal_error` (500), siehe `polly_customer_api.md`. M3–M5 verwenden es ebenso (z. B. `no_prod` bei M4).
- `create`: `label` ist Pflicht (max. 100 Zeichen); die Antwort enthält zusätzlich `tenantId` und `label`; Mandant nicht `APPROVED` ergibt `409`. Scheitert der Tabelleneintrag, wird der Cognito-Client wieder gelöscht.
- `delete` löscht nur Clients, die in `ApiClientsTable` stehen (`404` sonst), damit keine `backendClientId` der Data Action versehentlich gelöscht wird. Ablauf in drei wiederholbaren Schritten: Status `DELETING` (sperrt sofort) → Cognito-Client → Eintrag.
- `deleteTenantRoute` bricht bei einem Fehler beim Aufräumen der API-Clients nicht ab (der Mandant ist dann schon gelöscht, die Clients damit gesperrt) und meldet `deletedApiClients`, `failedApiClientIds` bzw. `apiClientsError`; ein fehlgeschlagener Client hält die übrigen nicht auf. Ob noch ein Eintrag mit der `tenantId` übrig ist, prüft der GSI `byTenantId` ohne die gerade gelöschten Einträge (GSI-Lesen ist nur eventually consistent). `wipeAllRoute` räumt nach dem Scan auf. `loadApiClient` liest mit `ConsistentRead`, damit Sperren sofort wirkt. Hinweis: `/onboarding/wipeAll` hat wie bisher keine Route in `backend.ts`.
- Test „Routing-Tabelle, unbekannte Routen ergeben 404“ kommt mit M3, weil es in M2 noch keinen `/ext`-Handler gibt.

### M3
- Neuer Fehlercode `invalid_request` (400) für ungültige Parameter, `range_too_large` (413) bei mehr als `MAX_SESSIONS` = 10.000 Sitzungen im Zeitraum. Beide stehen in `polly_customer_api.md`.
- `compareAnswerRecords` (Sortierung) liegt in `shared/answer_records.ts` statt in `reporting_api`, weil sie zum internen Modell gehört.
- `paginate` liefert `{ items, pageInfo }`; die Felder des `pagination`-Objekts legt `buildV1DataResponse` in `v1.ts` fest.
- `page` und `limit` werden strikt geprüft (positive Ganzzahl, sonst 400); nur `limit` über 1000 wird begrenzt. Leere Werte zählen als nicht angegeben.
- Der Test „Routing-Tabelle, unbekannte Routen ergeben 404“ aus M2 ist jetzt für den Reporting-Handler enthalten (dazu ein Test für 401 ohne Token).
- Datumsprüfung: Die geparste Zeit wird zurück formatiert und muss dem Text entsprechen, weil `Date.parse` unmögliche Daten weiterrollt (31.02. → 03.03., `24:00:00` → nächster Tag).
- Die Reporting-Lambda bekommt über `attachApiClientAuth` nur Tenants-Tabelle und Cognito-Werte, keinen Zugriff auf die Genesys-Secrets der Mandanten (`attachTenantAuth` baut darauf auf).
- Neuer Fehlercode `page_too_large` (413), außerdem `range_too_large` bei erschöpftem Zeitbudget.
- Nicht per Test geprüft: der Abfrageteil mit DynamoDB (`iterateSessions`), das ist unverändert aus dem CSV-Export.

### M4
- `signInvitations` bleibt in `invitations/handler.ts` (nicht in eine eigene Datei ausgelagert); es liefert `{ tokens, kid }`, das Protokoll schreiben die beiden Aufrufer.
- `loadFlowSurvey` liest `baseUrl` nur mit Option `withBaseUrl` (nur die Kunden-API; `web_survey` und die Vorschau parsen den Draft nicht). Geliefert wird es nur, wenn `Draft.base_url` gesetzt ist und `baseUrlError` (aus `invitationLinks.ts`, gemeinsam mit dem Editor-Validator) nichts meldet; ungültige Werte werden protokolliert und ignoriert, ein unlesbarer Draft ergibt ebenfalls kein `baseUrl` (dann gilt der Fallback). Grund: Der Draft wird ohne Deploy gespeichert.
- `base_url` ist auf `BASE_URL_MAX_CHARS` (200) begrenzt, damit 5000 Links unter dem Lambda-Limit bleiben; zusätzlich prüft der Handler die Antwortgröße (`413 response_too_large`).
- `survey_uuid` wird kleingeschrieben. Die Regeln für Umfrage-ID, Anzahl, `multi` und `exp` liegen gemeinsam für App und v1 in `checkInvitationFields` (`request.ts`), `ext_v1.ts` bildet nur die Felder ab und liefert die v1-Feldnamen für die Meldungen.
- Der Handler erkennt Kunden-Routen nur am `routeKey` (`/ext/…`) und prüft sie vor `resolveTenantContext`; alle anderen Pfade laufen unverändert. Fehlerformat dort `{ error, message }` (App-Routen weiter `{ code, message }`). Fehlerformat und Routing-Tabelle kommen aus `shared/ext_http.ts` (`extError`, `dispatchExtRoute`), gemeinsam mit `reporting_api` und für M5.
- `resolveApiClient` liefert den geladenen Mandanteneintrag mit (`tenant`), `loadTenantCredentials` übernimmt ihn ohne zweiten DynamoDB-Zugriff.
- Fehlercodes: `payload_too_large` (413), `response_too_large` (413), `genesys_error` (429 bei Drosselung durch Genesys, 502 bei Fehler oder fehlenden Credentials), `no_prod` (409, ohne `reason`).
- `expiration_date` in der Antwort wird aus `exp` (UTC-Tag) abgeleitet, nicht aus dem Request durchgereicht.
- `WEB_SURVEY_ORIGIN` wird in `backend.ts` immer gesetzt (Variable oder abgeleitet), die Lambda liest nur `process.env`.
- Antwortgröße: 5000 Einträge mit Basis-URL in voller Länge (200 Zeichen) bleiben unter 5,5 MB (JWT ca. 372 Zeichen), Test dazu in `customerApi.test.ts`.
- Nicht per Test geprüft: der Ablauf mit Genesys/DynamoDB (`loadProdSurvey`, Rechte), das braucht den Deploy.

### M5
- Das Laden der Designs (`loadTenantThemesCached`) liegt nicht in `shared/web_themes.ts`, sondern in `shared/web_themes_table.ts`: Dort stehen schon die DynamoDB-Zugriffe, `web_themes.ts` bleibt ohne AWS-SDK testbar. Die Tabelle kommt aus `WEB_THEMES_TABLE_NAME`; `web_survey` nutzt dieselbe Funktion (Cache 30 s, Verhalten unverändert).
- `listProdSurveys` liest 25 Zeilen pro Seite (höchstens 80 Seiten, bei mehr Zeilen oder fehlendem `pageCount` Fehler statt stillem Abschneiden). Vor jeder Seite prüft es das Zeitbudget der Lambda (`canContinue`, Reserve 8 s), sonst 502 statt Abbruch durch das API Gateway. Genesys blättert über den Offset, doppelte Zeilen werden deshalb nach ID entfernt (sonst scheitert der BatchGet). Die Prüfung auf laufende Löschungen läuft als BatchGet über neu `findSurveysBeingDeleted` in `survey_results.ts` (unverarbeitete Schlüssel mit exponentiellem Backoff); `isSurveyBeingDeleted` nutzt dieselbe Statusregel.
- Der Cache hält die fertigen Antworten (200 und 404) pro Mandant 60 s; Fehler (429, 502) werden nicht gemerkt. Die Designs haben zusätzlich den 30-s-Cache aus `web_survey`, ein Design wirkt in der Kunden-API deshalb nach höchstens ca. 90 s.
- Fehlercode für Umfragen ohne Prod-Stand: `not_found` (404), für ungültige `surveyId` im Pfad `invalid_request` (400), bei Genesys-Fehlern `genesys_error` (429/502) wie bei den Einladungen. Die `surveyId` im Pfad wird kleingeschrieben.
- Die Platzhalter-Bedingung wird nur gefiltert, wenn Wert **und** fehlende Folgefrage zum Operator passen (`equals` -1, `less_than` -1000, `greater_than` 1000, gemeinsame Konstante `CONDITION_PLACEHOLDER_VALUES` in `flowTypes.ts`, auch vom Translator genutzt). Fehlende Labels der Skalen sind `null`, fehlende `baseUrl`/`webTheme` ebenfalls.
- Die Liste ist nach Titel und ID sortiert (Code Units), damit die Reihenfolge stabil bleibt.
- Der Test der Liste ersetzt `fetch` und prüft `listProdSurveys` mit Seiten, Sonderzeilen, ungültigen Zellen und Fehlern. Nicht per Test geprüft: der Handler-Ablauf mit Cognito/DynamoDB/Genesys (braucht den Deploy).

### M6
- `tests_customer_api` hat die Fälle [C1]–[C21] und läuft nach den Antworttests (braucht deren Session) und nur mit `GENESYS_TOKEN`. Ohne `API_CLIENT_ID`, `API_CLIENT_SECRET` und `API_TOKEN_URL` werden sie übersprungen.
- Einen zweiten Client für den Fall „Scope fehlt“ braucht der Lauf nicht: [C2] holt vom selben Client ein Token mit `scope=polly-api/reporting.read`, damit sind Einladungen und Umfragedetails dafür 403.
- Zusätzlich geprüft: Kunden-Token an einer App-Route wird abgelehnt ([C21]), `fullLink` des erzeugten Tokens wird von `GET /web-survey` akzeptiert ([C9]), `questionId` aus dem Reporting kommen in den Umfragedetails vor ([C14b]). Verglichen werden nur Antworten mit `surveyName` und `surveyVersion` des Prod-Stands, weil [1]–[5] feste Fragennamen von `--survey-name` schreiben, die zu einer anderen `--survey-id` nicht passen; ohne solche Antworten im Zeitraum wird [C14b] übersprungen. Mit `--datatable-id` liest `load_prod_questions` ([S1]/[S2]) Name, Version und Fragen aus der Spalte `Prod` der Umfragezeile in Genesys, die Antworttests [1]–[5] nutzen dann die echten Fragen (Fehler [S2], wenn nicht deployt); dann findet [C14b] immer passende Antworten.
- Nicht geprüft werden die Sperre eines gelöschten Clients mit noch gültigem Token und der `backend/invoke`-Client (Prüfung 2.7 per Hand), weil das Skript dafür den Admin-Token bräuchte. Ebenso nicht: Vergleich mit dem CSV-Export und das Öffnen von `fullLink` im Browser (Prüfung 2.3/2.4).
- Der Python-Lauf selbst ist nicht gegen eine echte Umgebung gelaufen, nur Syntax geprüft.

---

## Kontext und Entscheidungen

Kunden sollen drei Dinge maschinell erledigen können:
1. **Ergebnisse abrufen**, also dieselben Daten wie im CSV-Export. Die Bedienung lehnt sich an die ORA-API an: `GET …/data` mit `from`/`to` (UTC, ohne `Z`, max. 24 h), `page`/`limit` und demselben `pagination`-Objekt.
2. **Einladungstokens für den Web-Kanal erzeugen**, so wie es die App auf der Einladungs-Unterseite über `POST /invitations` tut, aber ohne Genesys-Login. Die Antwort enthält fertige Links.
3. **Umfragedetails lesen** (Fragetexte, Optionen, Skalen), um die Reporting-Daten auszuwerten und die Umfragen z. B. im CMS darzustellen.

Abgestimmte Entscheidungen:
- Die API-Clients legt das **Betriebsteam** über Admin-Routen mit Admin-Token an, keine Selbstbedienung in der App.
- **Kein `/reports`**, das ist ORA-spezifisch.
- Beim Reporting ist **`surveyId` Pflicht**. Es gibt keine Abfrage über alle Umfragen, deshalb reicht der vorhandene GSI `byTenantSurvey`.
- Die Reporting- und Umfragedetail-Felder sind in **camelCase**. Die Einladungs-API verwendet die vorgegebenen Feldnamen (`survey_uuid`, `amount`, `is_multi`, `expiration_date`, `inviteUrls`, …).
- Die Routen kommen an die **bestehende App-HttpApi** unter dem Präfix **`/ext/v1/…`**. So sind Kunden- und App-Routen klar getrennt. Aufruf über `https://<app-domain>/api/ext/v1/…`, das Präfix `/api` kann je Branch anders sein (`VITE_API_PREFIX`). Gegenüber dem Kunden ist das Präfix Teil von `[API_URL]` (z. B. `https://<app-domain>/api/ext/v1/reporting` + `/data`), so wie bei ORA.
- Der Mandant wird **nicht aus dem Scope** gelesen. Bei ORA steht der Mandant im Scope (`<prefix>/<tenant>/read`). In Polly regeln fachliche Scopes die Berechtigung, den Mandanten findet die Lambda über die `client_id` in `ApiClientsTable`. Dadurch braucht es keine Scopes pro Mandant; Cognito erlaubt höchstens 100 pro Resource Server.
- Umfragedetails: **nur der Prod-Stand**, mit Auswertungs-, Web-/CMS- und Telefonfeldern sowie dem Web-Design. **Keine Versionsgeschichte**, eine Speicherung pro Version wäre eine spätere Erweiterung.
- Eine **v2 lässt sich ohne Eingriff in v1** neben v1 bauen (siehe „Versionierung“).

## Versionierung

**Kern ohne Version.** Diese Teile gelten für alle Versionen:
- Anmeldung `resolveApiClient`
- Lesen der Sitzungen `iterateSessions`
- internes Modell `sessionToAnswerRecords`
- Signieren `signInvitations`
- Linkaufbau `buildInvitationUrl`
- Laden der Umfragen `loadProdSurvey` und `listProdSurveys`

Diese Teile liegen in `amplify/functions/shared/` bzw. sind dort schon vorhanden und kennen weder Pfade noch Feldnamen der Kunden-API.

**Versionsschicht pro Version.** Eine Datei pro API und Version, z. B. `reporting_api/v1.ts`, `invitations/ext_v1.ts` und `surveys_api/v1.ts`. Sie enthält nur:
- die Prüfung des Requests (Parameter bzw. Body auf das interne Modell abbilden, Fehlermeldungen)
- die **feste Abbildung** auf die Antwort: v1 gibt seine Felder ausdrücklich einzeln aus (`toV1Record`, `toV1InviteUrl`, `toV1SurveyDetail` …) und reicht nie das interne Modell durch. So landen neue interne Felder nicht ungewollt in v1.

Eine v2 bekommt eigene Dateien daneben, v1 bleibt dabei unverändert.

**Routing über eine Tabelle.** Jeder Handler hat eine Tabelle `routeKey → Funktion`, z. B. `"GET /ext/v1/reporting/data": v1.data`. Eine v2 braucht nur einen neuen Eintrag und eine neue Route in `backend.ts`. Unbekannte Routen ergeben 404.

**Scopes und Clients ohne Version.** Die Scopes gelten für alle Versionen. Bestehende Clients funktionieren mit einer v2, ohne dass das Betriebsteam sie neu anlegt.

**Regel für eine neue Version** (steht auch in der Kunden-Doku):
- Kunden müssen zusätzliche Felder in Antworten tolerieren, wie im ORA-PDF. Neue Felder und neue optionale Parameter brauchen deshalb keine neue Version.
- Eine v2 ist nur nötig, wenn Felder umbenannt oder entfernt werden, sich Typ oder Bedeutung ändern oder Pflichtparameter dazukommen.
- Eine alte Version läuft nach Erscheinen der neuen noch eine Übergangszeit weiter (Dauer wird mit dem Kunden vereinbart) und wird dann entfernt.

**Tests pro Version.** Die Tests von v1 halten Request und Antwort fest (feste Feldliste). Sie bleiben bestehen, wenn es eine v2 gibt, und schlagen fehl, sobald eine Änderung am Kern v1 unbeabsichtigt verändert.

## Gemeinsame Basis: Clients und Anmeldung

### Scopes (Resource Server `polly-api`)
| Scope | Route |
|---|---|
| `polly-api/reporting.read` | `GET /ext/v1/reporting/data` |
| `polly-api/invitations.write` | `POST /ext/v1/invitations` |
| `polly-api/surveys.read` | `GET /ext/v1/surveys`, `GET /ext/v1/surveys/{surveyId}` |

### `amplify/functions/shared/api_client_auth.ts` (neu)
`resolveApiClient(event, requiredScope)` prüft in dieser Reihenfolge:
1. Bearer-Token mit `verifyCognitoJwt` prüfen. Ungültig führt zu **401**.
2. Prüfen, ob `claims.scope` den geforderten Scope enthält. Fehlt er, gibt es **403**. Damit wird auch der `backend/invoke`-Client der Data Action abgelehnt.
3. `client_id` in `ApiClientsTable` nachschlagen. Unbekannt oder nicht `ACTIVE` führt zu **403**. Das ist zugleich die Sperre, denn ausgestellte JWTs bleiben nach dem Löschen eines Cognito-Clients bis zum Ablauf gültig.
4. Mit `loadTenantByTenantId` prüfen, ob der Mandant `APPROVED` ist. Wenn nicht, gibt es **403**, nach einem Uninstall ist der Zugriff also automatisch gesperrt.
5. Rückgabe `{ tenantId, clientId }`.

Die reinen Teile (Scopes zerlegen und prüfen) bekommen eigene Funktionen für Tests. Bestehende Routen weisen API-Clients schon heute ab, weil `loadTenantContextFromCognito` sie in der Tenants-Tabelle nicht findet.

### Clients verwalten (Admin, `onboarding`-Lambda)
Grundlage sind `requireAdmin` (Header `x-admin-token`) und der vorhandene Cognito-Client in `amplify/functions/onboarding/handler.ts`.
- `POST /onboarding/api-clients/create` `{ tenantId, label, scopes: ["reporting.read", "invitations.write", "surveys.read"] }`:
  - Bricht ab, wenn der Mandant nicht `APPROVED` ist.
  - Erlaubt nur Scopes aus der Konstante `API_SCOPES`.
  - Legt mit `CreateUserPoolClientCommand` einen Client an: `client_credentials`, `GenerateSecret`, `AccessTokenValidity` 60 min, Name `polly-api-<tenantId>`.
  - Schreibt einen Eintrag in `ApiClientsTable` mit `clientId`, `tenantId`, `scopes`, `label`, `status: ACTIVE` und `createdAt`.
  - Liefert **einmalig** `clientId`, `clientSecret`, `tokenUrl` und `scope`.
- `POST /onboarding/api-clients/list` `{ tenantId }` liefert die Clients ohne Secret.
- `POST /onboarding/api-clients/delete` `{ clientId }` löscht den Cognito-Client (`ResourceNotFound` wird toleriert) und den Tabelleneintrag.
- `deleteTenantRoute` und `wipeAllRoute` löschen zusätzlich die API-Clients des Mandanten, sofern danach kein weiterer Tenants-Eintrag mit derselben `tenantId` übrig bleibt.

## API 1: `GET /ext/v1/reporting/data`

| Parameter | Pflicht | Format / Default | Hinweis |
|---|---|---|---|
| `surveyId` | ja | UUID (`isValidSurveyId`) | |
| `from` | ja | `YYYY-MM-DDTHH:mm:ss` (UTC, ohne `Z`) | inklusiv, bezogen auf den Sitzungsstart (wie im CSV) |
| `to` | ja | wie `from` | exklusiv; muss nach `from` liegen; `to − from` ≤ 24 h |
| `version` | nein | Ganzzahl | |
| `page` | nein | positive Ganzzahl / 1 | |
| `limit` | nein | positive Ganzzahl / 1000 | über 1000 wird auf 1000 begrenzt |

**Antwort `200`:** `{ data: AnswerRecord[], pagination: { page, limit, total, totalPages, hasPreviousPage, hasNextPage } }`. Ein Datensatz entspricht einer Antwort, also einer CSV-Zeile.

**`AnswerRecord`:**
- Felder: `responseId`, `conversationId` (gesetzt bei `flow`, `null` bei `web`), `surveyId`, `surveyName`, `surveyVersion`, `questionId`, `questionType`, `answeredAt`, `value`, `status`, `channel` (Default `flow`), `sessionStartedAt`.
- `value` behält seinen Typ, es gibt keinen Formelschutz.
- Sortierung im Speicher nach `sessionStartedAt`, `responseId`, `answeredAt`, `questionId`, weil der GSI bei gleichen Schlüsseln keine feste Reihenfolge garantiert.
- `page` hinter der letzten Seite liefert `200` mit leerem `data`.

**Fehler:**
- `400` bei ungültigen Parametern oder Zeitraum
- `401` und `403` siehe oben
- `413 range_too_large`, wenn der Zeitraum mehr als `MAX_SESSIONS` Sitzungen enthält oder das Zeitbudget der Lambda (Rest unter 6 s) vorher erschöpft ist. Das Budget wird vor jeder DynamoDB-Seite geprüft (`canContinue` in `iterateSessions`), weil der Versionsfilter als `FilterExpression` läuft und ganze Seiten leeren kann.
- `413 page_too_large`, wenn der JSON-Body größer als `MAX_RESPONSE_BYTES` (5 MB, Limit der Lambda-Antwort 6 MB) wäre
- `500` bei internem Fehler

**Umsetzung:** Jeder Aufruf liest alle Sitzungen des Zeitraums (max. 24 h, eine Umfrage), wandelt sie in Datensätze um, sortiert sie und schneidet die Seite heraus. `to` wird als `to − 1 ms` in `BETWEEN` übergeben, weil `surveyStartedAt` Millisekunden-ISO enthält.

**Bekannte Grenzen (bewusst für v1):**
- Jede Seite liest und sortiert den ganzen Zeitraum neu; das Abrufen aller Seiten kostet Seiten × Zeitraum. Abhilfe in einer späteren Version: Cursor auf Sitzungsgrenzen statt `page`.
- Die Drosselung gilt pro Route für alle Mandanten zusammen; ein Kunde kann die anderen mit 429 ausbremsen. Eine Drosselung pro Client bräuchte eine eigene Zählung (die HttpApi kennt keine Usage Plans).
- Die Sortierung vergleicht Code Units (`compareAnswerRecords`), keine Collation.

**Hinweis für die Kunden-Doku:** Nur Zeiträume abfragen, die mindestens 1 h zurückliegen. Offene Sitzungen bekommen noch Antworten, und `timed_out` wird erst nach ca. 45 min gesetzt. Bei laufenden Zeiträumen können sich sonst die Seiten verschieben.

### Dateien
- `amplify/functions/shared/answer_records.ts` (M1): Typen aus `survey_responses_export/csv.ts`, dazu `sessionToAnswerRecords(session)` mit der Sortierlogik aus `sessionToCsvRows`.
- `amplify/functions/shared/survey_sessions.ts` (M1): `iterateSessions` aus `survey_responses_export/handler.ts`.
- `amplify/functions/reporting_api/`:
  - `resource.ts`: Timeout 29 s, 1024 MB.
  - `pagination.ts` (rein, ohne Version): `paginate(records, page, limit)`.
  - `v1.ts` (rein):
    - `parseV1DataParams`, das strikte Datumsformat und die Grenzen `MAX_LIMIT`, `MAX_RANGE_MS`, `MAX_SESSIONS`
    - `toV1Record`
    - `buildV1DataResponse`
  - `handler.ts`:
    - Routing-Tabelle.
    - Ablauf: `resolveApiClient` → `parseV1DataParams` → `iterateSessions` → `sessionToAnswerRecords` → sortieren → `paginate` → `buildV1DataResponse`.
    - Protokolleintrag mit `clientId`, `tenantId`, `surveyId`, Zeitraum, Seite, Anzahl und Version, ohne Antwortinhalte.

## API 2: `POST /ext/v1/invitations`

**Request:**
```json
{ "survey_uuid": "<uuid>", "amount": 100, "is_multi": false, "expiration_date": "2026-12-31" }
```
- `survey_uuid`: Pflicht, UUID.
- `amount`: Pflicht, Ganzzahl im Bereich `INVITATION_COUNT_MIN`–`INVITATION_COUNT_MAX` (1–5000, dieselbe Grenze wie in der App).
- `is_multi`: Pflicht, boolean.
- `expiration_date`: optional, `YYYY-MM-DD`. Läuft am Ende dieses Tages ab (**23:59:59 UTC**, die API kennt keine lokale Zeit des Erstellers). Ein vergangener Tag führt zu 400, heute ist erlaubt. Fehlt das Feld, läuft die Einladung nie ab, wie in der App.

**Antwort `200`:**
```json
{
  "inviteUrls": [
    { "inviteToken": "<jwt>", "fullLink": "<base url + token>", "expiration_date": "2026-12-31", "is_multi": false }
  ]
}
```
`expiration_date` ist `null`, wenn kein Ablaufdatum angegeben wurde.

**Fehler:**
- `400` bei ungültigem Body
- `401` und `403` siehe oben
- `409 no_prod`: Die Umfrage hat keinen Prod-Stand, existiert nicht oder wird gerade gelöscht
- `413` bei zu großem Body
- `429` bzw. `502` bei Fehlern von Genesys
- `500` bei internem Fehler

**`fullLink`:** wird wie in der App mit `buildInvitationUrl(baseUrl, jwt, fallbackOrigin)` aus `src/domain/survey/invitationLinks.ts` gebaut. Das Modul ist aliasfrei und wird von der Lambda schon gebündelt.
- `baseUrl` ist `base_url` aus dem **Draft** der Zeile `survey_<id>`, wie in der App. `base_url` steht nicht im Flow-JSON.
- `fallbackOrigin` ist die neue Lambda-Umgebungsvariable `WEB_SURVEY_ORIGIN`. Die App nimmt dafür `window.location.origin`, das gibt es in der Lambda nicht.

### Dateien
- `amplify/functions/shared/genesys_survey_check.ts`: `loadFlowSurvey` liest aus derselben, ohnehin geladenen Zeile zusätzlich `Draft.base_url` und gibt es im `ok`-Ergebnis als `baseUrl?: string` zurück. `web_survey` ignoriert das Feld. Es gibt keinen zusätzlichen Genesys-Aufruf.
- `amplify/functions/invitations/ext_v1.ts` (rein):
  - `parseV1InvitationRequest(body, nowSeconds)` bildet die Felder auf das vorhandene `InvitationRequest` (`surveyId`, `count`, `multi`, `exp`) ab, mit `exp` = `Date.UTC(Tag, 23:59:59)/1000`. Die Grenzen kommen aus `request.ts`.
  - `toV1InviteUrl` und `buildV1Response`.
- `amplify/functions/invitations/handler.ts`:
  - `signInvitations(tenantId, surveyId, count, multi, exp, nowSeconds)` wird aus `createInvitations` ausgelagert und von App und Kunden-API gemeinsam genutzt.
  - Routing-Tabelle über `routeKey`.
  - Ablauf der Kunden-Route: `resolveApiClient(event, "polly-api/invitations.write")` → Body lesen → `parseV1InvitationRequest` → `loadTenantCredentials` → `loadProdSurvey` → `signInvitations` → `buildInvitationUrl` → `buildV1Response`.
  - Keine Rollenprüfung über Genesys: Die Berechtigung ist der Scope, das ist das Gegenstück zu `polly_deploy`.
  - Protokolleintrag mit `clientId`.
  - Die App-Routen bleiben unverändert.
- Zur Antwortgröße bei 5000 Einladungen (ca. 4,5 MB, Grenze 6 MB): Ein Test prüft die Größe. Wird es zu knapp, bekommt die Kunden-API eine eigene, kleinere Obergrenze.
- Das Feature Flag `web_survey` wird nur im Frontend ausgewertet, die API prüft es nicht. `invitations.write` vergibt das Betriebsteam nur an Mandanten mit Web-Kanal.

## API 3: `GET /ext/v1/surveys` und `GET /ext/v1/surveys/{surveyId}`

**Datenquelle:** die Umfrage-Data-Table des Mandanten, gelesen über seine Client Credentials (`loadTenantCredentials`, `getSurveyTableAccess`), wie bei `web_survey`. Dazu das Design aus `WebSurveyThemesTable` über `pickTheme`.

### Liste
- Liefert alle Umfragen mit gültigem Prod-Stand, ohne gelöschte und ohne solche, deren Löschung läuft.
- Antwort: `{ surveys: [{ surveyId, name, title, description, version, updatedAt, language }] }`.
- Gelesen werden die Zeilen in Seiten über `GET /api/v2/flows/datatables/{id}/rows?showbrief=false&pageSize=…`. `survey_list` reicht nicht, weil darin nur `id` und `title` stehen und man nicht sieht, ob es einen Prod-Stand gibt.
- Die Zeilen `__meta`, `__lock` und `survey_list` werden übersprungen. Jede Zelle wird mit `parseProdSurvey` geprüft.
- Bei einem 429 von Genesys gibt die API ebenfalls 429 zurück.

### Details
- Ablauf: `loadProdSurvey` und `baseUrl` aus dem Draft (siehe API 2). Antwort `404`, wenn die Umfrage keinen Prod-Stand hat, nicht existiert oder gelöscht wird.
- Felder der Umfrage in v1:
  - `surveyId`, `name`, `title`, `description`, `version`, `updatedAt`, `language`
  - `greeting`, `closing`, `startQuestionId`, `baseUrl`
  - `webTheme`: Tokens aus `pickTheme`, sonst `null`
- Felder jeder Frage in v1:
  - `id`: UUID, auf die die Folgefragen verweisen
  - `questionId`: technischer Name, **derselbe Schlüssel wie im Reporting**
  - `type`, `text` (aus `prompt`), `description`, `reprompt`, `mandatory`, `defaultNextQuestionId`
  - typabhängig:
    - `yes_no`: `yesNextQuestionId`, `noNextQuestionId`
    - `choice`: `options: [{ label, synonyms: string[], nextQuestionId }]`. Die Synonyme stehen intern als `"; "`-getrennter String und werden in ein Array zerlegt.
    - `rating`: `scale: { min, max, values, minLabel, maxLabel }` und `conditions: [{ operator, value, nextQuestionId }]`
    - `nps`: `scale: { min: 0, max: 10, minLabel, maxLabel }` und `conditions` wie bei `rating`
  - Unerfüllbare Platzhalter-Bedingungen (-1 / -1000 / 1000 ohne Folgefrage) gibt v1 nicht aus. Sie sind ein internes Detail für Architect.

### Dateien
- `amplify/functions/shared/genesys_survey_check.ts`: neu `listProdSurveys(tenantId, credentials)`.
  - Liest die Zeilen seitenweise, prüft sie mit `parseProdSurvey` und filtert Umfragen mit laufender Löschung heraus (`isSurveyBeingDeleted`, bei vielen Umfragen als Batch).
  - Die Seitengröße wird so gewählt, dass eine Seite mit vier Zellen à max. 32.000 Zeichen nicht zu groß wird.
- Designs laden: Die Funktion, mit der `web_survey` die Designs des Mandanten liest, wird nach `amplify/functions/shared/web_themes.ts` verschoben, falls sie noch im Handler steht.
- `amplify/functions/surveys_api/`:
  - `resource.ts`: Timeout 29 s, 512 MB.
  - `v1.ts` (rein): `toV1SurveySummary`, `toV1SurveyDetail` und `toV1Question`, dazu der Filter der Platzhalter-Bedingungen und die Zerlegung der Synonyme.
  - `handler.ts`: Routing-Tabelle, Pfadparameter aus `event.pathParameters`, Ablauf `resolveApiClient(event, "polly-api/surveys.read")` → Kern → v1.
- Cache: Liste und Details werden pro Mandant 60 s im Lambda-Speicher gehalten, um das Genesys-Rate-Limit zu schonen. Nach einem Deploy liefert die API den neuen Stand deshalb bis zu 1 min später; das steht in der Kunden-Doku.

## `amplify/backend.ts`
- **`ApiClientsTable` (M2):** Schlüssel `clientId`, GSI `byTenantId` (`tenantId`, `clientId`), `PAY_PER_REQUEST`, `RETAIN`.
- **Resource Server (M2):** neuer `cognito.UserPoolResourceServer` `PollyApiResourceServer` mit der Kennung `polly-api` und den Scopes `reporting.read`, `invitations.write` und `surveys.read`. Der bestehende Server `backend` bleibt unverändert.
- **`onboarding` (M2):**
  - Rechte und Variablen: Schreibzugriff auf `apiClientsTable`, Umgebungsvariablen `API_CLIENTS_TABLE_NAME` und `API_RESOURCE_SERVER=polly-api`.
  - Routen `/onboarding/api-clients/{create,list,delete}` (POST).
- **`reporting_api` (M3):**
  - Rechte und Variablen: Lesezugriff auf `surveyResponsesTable` und `apiClientsTable`, die Umgebungsvariablen dazu und `attachTenantAuth`.
  - Route `GET /ext/v1/reporting/data`, Drosselung z. B. 20/40.
- **`invitations` (M4):**
  - Rechte und Variablen: Lesezugriff auf `apiClientsTable` und `API_CLIENTS_TABLE_NAME`.
  - `WEB_SURVEY_ORIGIN` kommt aus der Amplify-Umgebungsvariable gleichen Namens. Fehlt sie, wird `https://<branch>.<appId>.amplifyapp.com` abgeleitet; im Branch-Namen werden Zeichen außer `a-z0-9-` zu `-`, er wird nicht gekürzt. Ohne App-ID (Sandbox) warnt `backend.ts`.
  - Route `POST /ext/v1/invitations`, Drosselung z. B. 5/10, weil jeder Aufruf bis zu 5000 Signaturen und Genesys-Aufrufe auslöst.
- **`surveys_api` (M5):**
  - Rechte und Variablen: Lesezugriff auf `apiClientsTable`, `surveyDeletionJobsTable` und `webSurveyThemesTable`, die Umgebungsvariablen dazu und `attachTenantAuth`.
  - Routen `GET /ext/v1/surveys` und `GET /ext/v1/surveys/{surveyId}`, Drosselung z. B. 10/20.
- Drosselung jeweils in `defaultStageCfn.routeSettings`; die neuen Routen kommen in `addDependency`.

## Doku

### Kundenspezifikation `documentation/polly_customer_api.md` (ab M2, wächst pro API)
Auf Deutsch, aufgebaut wie das ORA-PDF:
- Überblick und Anmeldung, Token-Abruf mit curl, Scopes.
- Je API: Zweck, Request, Parameter, Beispiele, Antwort und Antwortcodes.
- Hinweise: Reporting nur für vergangene Zeiträume abfragen; Einladungen laufen am Tagesende in UTC ab; Umfragedetails sind bis zu 1 min verzögert und haben keine Versionsgeschichte.
- Abschnitt „Versionierung“ für Kunden: zusätzliche Felder tolerieren, wann es eine neue Version gibt, Übergangszeit.
- Abschnitt für Entwickler „So entsteht eine v2“: Versionsschicht anlegen, Eintrag in der Routing-Tabelle, Route in `backend.ts`, eigene Tests.

### Doku für das Betriebsteam `documentation/betrieb_api_zugaenge.md` (Entwurf in M2, ergänzt in M4, abgeschlossen in M6)
Schritt-für-Schritt-Anleitung, wie API-Zugänge für Kunden eingerichtet werden:
1. **Voraussetzungen**
   - Der Mandant ist installiert und `APPROVED`.
   - Seine `tenantId` steht in der Tenants-Tabelle (DynamoDB, Suche über `tenantName`).
   - Admin-Token: Secret `OnboardingAdminToken` der Umgebung in Secrets Manager.
   - API-URL der Umgebung mit Präfix: `https://<app-domain><präfix>`.
2. **Scopes wählen:** Welche Scopes der Kunde braucht (Reporting, Einladungen, Umfragedetails). `invitations.write` nur bei aktivem Web-Kanal.
3. **Client anlegen:** `curl` auf `/onboarding/api-clients/create`, Beispiel-Body und Beispielantwort. Das Secret wird nur einmal angezeigt.
4. **Übergabe an den Kunden:**
   - Was er bekommt: Token-URL, Client-ID, Client-Secret, Scope-String, `[API_URL]` je API und den Link auf die Kundenspezifikation.
   - Das Secret auf einem sicheren Weg übergeben, getrennt von der Client-ID.
5. **Clients auflisten:** `/onboarding/api-clients/list`.
6. **Sperren und Löschen:** `/onboarding/api-clients/delete`. Die Wirkung ist sofort da, auch für noch gültige Tokens.
7. **Secret erneuern:** neuen Client anlegen, an den Kunden übergeben und den alten nach der Umstellung löschen.
8. **Scopes ändern:** neuen Client mit den gewünschten Scopes anlegen und den alten löschen.
9. **Verhalten bei Uninstall bzw. Löschen des Mandanten:** Zugriff gesperrt, Clients werden beim Löschen bzw. Wipe entfernt.
10. **Umgebungsvariable `WEB_SURVEY_ORIGIN`** (ab M4): wann sie gesetzt werden muss, z. B. bei eigener Domain.
11. **Fehlersuche:**
    - 401: Token abgelaufen oder falsche Token-URL bzw. Umgebung.
    - 403: Scope fehlt, Client gelöscht oder Mandant nicht `APPROVED`.
    - 409: Umfrage ohne Prod-Stand.
    - 429: Drosselung.
    - Wo die Protokolle liegen (CloudWatch der jeweiligen Lambda, Felder `clientId`/`tenantId`).

### Weitere Doku
- Verweise ergänzen in `survey_responses_api.md` (M3), `polly_web.md` (M4) und `branch_umgebung_einrichten.md` (M4: Client anlegen, `WEB_SURVEY_ORIGIN`).
- `CLAUDE.md`:
  - M2: Kunden-API, `ApiClientsTable`, Verweis auf diesen Plan, neue Testdatei.
  - M3 und M5: neue Lambdas in der Architektur.
  - M4: Die serverseitige Prüfung, wer Einladungen erzeugen darf, kennt jetzt zusätzlich den Scope `invitations.write`.

## Tests

**`test/customerApi.test.ts`** (neu in M2, kommt ins `test`-Script in `package.json`). Mini-Test-Funktion wie in `test/surveyResponsesExport.test.ts`; Inhalte je Meilenstein:
- M2: Prüfung der Scopes.
- M3:
  - Reporting-Parameter: Datumsformat (mit `Z` und ohne Sekunden wird abgelehnt), 24-h-Grenze, `to` ≤ `from`, exklusives `to`, `page`/`limit` mit Defaults und Obergrenze, leere Seiten, `total = 0`
  - `sessionToAnswerRecords`
  - feste Feldliste von `toV1Record`: Ein zusätzliches internes Feld darf nicht in der Antwort auftauchen.
- M4:
  - `parseV1InvitationRequest`: Pflichtfelder, `amount`-Grenzen, Datumsformat, vergangener Tag, heute, ohne Ablaufdatum
  - Linkaufbau: `{token}`, `?`/`&token=`, Fallback `/s/<jwt>`
  - feste Feldliste von `toV1InviteUrl`
  - Antwortgröße bei 5000 Einträgen
- M5:
  - v1-Abbildung mit Fixtures aus `survey_translator_for_flow.md`, für alle fünf Fragetypen: feste Feldlisten, `questionId` gleich `name`, Platzhalter-Bedingungen werden herausgefiltert, Synonyme als Array, `webTheme` ist `null` ohne Design
  - Liste: übersprungene Sonderzeilen und ungültige Prod-Zellen
- Alle: Routing-Tabelle, unbekannte Routen ergeben 404.

**Weiterhin grün:** `surveyResponsesExport.test.ts` und `webSurveyBackend.test.ts` bleiben unverändert.

**`tools/api_tests.py` (M6):**
- Neue `tests_customer_api` mit den optionalen Umgebungsvariablen `API_CLIENT_ID`, `API_CLIENT_SECRET` und `API_TOKEN_URL`; ohne sie werden die Fälle übersprungen.
- Fälle:
  - Token holen
  - `/data` liefert die Session des Testlaufs
  - `/invitations` liefert `amount` Einträge, und `GET /web-survey` akzeptiert einen davon
  - `/surveys` enthält die Testumfrage, und die `questionId` passen zum Reporting
  - Token ohne passenden Scope führt zu 403
  - Fehlerfälle mit 400 und 404

## Prüfung (M6, Teile davon schon nach M2 bis M5)
1. `npm test` (in der Sandbox ggf. `node --import tsx test/<datei>.ts`) und `npx vue-tsc --noEmit`.
2. In einer Branch-Umgebung deployen, dann:
   1. Mit der Anleitung aus `betrieb_api_zugaenge.md` einen Client mit allen Scopes anlegen und ein Token an der `tokenUrl` holen. Das prüft zugleich die Betriebsdoku.
   2. `python3 tools/api_tests.py` mit den neuen Umgebungsvariablen laufen lassen.
   3. `/data` gegen den CSV-Export derselben Umfrage und desselben Zeitraums vergleichen.
   4. Einen `fullLink` im Browser öffnen: Die Umfrage muss erscheinen. Bei einer Umfrage mit `base_url` muss der Link auf die Kundenseite zeigen.
   5. Einen Client nur mit `reporting.read` anlegen: `POST /ext/v1/invitations` und `GET /ext/v1/surveys` müssen 403 liefern.
   6. `GET /ext/v1/surveys` enthält die Testumfrage. Bei `GET /ext/v1/surveys/{id}` müssen die `questionId`-Werte genau zu den `questionId` aus `/ext/v1/reporting/data` passen. Eine Umfrage ohne Prod-Stand ergibt 404.
   7. Den Client löschen: Ein noch gültiges Token muss sofort 403 liefern. Der `backend/invoke`-Client der Data Action bekommt auf allen `/ext/v1`-Routen 403.
