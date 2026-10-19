# Implementierungsplan: Web-Kanal für PollyCX

## Fortschritt
Nach Abschluss eines Meilensteins hier abhaken und Abweichungen vom Plan kurz notieren. Neue Funktionen die der Nutzer nun testen kann bitte zusammenfassen.

- [x] M1 Schritt 0 und 1 (2026-10-16)
- [x] M2 Schritt 2a: reine Logik (Token-Modul, flowNavigation, Tests dazu)  (2026-10-19)
- [x] M3 Schritt 2b: Backend-Infrastruktur (Tabelle, Secret, Lambdas invitations und web_survey, Routen, Drosselung, Anpassungen an Lösch-Worker und Export).  (2026-10-19)
  - Abweichungen:
    - `loadProdSurvey(tenantId, surveyId, credentials?)` nimmt optional schon geladene Credentials. Der Projekt-Tag für die Rollenprüfung kommt aus `meta.setup.projectTag` der Zeile `__meta` (`loadProjectTag`).
    - `hasRole` liegt jetzt als `hasPollyRole` in `src/domain/permissions/roleCheck.ts` (aliasfrei). `appStore` und die Lambda `invitations` nutzen dieselbe Funktion.
    - Die Aggregat-Logik und `isSurveyBeingDeleted` liegen in `amplify/functions/shared/survey_results.ts`.
    - `web_survey` nutzt `attachTenantAuth` nur für die Grants (Tenants-Tabelle, Tenant-Secret), ruft aber `resolveTenantContext` nicht auf.
    - Zusätzlich: Der Prod-Stand wird bei GET 30 s pro Container gecacht (schont das Genesys-Rate-Limit). `409 survey_changed` liefert die neue Fassung gleich mit, die Seite muss nicht neu laden. Genesys-429 wird als `429 throttled` weitergegeben.
    - `reservedConcurrentExecutions` ist per Amplify-Umgebungsvariable `WEB_SURVEY_RESERVED_CONCURRENCY` änderbar (Default aus, z. B. `50` schaltet sie ein), weil Konten mit kleinem Kontingent sonst nicht deployen können.
    - Statuscodes von `/invitations` und `/web-survey/submit` sind in `polly_web.md` als Tabellen festgelegt. Die Typen für die Seite stehen in `src/domain/survey/webSurveyTypes.ts`.
    - Neuer Test `test/webSurveyBackend.test.ts`; die curl-Suite liegt unter `tools/survey_responses.sh` (nicht `test/`).
  - Testbar nach dem Deploy (noch ohne Oberfläche):
    - `POST /api/invitations` mit dem Genesys-Bearer aus der App (Header `x-genesys-region`), z. B. `{"surveyId":"<uuid>","count":3,"multi":false}`. Ohne `polly_deploy` → 403, mit M2M-Token → 403, ohne Prod-Stand → 409.
    - `GET /api/web-survey?token=<jwt>` liefert das bereinigte Flow-JSON. `POST /api/web-survey/submit` speichert eine Antwort. Sie erscheint im Report-CSV mit `Channel` = `web`; ein zweites Absenden mit demselben Einmal-Token → 409 `used`.
    - Der Report-Export hat die neue letzte Spalte `Channel` (bestehende Antworten: `flow`).
    - `tools/survey_responses.sh` prüft die öffentlichen Fälle ohne Token, mit `WEB_TOKEN=<jwt>` auch Laden und `survey_changed`.
- [ ] M4 Schritt 3 – Unterseite „Einladungslinks“ (Genesys-App)
- [ ] M5 Schritt 4 – Öffentliche Web-Umfrageseite


## Context

Bisher spielt Polly Umfragen nur über Genesys Architect ab (Telefon/Chat). `documentation/polly_web.md` legt einen dritten Kanal fest: öffentliche Web-Umfragen mit personalisierten JWT-Einladungslinks, Min/Max-Labels für rating/nps, einer Basis-URL pro Umfrage und einer barrierefreien Umfrageseite. Antworten landen erst beim Absenden in DynamoDB.

