# CLAUDE.md

Genesys-Cloud-App ("Polly"): Umfragen im Vue-Frontend pflegen, als Data-Table-Zeilen in Genesys ablegen, vom Architect Call Flow abspielen lassen; Antworten landen über ein Amplify-Gen-2-Backend in DynamoDB.

## Befehle

- `npm run dev` – Vite-Dev-Server. `/api` wird auf eine **fest verdrahtete** API-Gateway-URL in `vite.config.ts` proxied (nicht aus `amplify_outputs.json`); bei eigenem Backend dort anpassen.
- `npm run build` – nur Frontend (`dist/`, gitignored). Kein Typecheck im Build.
- `npm test` – führt `test/surveyFlowTranslator.test.ts`, `surveyResponsesExport.test.ts`, `surveyDeletion.test.ts` und `genesysRegion.test.ts` nacheinander per `tsx` aus (eigene Mini-Test-Funktion, kein Vitest/Jest). Weitere Testdateien müssen explizit ins `test`-Script aufgenommen werden.
  - Einzeltest: keinen Filter vorhanden – Datei direkt ausführen: `npx tsx test/<datei>.ts`.
  - Im Claude-Sandbox scheitert `tsx` mit `listen EPERM …tsx-*.pipe`; dann `node --import tsx test/surveyFlowTranslator.test.ts` verwenden.
- Typecheck (kein Script, kein Linter/Formatter im Projekt): `npx vue-tsc --noEmit`. Muss fehlerfrei durchlaufen (prüft auch `amplify/`). Fehlerhafte Typen in `node_modules` (z. B. PrimeVue-Eventbus) werden per `skipLibCheck` ignoriert.
- `test/survey_responses.sh` – curl-Suite gegen die **deployte** API; braucht `GENESYS_TOKEN` (Bearer aus dem Genesys-Portal), optional `API_URL`, `GENESYS_REGION`. Schreibt echte Daten.
- Backend-Deploy nur über Amplify-Pipeline (`amplify.yml` → `npx ampx pipeline-deploy`). Lokal ggf. `npx ampx sandbox` (erzeugt `amplify_outputs.json`, `.amplify/`).

## Architektur

- **Frontend** (`src/`, Vue 3 + Pinia + PrimeVue 4 + Tailwind 4): Läuft als Genesys-App-Integration, Login per Implicit Grant (`services/genesys_helper.ts`), alle Genesys-Calls über `purecloud-platform-client-v2`-Instanzen im `appStore`.
- **Speicher der Umfragen ist eine Genesys Data Table**, keine eigene DB. Das Setup legt `<projectTag>_polly_surveys` (Umfragen + `__meta`/`__lock`) und `<projectTag>_polly_mapping` an und merkt sich beide in `meta.setup.dataTable` / `mappingDataTable`; die App bekommt die IDs als `datatable_id` / `mapping_datatable_id` in der Start-URL. Keine festen Tabellennamen im Code. Zeilen: `survey_<uuid>` (Felder Draft/Stage/Prod/Backup), `survey_list` (Index im Feld Draft), dazu `__meta` / `__lock`.
- **Queue-Mapping** liegt in einer zweiten, eigenen Genesys Data Table mit Spalten `QueueName` (Key), `SurveyId`, `DeliveryRate` – eine Zeile pro Queue, siehe `documentation/datatablerow_queue_mapping.md`.
- **Draft vs. Flow-Format**: Draft = baumförmiges Editor-JSON (`domain/survey/surveyTypes.ts`, validiert von `surveyValidator.ts`). Stage/Prod = flaches, verkettetes JSON für Architect, erzeugt von `services/surveyFlowTranslator.ts`. Deploy nach Prod kopiert vorher Prod → Backup (Rollback).
- **Editor-Logik** liegt in `composables/useSurvey*.ts`, Data-Table-I/O in `services/surveyService.ts` und `services/genesys/*`; Komponenten in `components/survey/` sind nur Darstellung.
- **Backend** (`amplify/backend.ts`, CDK direkt): eine HttpApi, Lambdas `onboarding`, `survey_responses` (Flow schickt Antworten schrittweise), `survey_responses_export` (CSV-Export in Teilabrufen, nur lesend), `survey_responses_delete` (löscht Ergebnisse gelöschter Umfragen asynchron über SQS, prüft selbst gegen die Data Table), `survey_cleanup` (EventBridge, markiert Sessions als `timed_out`). Mandantenauflösung in `amplify/functions/shared/tenant_auth.ts` (Cognito-M2M-Token **oder** Genesys-Bearer + `x-genesys-region`).
- **Berechtigungen** (nur Frontend, Bedienschutz): Genesys-Rollen `polly_write` (Umfragen anlegen/bearbeiten/löschen) und `polly_deploy` (Deploy/Rollback/Queue-Mapping), `polly_reporting` (Ergebnis-Export). Sie werden beim Login geladen, die Getter `canWrite`/`canDeploy`/`canExport` im `appStore` liefern die Rechte, siehe `documentation/permissions.md`.
- **Setup/Uninstall** (`services/SetupOrchestrator.ts`, `SetupUninstall.ts`): legt Division (oder übernimmt eine bestehende, `createdBySetup: false`), Umfrage- und Mapping-Data-Table, OAuth-Client, Data Action an und merkt sich alles in `meta.setup` der `__meta`-Zeile – Uninstall ist davon abhängig.

