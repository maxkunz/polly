# CLAUDE.md

Genesys-Cloud-App ("Polly"): Umfragen im Vue-Frontend pflegen, als Data-Table-Zeilen in Genesys ablegen, vom Architect Call Flow abspielen lassen; Antworten landen über ein Amplify-Gen-2-Backend in DynamoDB.

## Befehle

- `npm run dev` – Vite-Dev-Server. `/api` wird auf eine **fest verdrahtete** API-Gateway-URL in `vite.config.ts` proxied (nicht aus `amplify_outputs.json`); bei eigenem Backend dort anpassen.
- `npm run build` – nur Frontend (`dist/`, gitignored). Kein Typecheck im Build.
- `npm test` – führt `test/surveyFlowTranslator.test.ts` per `tsx` aus (eigene Mini-Test-Funktion, kein Vitest/Jest). Weitere Testdateien müssen explizit ins `test`-Script aufgenommen werden.
  - Einzeltest: keinen Filter vorhanden – Datei direkt ausführen: `npx tsx test/<datei>.ts`.
  - Im Claude-Sandbox scheitert `tsx` mit `listen EPERM …tsx-*.pipe`; dann `node --import tsx test/surveyFlowTranslator.test.ts` verwenden.
- Typecheck (kein Script, kein Linter/Formatter im Projekt): `npx vue-tsc --noEmit`. Bekannte, zu ignorierende Fehler: `primevue/toasteventbus` in `node_modules` und fehlendes `./amplify_outputs.json` in `vite.config.ts`.
- `test/survey_responses.sh` – curl-Suite gegen die **deployte** API; braucht `GENESYS_TOKEN` (Bearer aus dem Genesys-Portal), optional `API_URL`, `GENESYS_REGION`. Schreibt echte Daten.
- Backend-Deploy nur über Amplify-Pipeline (`amplify.yml` → `npx ampx pipeline-deploy`). Lokal ggf. `npx ampx sandbox` (erzeugt `amplify_outputs.json`, `.amplify/`).

## Architektur

- **Frontend** (`src/`, Vue 3 + Pinia + PrimeVue 4 + Tailwind 4): Läuft als Genesys-App-Integration, Login per Implicit Grant (`services/genesys_helper.ts`), alle Genesys-Calls über `purecloud-platform-client-v2`-Instanzen im `appStore`.
- **Speicher der Umfragen ist eine Genesys Data Table** (`POLLY_DATA_TABLE_NAME` in `constants/surveyConstants.ts`), keine eigene DB. Zeilen: `survey_<uuid>` (Felder Draft/Stage/Prod/Backup), `survey_list` (Index im Feld Draft), `queue_mapping` (im Feld Prod), dazu `__meta` / `__lock`.
- **Draft vs. Flow-Format**: Draft = baumförmiges Editor-JSON (`domain/survey/surveyTypes.ts`, validiert von `surveyValidator.ts`). Stage/Prod = flaches, verkettetes JSON für Architect, erzeugt von `services/surveyFlowTranslator.ts`. Deploy nach Prod kopiert vorher Prod → Backup (Rollback).
- **Editor-Logik** liegt in `composables/useSurvey*.ts`, Data-Table-I/O in `services/surveyService.ts` und `services/genesys/*`; Komponenten in `components/survey/` sind nur Darstellung.
- **Backend** (`amplify/backend.ts`, CDK direkt): eine HttpApi, Lambdas `onboarding`, `survey_responses` (Flow schickt Antworten schrittweise), `survey_cleanup` (EventBridge, markiert Sessions als `timed_out`), `question_answers` (Legacy/PoC). Mandantenauflösung in `amplify/functions/shared/tenant_auth.ts` (Cognito-M2M-Token **oder** Genesys-Bearer + `x-genesys-region`).
- **Setup/Uninstall** (`services/SetupOrchestrator.ts`, `SetupUninstall.ts`): legt Division, Data Table, OAuth-Client, Data Action an und merkt sich alles in `meta.setup` der `__meta`-Zeile – Uninstall ist davon abhängig.

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
- **Legacy „Questions“**: `pages/questions.vue`, `domain/Questions.ts`, `question_answers`-Lambda und `QuestionAnswersTable` stammen aus dem ursprünglichen Template (README beschreibt noch diesen Stand). Das Modul ist in `modules.ts` deaktiviert; neue Arbeit gehört in den Surveys-Bereich.
- Genesys-Region `mypurecloud.de` ist an mehreren Stellen hart codiert (Login, Backend-Default, Vite-Proxy).
- Data-Table-Zellen enthalten JSON als String; beim Lesen wird teils `row.Draft ?? row.draft` geprüft – Groß-/Kleinschreibung der Spalten beachten.
- DynamoDB-Tabellen haben `RemovalPolicy.RETAIN`: Umbenennen/Schlüsseländerung in `backend.ts` erzeugt neue Tabellen, alte bleiben liegen.
- Nicht committen/nicht bearbeiten: `dist/`, `amplify_outputs*.json`, `.amplify/` (generiert). `.env*` ist für Agents gesperrt.
- Dark Mode von PrimeVue ist bewusst aus (`darkModeSelector: false` in `main.ts`).