Ausgangslage im Code:
- Alle Lambdas verlangen einen Genesys- oder Cognito-Token (`resolveTenantContext`). Einen öffentlichen Endpunkt gibt es nicht.
- Die Payload in der Spezifikation enthält keinen Mandanten.
- App.vue führt den Genesys-Login für jede Route aus.
- Die Umfragedefinition liegt in der Genesys Data Table. Das Backend kann sie aber mit den Client Credentials des Mandanten lesen (`loadTenantCredentials` + `getClientCredentialsToken`).

## Mit dem Nutzer abgestimmte Entscheidungen

1. **JWT-Signatur im Backend.** Ein neuer Endpunkt `POST /api/invitations` (Genesys-Bearer) signiert mit HS256. Der Schlüssel liegt in Secrets Manager, und der JWT-Header enthält `kid` für spätere Rotation. Die Payload bekommt zusätzlich `tenant_id`.
2. **Umfrageseite als zweiter Vite-Einstiegspunkt** im selben Repo: `survey.html` + `src/webSurvey/main.ts`, ohne Genesys-SDK und ohne appStore, ausgeliefert über dasselbe Amplify-Hosting.
3. **Ausgespielt wird der Prod-Stand** (Flow-JSON). Ohne Prod-Deploy zeigt die Seite „Umfrage nicht verfügbar“. Ein Rollback wirkt damit automatisch auch im Web.
4. **Darstellung als ein Formular.** Alle Hauptfragen stehen auf einer Seite. Folgefragen erscheinen direkt unter ihrer Elternfrage, sobald die Bedingung zutrifft. `mandatory` macht eine Frage zur Pflichtangabe. Es gibt einen Button „Absenden“.
5. **Token im Link über den Platzhalter `{token}`.**
   - Enthält die Basis-URL `{token}`, wird er ersetzt (z. B. `https://baseurl.com/{token}`).
   - Sonst wird `?token=<jwt>` angehängt, bzw. `&token=`, wenn schon eine Query vorhanden ist.
   - Ohne Basis-URL wird `<polly-origin>/s/<jwt>` verwendet.
   - Die Polly-Seite versteht `/s/<jwt>` und `?token=`.
   - Bei Einbindung per iframe reicht der Betreiber den Token an die iframe-`src` weiter. Die Doku bekommt dafür ein Snippet.
6. **Links erzeugen erfordert `polly_deploy`** (`canDeploy`). Geprüft wird im Frontend und zusätzlich serverseitig über die Genesys-Rollen des Aufrufers.
7. **Angezeigte Texte:** Titel, Begrüßung, Fragetitel, **Beschreibung** (als Hilfetext über `aria-describedby`), Optionen, Min/Max-Labels und nach dem Absenden die Verabschiedung. Reprompt und Synonyme werden im Web nicht angezeigt.
8. **Reporting:** Web-Antworten bekommen `channel: "web"` und `tokenId`. Die CSV bekommt eine neue letzte Spalte `Channel`. Bestehende Antworten ohne Feld erscheinen dort als `flow`.
9. **Neues Draft-Feld `language`** (`de`/`en`/`fr`, Default `de`). Es steuert die festen UI-Texte und `<html lang>`. Fehlerseiten, die vor dem Laden der Umfrage erscheinen, nutzen die Browsersprache. **Fehlt `language` im Flow-JSON** (ältere Prod-Stände), gilt auf der Web-Seite und im Backend ausdrücklich `de`, unabhängig von der Browsersprache.
10. **Signaturschlüssel:** wird beim Deploy automatisch in AWS Secrets Manager erzeugt, ein Schlüssel pro Umgebung. Details in Schritt 2.
11. **`/invitations` nur mit Genesys-Bearer:** Cognito-M2M-Tokens (Data Action des Flows) werden mit 403 abgelehnt. Begründung: Für sie gibt es keine Benutzerrollen, und Links erzeugt nur die App-Oberfläche.
12. **Prod ändert sich zwischen Laden und Absenden:** Die Seite schickt die geladene `surveyVersion` mit. Weicht sie vom aktuellen Prod-Stand ab, antwortet das Backend mit 409 `survey_changed`, speichert nichts und verbraucht den Token nicht. Die Seite lädt die neue Fassung, übernimmt Antworten auf weiterhin vorhandene Fragen (gleiche Frage-ID, Wert noch gültig) und meldet: „Die Umfrage wurde zwischenzeitlich aktualisiert. Bitte prüfen Sie Ihre Antworten und senden Sie erneut ab.“ Ist kein Prod-Stand mehr vorhanden (Rollback ohne Backup, Löschung), erscheint „Umfrage nicht verfügbar“.
13. **Drosselung (429):** Die Grenzwerte werden bewusst großzügig gewählt (siehe Schritt 2). Bei 429 wartet die Seite, versucht es automatisch einmal erneut und zeigt danach: „Der Dienst ist gerade stark ausgelastet. Bitte versuchen Sie es in einem Moment erneut.“ Ein Button „Erneut versuchen“ erscheint, alle Antworten bleiben erhalten.