## Spezifikation = `documentation/`

Die Markdown-Dateien in `documentation/` sind die fachliche Spezifikation (Constraints, JSON-Formate, API). Bei Änderungen an Editor-Format, Translator, Data-Table-Zeilen oder API **Doku und Code gemeinsam anpassen**. Die Test-Fixtures in `test/surveyFlowTranslator.test.ts` stammen aus den Beispielen in `survey_definition.md` / `survey_translator_for_flow.md`.

Nicht offensichtliche Regeln daraus (Auszug):
- `name` von Umfrage/Fragen wird automatisch aus Titel + erste 8 Zeichen der ID erzeugt und danach nie mehr geändert (Reporting-Schlüssel) – nicht editierbar machen, nicht neu generieren.
- Max. 20 Fragen inkl. aller (beliebig tief verschachtelten) Folgefragen.
- Flow-JSON für `rating`/`nps`: immer alle drei Bedingungen in fester Reihenfolge `equals`, `less_than`, `greater_than`; fehlende mit unerfüllbarem Wert (-1 / -1000 / 1000) und `next_question_id: null`.
- Fehlende Folgefrage ⇒ `null`, Flow fährt mit `default_next_question_id` fort (nicht Umfrage-Ende).
- Architect liest max. 32.000 Zeichen pro String – Zelleninhalte (v. a. Prod/Stage-JSON) klein halten.

## Konventionen

- UI-Texte **immer** über vue-i18n (`src/i18n/locales/de.ts` ist das Schema, `en.ts` muss dieselben Keys haben). Default/Fallback ist `de`. PrimeVue-Locales separat in `src/i18n/primevue/`.
- Code-Kommentare, Doku und Commit-Messages auf Deutsch.
- Frontend: `<script setup lang="ts">`, Alias `@/` → `src/`. Einrückung mit Tabs im Frontend, 2 Spaces in `amplify/`.
- Module/Sidebar werden in `src/app/modules.ts` registriert (`isActive` steuert Sichtbarkeit).
- Neue Lambda: `defineFunction` in `amplify/functions/<name>/resource.ts`, dann in `backend.ts` Tabelle granten, Env-Vars setzen, ggf. `attachTenantAuth(fn)` und Route an `httpApi` hängen. Ressourcennamen hängen an `envSuffix` (App-ID + Branch).

## Stolperfallen

- **Zwei Lock-Mechanismen**: `services/lockingService.ts` (App-weites Lock in `__lock`, TTL 15 min) und das Umfrage-Lock im Feld `lock` der `survey_<id>`-Zeile (`surveyService.ts` + `useSurveyLock.ts`, TTL `SURVEY_LOCK_TTL_MINUTES` = 60). Nicht verwechseln.
- **Genesys-Region** wird zur Laufzeit bestimmt: Frontend über `getGenesysRegion()` (`services/genesysRegion.ts`) aus `gcHostOrigin` der Start-URL (in `sessionStorage` über den Login-Redirect gemerkt), Backend aus Header `x-genesys-region` bzw. `genesysRegion` im Mandanteneintrag. Die Env-Variable `GENESYS_REGION` (Default `mypurecloud.de`, wirkt erst nach Build/Deploy) ist nur Fallback (Frontend: `define` in `vite.config.ts`, Backend: Lambda-Env → `DEFAULT_GENESYS_REGION`). Das Backend akzeptiert nur Regionen aus `amplify/functions/shared/genesys_regions.ts` (sonst könnte über den Header ein fremder Host als Genesys Tokens „bestätigen“); ein Test prüft die Liste gegen `PureCloudRegionHosts` des SDK. Keine Region-Strings direkt in den Code schreiben. Achtung: `services/genesys/region.ts` exportiert eine zweite, strengere `getGenesysRegion()` (wirft ohne `gcHostOrigin`, keine Prüfung gegen bekannte Regionen), die `appStore` beim Start verwendet.
- Data-Table-Zellen enthalten JSON als String. Spaltennamen sind case-sensitiv und kommen aus dem Schema im Setup (`Draft`/`Stage`/`Prod`/`Backup`/`lock`); auch `__meta` liegt im Feld `Draft`.
- DynamoDB-Tabellen haben `RemovalPolicy.RETAIN`: Umbenennen/Schlüsseländerung in `backend.ts` erzeugt neue Tabellen, alte bleiben liegen.
- Nicht committen/nicht bearbeiten: `dist/`, `amplify_outputs*.json`, `.amplify/` (generiert). `.env*` ist für Agents gesperrt.
- Dark Mode von PrimeVue ist bewusst aus (`darkModeSelector: false` in `main.ts`).