## Schritt 0 – Spezifikation aktualisieren (`documentation/polly_web.md`)

Die Entscheidungen 1–13 sowie die folgenden Festlegungen werden in `polly_web.md` eingearbeitet:
- endgültiges JWT-Format mit `tenant_id`
- Link-Aufbau
- Endpunkte (Request/Response, Fehlercodes)
- Schema der Tabelle InvitationTokens
- Zustände und Meldungen der Seite
- iframe-Snippet
- WCAG-Zielniveau 2.2 AA

Diese Festlegungen ergänzen die Spezifikation:
- **Meldungen:**
  - ungültige Signatur oder unbekannter Mandant → „Einladung ist ungültig“
  - `exp` überschritten → „Einladung ist abgelaufen“
  - Einmal-Token bereits benutzt → „Diese Einladung wurde bereits verwendet“
  - kein Prod-Stand oder Umfrage gelöscht → „Umfrage nicht verfügbar“
  - Prod zwischenzeitlich geändert → Hinweis „Die Umfrage wurde zwischenzeitlich aktualisiert …“ (Entscheidung 12)
  - 429 → „Der Dienst ist gerade stark ausgelastet …“ (Entscheidung 13)
- **`exp` aus dem Ablaufdatum:** Es gilt das Tagesende 23:59:59 in der lokalen Zeit des Erstellers. Ohne Datum fehlt `exp`, und die CSV-Spalte `Expiration` bleibt leer.
- **Anzahl pro Erzeugung:** 1–5000 Links.
- **Ablauf beim Einmal-Token:** Der Token wird beim Absenden atomar zusammen mit der Antwort gespeichert (DynamoDB-Transaktion). So kann dieselbe Einladung auch bei gleichzeitigem Absenden nicht doppelt genutzt werden.
- **Gelöschte Umfragen:** Deren Tokens werden vom Lösch-Worker mit entfernt. Danach greift die TTL von 180 Tagen.

Außerdem wird `survey_definition.md` angepasst (`base_url`, `language`, `min_label`/`max_label`), ebenso `survey_translator_for_flow.md`, `survey_responses_api.md` (`channel`, `tokenId`), `survey_responses_csv_export.md` (Spalte `Channel`), `permissions.md` (Einladungen mit `polly_deploy`) und `CLAUDE.md` (Architektur: neue Lambda, zweiter Einstiegspunkt, Testliste).

## Schritt 1 – Datenmodell und Editor (Frontend)

**Typen:** `src/domain/survey/surveyTypes.ts`
- `Survey`: neue optionale Felder `base_url?: string` und `language?: "de" | "en" | "fr"`.
- `RatingOptions`: neue Felder `min_label?` und `max_label?`.
- Neuer Typ `NpsOptions { min_label?, max_label? }`.
- `cloneSurvey`/`cloneSurveyQuestion` übernehmen die neuen Felder (sie kopieren heute Feld für Feld).
- `createEmptySurvey` setzt `language: "de"`.
- Alle neuen Felder bleiben optional, deshalb ist keine Migration nötig. Gelesen wird tolerant mit `?? ""`.

**Validator:** `src/domain/survey/surveyValidator.ts`
- `base_url` ist optional. Wenn gesetzt: absolute `https://`-URL, höchstens ein `{token}`.
- Labels: höchstens 100 Zeichen (neue Konstante in `src/constants/surveyConstants.ts`). Sie werden nicht vorgelesen, haben also kein `ttsLimit`.
- `language` muss aus der erlaubten Liste stammen.
- Neue Feld-IDs in `src/domain/survey/surveyFieldIds.ts`.

**Editor:**
- `SurveyMetaForm.vue`: Basis-URL (`InputText`) und Sprache (`Select`).
- `RatingOptionsEditor.vue`: je ein Label unter Min und Max, die Skalen-Vorschau zeigt die Labels.
- Neue Komponente `components/survey/ScaleLabelsEditor.vue` mit den Label-Feldern. Sie wird von rating und nps gemeinsam genutzt und in `SurveyQuestionCard.vue` sowie im Folgefragen-Editor eingehängt.
- `composables/useQuestionTypeOptions.ts`: `handleTypeChange` darf bei nps die Optionen nicht mehr löschen, sondern setzt `{}`.

**Translator:** `src/services/surveyFlowTranslator.ts`
- `language` steht auf oberster Ebene des Flow-JSON, aber nur wenn gesetzt.
- rating: `min_label`/`max_label` kommen in `options`, nur wenn sie gesetzt sind.
- nps: `options: { min_label, max_label }`, nur wenn mindestens ein Label gesetzt ist.
- `base_url` kommt nicht in das Flow-JSON. Das schont das 32k-Budget, und der Architect-Flow ignoriert zusätzliche Felder.
- Bestehende Testdaten bleiben unverändert. Neue Testfälle kommen in `test/surveyFlowTranslator.test.ts`.

**i18n:** neue Keys in `de/en/fr/tlh/la`:
- `surveyEditor.meta.baseUrl`/`language`
- `ratingOptions.minLabel`/`maxLabel`
- `validation.*`
- `invitations.*`
- `webSurvey.*`

## Schritt 2 – Backend

**Gemeinsame Bausteine** in `amplify/functions/shared/`:
- `invitation_token.ts`:
  - `createInvitationKey(secret)` berechnet den `kid` einmal pro geladenem Schlüssel (mit dem Secret im Container cachen)
  - `signInvitation(claims, key)` signiert nur die bekannten Claims und lehnt `exp` in der Vergangenheit bzw. `exp <= iat` ab; `verifyInvitation(jwt, keys)`
  - HS256 über Node-`crypto` (`createHmac`, `timingSafeEqual`), keine neue Abhängigkeit
  - prüft `alg`, `kid`, `exp`, `iat` (nicht in der Zukunft, 5 min Toleranz) und die Pflicht-Claims
  - unterscheidet die Fehler `invalid` und `expired`
- `genesys_survey_check.ts`:
  - `getRow` exportieren
  - neue Funktion `loadProdSurvey(tenantId, surveyId)`: mit `loadTenantCredentials` und dem Client-Credentials-Token die Zeile `survey_<id>` aus der Umfrage-Data-Table lesen (`surveyDataTableId` des Mandanten, seit dem Review explizit beim Onboarding gespeichert; ältere Mandanten: `allowedDataTableIds[0]`) und `Prod` parsen; zusätzlich gegen die Löschmarkierung in `SurveyDeletionJobsTable` prüfen

**Navigation im Flow-JSON:** neues Modul `src/domain/survey/flowNavigation.ts`, rein und ohne Vue.
- Ermittelt aus Prod-JSON und Antworten die erreichbaren Fragen.
- Prüft Antwortwerte gegen den Typ: rating im Bereich min..max, nps 0..10, choice muss ein Label aus `labels` sein, yes_no ein bool, comment höchstens 2000 Zeichen.
- Prüft die Pflichtangaben.
- Regeln: Verweis `null` ⇒ weiter mit `default_next_question_id`. Bei rating/nps gewinnt die erste passende Bedingung in der Reihenfolge `equals`, `less_than`, `greater_than`, die Vergleiche sind strikt.
- Wird vom Frontend (Anzeige) und vom Backend (Prüfung beim Absenden) genutzt.
- Geprüft: Der Lambda-Bundler (esbuild über `NodejsFunction`, `projectRoot` = Repo-Root) löst relative Imports aus `src/` auf. Bedingung: Das Modul und alles, was es importiert (auch `import type`), kommt ohne `@/`-Alias aus. Der Typecheck von `ampx` vor dem Deploy nutzt `amplify/tsconfig.json` ohne Alias, und `@/i18n` zöge vue-i18n ins Bundle. Die Flow-Typen liegen deshalb in `src/domain/survey/flowTypes.ts`; `surveyTypes.ts` und `surveyFlowTranslator.ts` reichen sie weiter.

**Neue Lambda `invitations`** (`amplify/functions/invitations/`):
- Route `POST /invitations` mit `attachTenantAuth`.
- Body `{ surveyId, count, exp?, multi }`. `exp` ist das Ablaufdatum der Einladung in Epoch-Sekunden, gleicher Name und gleiches Format wie der JWT-Claim.
- Nur Genesys-Bearer: Ist der Aufrufer über ein Cognito-Token angemeldet (`resolveTenantContext` liefert die Auth-Art bzw. `iss === COGNITO_ISSUER`), antwortet die Lambda mit 403 `forbidden_m2m`.
- Prüft serverseitig die Rolle `polly_deploy`: Rollen des Aufrufers über `/api/v2/users/me?expand=authorization`, mit derselben Logik wie `hasRole`, also auch mit `projectTag`-Präfix.
- Prüft, ob die Umfrage einen Prod-Stand hat.
- Liefert `{ tokens: [{ jwt, exp, multi }] }`. Den Link baut das Frontend.

**Neue Lambda `web_survey`** (`amplify/functions/web_survey/`, öffentlich, ohne `resolveTenantContext`):
- **`GET /web-survey?token=`**
  - Token prüfen.
  - Bei Einmal-Token in `InvitationTokens` nachsehen, ob er schon benutzt ist.
  - Mandantenstatus muss `APPROVED` sein.
  - `loadProdSurvey` aufrufen und ein bereinigtes Flow-JSON zurückgeben (ohne `synonyms`, `reprompt`, `name`).
  - `language` wird mit Default `de` gefüllt, falls es im Prod-Stand fehlt.
  - Antwort: `{ status: "ok", survey }` (inkl. `version`) oder `{ status: "invalid" | "expired" | "used" | "unavailable" }`.
- **`POST /web-survey/submit`** mit `{ token, surveyVersion, answers: { [questionId]: value } }`
  - Erneut alles prüfen, dann Prod laden.
  - Weicht `surveyVersion` von `Prod.version` ab → 409 `survey_changed`, nichts wird geschrieben, der Token bleibt unverbraucht.
  - Danach mit `flowNavigation` prüfen. Ist etwas ungültig, antwortet die Lambda mit 400 und speichert nichts.
  - Mit `TransactWriteItems` schreiben:
    - bei Einmal-Token einen Put in `InvitationTokens` mit `attribute_not_exists`
    - den Put des Antwort-Items direkt mit `status: "completed"`, `channel: "web"`, `tokenId`, `responseId = randomUUID()`, `surveyStartedAt = ${surveyId}#${now}`, `surveyName`/`surveyVersion` aus Prod und `answers[questionName]` im bestehenden Format
  - Danach die Aggregate aktualisieren. `updateSurveyAggregate` wird dazu aus `survey_responses/handler.ts` in ein gemeinsames Modul verschoben.
  - Schlägt die Transaktion an der Bedingung fehl, antwortet die Lambda mit 409 `used`.

**`amplify/backend.ts`:**
- **Tabelle `InvitationTokensTable`:**
  - PK `tenantId`, SK `tokenId`
  - TTL-Attribut **`ttl`** (Epoch-Sekunden, Zeitpunkt der Nutzung + 180 Tage). Das Ablaufdatum der Einladung heißt überall `exp` (JWT-Claim und API), die Löschfrist des Eintrags überall `ttl`. Der Name `expiresAt` wird für Einladungen nicht verwendet.
  - Attribute: `tenantId`, `tokenId`, `tenantSurveyId` (`${tenantId}#${surveyId}`, Schlüssel des GSI), `surveyId`, `usedAt` (ISO), `responseId`, `ttl`
  - GSI `byTenantSurvey`: PK `tenantSurveyId`, SK `usedAt`, `KEYS_ONLY`, für den Lösch-Worker
  - `PAY_PER_REQUEST`, `RETAIN`
- **Signaturschlüssel `WebSurveyJwtSecret`:**
  - Wird beim Deploy automatisch von CDK in **AWS Secrets Manager** erzeugt (`new secretsmanager.Secret(...)` mit `generateSecretString`, 64 Zeichen, ohne Satzzeichen), wie beim bestehenden `OnboardingAdminToken`. Name `polly-web-survey-jwt-${envSuffix}`, also ein Schlüssel pro Umgebung (Branch).
  - Der Schlüssel verlässt AWS nie. Er steht weder im Repo noch im Frontend oder in Env-Vars; die Lambdas bekommen nur den ARN als Env-Var und lesen den Wert zur Laufzeit (mit Cache im Lambda-Container).
  - `RemovalPolicy.RETAIN`: Ein Neuaufbau des Stacks würde sonst einen neuen Schlüssel erzeugen und alle verschickten Links ungültig machen.
  - `kid` im JWT-Header = die ersten 8 Zeichen des SHA-256-Hashs des Schlüssels. Die Prüfung akzeptiert die Versionen `AWSCURRENT` und `AWSPREVIOUS`, eine spätere manuelle Rotation macht bestehende Links also nicht sofort ungültig. Automatische Rotation ist nicht Teil dieses Plans.
  - Lesezugriff (`grantRead`) nur für `invitations` und `web_survey`.
- **Routen:** `POST /invitations`, `GET /web-survey`, `POST /web-survey/submit`.
- **Drosselung:**
  - Wichtig: Die Drosselung der HTTP API gilt pro Route für **alle Mandanten zusammen** und nicht pro IP. Sie schützt also nur das Backend vor Überlast, nicht gezielt vor einzelnen Angreifern. Deshalb großzügige Werte, damit große Kampagnen nicht ausgebremst werden: `GET /web-survey` Rate 200/s, Burst 500; `POST /web-survey/submit` Rate 100/s, Burst 300. Die Werte kommen als Konstanten in `backend.ts` und werden in der Doku begründet.
  - Zusätzlich bekommt `web_survey` eine `reservedConcurrentExecutions` (z. B. 50). Eine Flut auf der öffentlichen Seite kann dann nicht das Lambda-Kontingent des Kontos aufbrauchen und damit die Data Action des Telefon-Flows (`survey_responses`) ausbremsen.
  - Die Lambda begrenzt selbst die Body-Größe (z. B. 64 KB) und die Länge von Kommentaren.
  - Eine Begrenzung pro IP wäre nur mit CloudFront + WAF vor der API möglich; HTTP APIs unterstützen WAF nicht direkt. Das wird in der Doku als spätere Option festgehalten.
- **Rechte (Grants):**
  - `web_survey`: Lesen/Schreiben auf InvitationTokens, Responses und Aggregates, Lesen auf Tenants und DeletionJobs, dazu der Lesezugriff auf das Tenant-Secret. Das Tenant-Secret liefert die Genesys-Credentials; Muster wie `attachTenantAuth`, nur ohne Auth-Pfad.

**Weitere Anpassungen im Backend:**
- `survey_responses_delete`: Der Worker löscht zusätzlich die Tokens der Umfrage über `byTenantSurvey`.
- `survey_responses_export`:
  - `channel` in die Projection und in `ExportSession` aufnehmen
  - `CSV_HEADER` und `toCsvRows` bekommen die Spalte `Channel` (Default `flow`)
  - `test/surveyResponsesExport.test.ts` anpassen

## Schritt 3 – Unterseite „Einladungslinks“ (Genesys-App)

- **Einstieg:**
  - `SurveyEditorToolbar.vue`: Button „Einladungslinks“; aktiv nur mit `canDeploy`, sonst Tooltip `permissions.missingDeploy`. Er feuert `emit('invite')`, `SurveyEditor.vue` reicht das Event weiter.
  - `pages/surveys.vue`: Query `?id=…&invite=1` mit Computed `isInviteView`, Handler und einem Block in `onBeforeRouteUpdate`.
  - `app/modules.ts`: `invite` in `preserveQueryKeys` aufnehmen.
- **Neue Komponente `components/survey/SurveyInvitationView.vue`:**
  - Felder: Anzahl (`InputNumber` 1–5000), Ablaufdatum (`DatePicker`, optional, nicht in der Vergangenheit), mehrfach nutzbar (`Checkbox`).
  - Hinweis, wenn kein Prod-Stand existiert. Dann ist der Button gesperrt.
  - Zeigt die verwendete Basis-URL an (aus dem gespeicherten Draft, Fallback auf die Polly-Seite).
- **Logik:**
  - `composables/useSurveyInvitations.ts` und `services/invitationService.ts` (`apiFetch` → `POST /invitations`).
  - Reine Funktionen in `domain/survey/invitationLinks.ts`: `buildInvitationUrl(baseUrl, jwt, fallbackOrigin)` (Platzhalter `{token}` oder `?token=`/`&token=`) und `buildInvitationCsv(rows)` (`Expiration;Multi use;Complete URL`, mit BOM, Escape- und Formelschutz wie in `amplify/functions/survey_responses_export/csv.ts`; die Funktion dafür nach `src/utils/csv.ts` ziehen oder wiederverwenden).
  - Download über das bestehende `src/utils/download.ts` → `downloadBlob`.

## Schritt 4 – Öffentliche Web-Umfrageseite

**Build:**
- `vite.config.ts`: `build.rollupOptions.input = { main: "index.html", survey: "survey.html" }`.
- In den Amplify-Rewrites `/s/<*>` → `/survey.html` (200) eintragen; in der Doku festhalten, weil das in der Konsole konfiguriert wird.
- Die Seite darf in iframes eingebettet werden. Prüfen, dass Amplify `frame-ancestors`/`X-Frame-Options` nicht blockiert.

**App** (`src/webSurvey/`):
- `main.ts`: i18n, PrimeVue-Theme und Tailwind; keine Pinia, kein Genesys.
- `WebSurveyApp.vue`:
  - Token aus `/s/<jwt>` oder `?token=` lesen.
  - Zustände: `loading` → `invalid` | `expired` | `used` | `unavailable` | `form` → `submitting` → `done` (Verabschiedung) | `error`.
  - `language` der Umfrage setzt die i18n-Sprache und `document.documentElement.lang`. Fehlt das Feld, gilt `de`.
  - 409 `survey_changed`: neu laden, Antworten übernehmen und Hinweis anzeigen (Entscheidung 12). 429: einmal automatisch nach ca. 2 s erneut versuchen, danach Meldung mit Button „Erneut versuchen“ (Entscheidung 13). Die Meldungen werden per `role="alert"` angesagt.
- `components/WebQuestion.vue` als Darstellung pro Typ:
  - rating/nps als nativer Radio-Button in `fieldset`/`legend`, Min/Max-Labels an den Skalenenden mit `aria-describedby`
  - choice als Radio-Gruppe
  - yes_no als Radio-Gruppe Ja/Nein
  - comment als `textarea` mit Zeichenzähler
- Folgefragen werden mit `flowNavigation` direkt unter der Elternfrage eingeblendet und per `aria-live="polite"` angekündigt. Fällt eine Folgefrage wieder weg, wird ihre Antwort verworfen.
- `services/webSurveyApi.ts`: `fetch` auf `/api/web-survey` bzw. `/submit`.

**Barrierefreiheit (WCAG 2.2 AA):**
- semantische Landmarks und eine Überschriften-Hierarchie
- Pflichtfelder sowohl visuell als auch mit `aria-required` markiert
- beim Absenden eine Fehlerübersicht oben, die den Fokus erhält, mit Links zu den Feldern; dazu Fehlertexte an den Feldern per `aria-describedby`
- sichtbarer Fokus, Kontrast mindestens 4.5:1, Zielgrößen mindestens 24×24 px
- volle Tastaturbedienung, kein Zeitlimit
- Umbruch bei 320 px Breite und 400 % Zoom
- `prefers-reduced-motion` berücksichtigen
- Nach dem Absenden wechselt der Fokus auf die Abschlussmeldung.

**Optional für iframe:** `postMessage({ type: "polly:height", height })`, damit die einbettende Seite die Höhe anpassen kann (Snippet in der Doku).

## Wiederverwendbare Bausteine

| Baustein | Ort |
|---|---|
| `loadTenantCredentials`, `jsonParseSafe`/`base64UrlToBuffer` (exportieren) | `amplify/functions/shared/tenant_auth.ts` |
| `getClientCredentialsToken`, `getRow` (exportieren) | `amplify/functions/shared/genesys_survey_check.ts` |
| Upsert-/Aggregat-Logik | `amplify/functions/survey_responses/handler.ts` |
| CSV-Escape und Formelschutz | `amplify/functions/survey_responses_export/csv.ts` |
| `downloadBlob` | `src/utils/download.ts` |
| `apiFetch` | `src/services/pollyApi.ts` |
| `hasRole`, `canDeploy` | `src/stores/appStore.ts`, `src/constants/permissionConstants.ts` |
| `useFieldErrors`, `FieldError` (Muster für die Feldfehler) | Editor |
| Muster für die Unterseite | `SurveyReportView.vue` |

## Verifikation

- `npx vue-tsc --noEmit` läuft fehlerfrei, auch für `amplify/`.
- `npm test` mit den neuen Testdateien, die ins `test`-Script aufgenommen werden:
  - `test/invitationToken.test.ts`: signieren/prüfen, manipulierte Signatur, falsches `alg`/`kid`, abgelaufenes `exp`, fehlende Claims
  - `test/flowNavigation.test.ts`: Verzweigungen aller Typen, `null` → default, Reihenfolge der Bedingungen, Pflichtangaben, nicht erreichbare Antworten, Wertebereiche
  - `test/invitationLinks.test.ts`: Platzhalter `{token}`, `?`/`&`, Fallback-Origin, CSV mit BOM und Escapes
  - erweitert: `surveyFlowTranslator.test.ts` (Labels, `language`), `surveyValidation.test.ts` (`base_url`, Labels), `surveyResponsesExport.test.ts` (Spalte `Channel`)
  - in der Sandbox: `node --import tsx test/<datei>.ts`
- `npm run build` erzeugt `dist/index.html` und `dist/survey.html`.
- **Ende-zu-Ende** über eine Sandbox (`npx ampx sandbox`) oder einen Branch-Deploy:
  1. Umfrage mit Labels, Sprache `en` und Basis-URL anlegen und nach Prod deployen.
  2. 3 Einmal-Links und 2 Mehrfach-Links mit Ablaufdatum erzeugen und die CSV prüfen.
  3. Einen Link öffnen, mit Folgefragen ausfüllen und absenden; den Eintrag in DynamoDB prüfen (`channel=web`, `completed`) und im Report-CSV die Spalte `Channel`.
  4. Denselben Einmal-Link erneut öffnen → „bereits verwendet“; einen Mehrfach-Link zweimal absenden → beide werden gespeichert.
  5. Manipuliertes JWT → „ungültig“; abgelaufenes `exp` → „abgelaufen“; Umfrage ohne Prod → „nicht verfügbar“.
  6. Seite öffnen, im Editor neu nach Prod deployen, dann absenden → Hinweis „zwischenzeitlich aktualisiert“, Antworten bleiben erhalten, der Token ist danach noch nutzbar.
  7. `POST /invitations` mit Cognito-M2M-Token → 403; mit Genesys-User ohne `polly_deploy` → 403.
  8. Älterer Prod-Stand ohne `language` → Seite auf Deutsch, `<html lang="de">`.
  9. Einbettung in eine lokale HTML-Seite per iframe mit `{token}`-Weitergabe.
- `test/survey_responses.sh` um curl-Fälle für `/web-survey` erweitern (öffentlich, ohne `GENESYS_TOKEN`).
- **Barrierefreiheit:**
  - axe DevTools bzw. Lighthouse ohne Fehler
  - reiner Tastaturdurchlauf
  - VoiceOver unter macOS: Fragen, Labels, Fehlerübersicht und eingeblendete Folgefragen werden angesagt
  - 400 % Zoom

## Reihenfolge

Schritt 0 (Doku) → 1 (Datenmodell, Editor, Translator) → 2 (Backend: Token-Modul, `flowNavigation`, Lambdas, Tabelle) → 3 (Einladungs-Unterseite) → 4 (Umfrageseite) → Ende-zu-Ende-Test. Schritt 1 ist eigenständig nutzbar, die Labels erscheinen schon in der Vorschau.
