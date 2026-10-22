# Implementierungsplan: Web-Designs für die öffentliche Umfrageseite

Ergänzt `implementationsplan_web_surveys.md` um Schritt 5 (Meilenstein M6). Die Spezifikation des Web-Kanals steht in `polly_web.md`.

## Fortschritt
Nach Abschluss hier abhaken und Abweichungen vom Plan kurz notieren. Fassen Sie zusammen, was der Nutzer danach testen kann. Tragen Sie M6 auch in „Fortschritt“ von `implementationsplan_web_surveys.md` ein.

- [x] M6a Datenmodell `src/domain/webTheme/webTheme.ts` mit Test `test/webTheme.test.ts`  (2026-10-20)
  - Abweichungen:
    - Zeilenhöhen der Defaults gegen den Code geprüft: `subheading` 1.56 (`text-lg` = 28/18), `hint` 1.43 (`text-sm` = 20/14) statt 1.5; Größen ganzzahlig in px, Zeilenhöhe höchstens zwei Nachkommastellen.
    - Grenzen pro Rolle: heading 16–48, subheading 14–36, questionTitle 12–32, scaleLabel/hint 10–20, alle übrigen 12–24.
    - Eine andere `schemaVersion` als 1 und `transparentBackground` ohne Boolean machen das Design ungültig.
    - Zusätzlich im Modul: `defaultWebThemeTokens()` (tiefe Kopie), `contrastRatio`, `isWebThemeId`, Konstanten für Name (60) und Höchstzahl (50) sowie das Vorschau-Protokoll mit `parsePreviewMessage` (getestet).
    - `toCssVariables` liefert zusätzlich `--ws-page-background` (`transparent` oder die Hintergrundfarbe), damit „Hintergrund transparent“ ohne Klasse am Root auskommt.
- [x] M6b Backend: Tabelle, Lambda `web_themes`, Design in der Antwort von `web_survey`  (2026-10-20)
  - Abweichungen:
    - Reine Teile in `amplify/functions/shared/web_themes.ts` (`parseWebThemeRequest`, `toWebTheme`, `pickTheme`), getestet in `webSurveyBackend.test.ts`. `shared/caller_roles.ts` enthält zusätzlich `requireCallerRole` (Rollen + Projekt-Tag + Fehlerantwort), das `invitations` und `web_themes` gemeinsam nutzen; `loadCallerRoles` liefert jetzt auch Name und ID des Users (`updatedBy`).
    - `PUT` setzt nur dann eine Transaktion ab, wenn ein bisheriges Standard-Design die Markierung verlieren muss; bricht sie wegen gleichzeitiger Änderung ab, kommt `409 conflict`. `DELETE` eines unbekannten Designs ergibt `404 not_found`. Body höchstens 8 KB.
    - `used` beim Laden zeigt abweichend vom Plan das **Design der Umfrage** (Prod aus dem Cache, parallel zu den Designs; ist Prod nicht ladbar, das Standard-Design), `unavailable` das Standard-Design. Beim Absenden hat nur `survey_changed` ein Design; die übrigen Fehlerstatus behalten auf der Seite das schon geladene Design.
    - Optimistisches Sperren beim `PUT` (`expectedUpdatedAt`, Bedingung im Put): Ein veralteter Editor überschreibt keine fremde Änderung und holt kein gelöschtes Design zurück (`409 conflict`). Nicht abgesichert sind gleichzeitige Saves mit `isDefault` (zwei Standard-Designs möglich, heilt beim nächsten Setzen des Standards) und die Höchstzahl bei gleichzeitigem Anlegen (51 statt 50).
    - Der Design-Cache merkt sich auch eine leere Liste (Mandanten ohne Designs fragen nicht bei jedem Aufruf DynamoDB).
- [x] M6c Umfrageseite: CSS-Variablen, semantische Textklassen, `applyTheme`, Vorschaumodus  (2026-10-20)
  - Abweichungen:
    - Rollenklassen: `web-heading`, `web-subheading`, `web-intro` (Texte der Rolle body, für die Hervorhebung), `web-hint`, `web-loading` (neutraler Ladezustand) sowie die bestehenden Klassen der Fragen. Der Zeichenzähler war `text-slate-600` und nutzt jetzt `textMuted` (`#334155`, etwas dunkler).
    - Abgeleitete Töne stehen in einem `@supports (color: color-mix(…))`-Block statt als Fallback-Deklaration davor: Bei Custom Properties würde der zweite Wert immer gewinnen und ohne `color-mix()`-Unterstützung erst bei der Verwendung ungültig. `--ws-border-light` (Rahmen der Karten) wird ebenfalls aus `border` abgeleitet.
    - NPS-Zeile: Container-Query-Einheit statt `vw`, damit die Breite der Zeile und nicht die des Fensters zählt: `min(var(--ws-option-size), calc(8cqi - 2px))`; bei 320 px Seitenbreite rund 16,7 px, die Default-Größe bleibt also unverändert. Nur rechnerisch bestimmt, im Browser noch nicht ausgemessen. Bewusst hingenommen: Vergrößert ein Besucher nur die Grundschrift (ohne Zoom), wachsen die NPS-Werte nicht über diese Grenze (dokumentiert in `polly_web.md`).
    - Vorschau: `survey.html?preview=1&lang=de|en|fr`, Logik in `previewMode.ts`; die Seite meldet sich mit `polly:preview-ready`, Hervorhebung über das Attribut `data-ws-highlight` am Root. Die Beispielumfrage zeigt zusätzlich den Hinweis „Senden fehlgeschlagen“ mit sekundärem Button.
    - `startFrameHeightReporting` braucht keine Änderung: Der ResizeObserver meldet die neue Höhe nach einem Design-Wechsel von selbst.
- [x] M6d App: Pflege der Designs in den Einstellungen mit Live-Vorschau, Auswahl im Umfrage-Editor, `web_theme_id` im Translator  (2026-10-20)
  - Abweichungen:
    - Card als eigene Komponente `src/components/webTheme/WebThemesCard.vue` (nur sichtbar, wenn Setup-Metadaten vorhanden sind), Editor `WebThemeEditor.vue` ersetzt die Liste, solange er offen ist. Ohne `polly_deploy` öffnet „Ansehen“ den Editor schreibgeschützt.
    - Der Hinweis beim Löschen liest die Umfrage-Data-Table einmal komplett (Draft und Prod jeder `survey_<id>`-Zeile), weil die Umfrageliste im `appStore` nur ID und Titel kennt. Schlägt das fehl, erscheint ein allgemeiner Hinweis.
    - `useWebThemes` hält die Liste modulweit, Einstellungen und Editor-Auswahl teilen sie. `PollyApiError` hat jetzt ein optionales `code` aus dem Body (z. B. `limit_reached`).
    - Ein gelöschtes, aber noch gewähltes Design bleibt in der Auswahl als „Gelöschtes Design“ stehen, darunter der Hinweis auf den Rückfall zum Standard.
    - Kontrastverhältnisse werden abgerundet angezeigt, damit 4,47:1 nicht als „4,5:1“ erscheint.
    - Nacharbeiten aus dem Code-Review (2026-10-20): `load(true)` wartet eine laufende Abfrage ab und lädt danach neu; bei `409 conflict` bleiben die Eingaben im Editor, die Liste wird neu geladen, erneutes Speichern überschreibt bewusst. Die Auswahl im Umfrage-Editor zeigt ein gewähltes, noch nicht geladenes bzw. nicht abrufbares Design als Platzhalter statt leer. Prüfung gespeicherter Designs einmal in `parseWebTheme` (Domain), Query einmal in `shared/web_themes_table.ts`. Löschhinweis parst jede Zelle höchstens einmal. Die Seite behält bei `survey_changed` ohne `theme` das bisherige Design.
  - Testbar nach dem Deploy (Branch-Umgebung, siehe `branch_umgebung_einrichten.md`): Einstellungen → Web-Designs: Design anlegen, Textstile und Farben ändern (Vorschau folgt live, die aktive Zeile wird markiert), Kontrastwarnung erzeugen und trotzdem speichern, Standard setzen, duplizieren, löschen. Im Umfrage-Editor Design wählen, nach Prod deployen und Einladungslink öffnen.
- [ ] M6e Doku und Ende-zu-Ende-Test
  - Doku erledigt (2026-10-20): `polly_web.md` (Entscheidung 9, Abschnitt „Designs“, Endpunkte `/web-themes`, Tabelle, Feld `theme`, Sicherheit, Barrierefreiheit, Umsetzung), `survey_definition.md`, `survey_translator_for_flow.md`, `permissions.md`, `CLAUDE.md`, Entscheidungen 14–17 in `implementationsplan_web_surveys.md`, `tools/api_tests.py` (Fälle T1–T7).
  - Offen: Prüfung im Browser mit aktiver CSP (`npm run build`, `npx vite preview`), Vorschau aus fremder Origin, Ende-zu-Ende über eine Branch-Umgebung (siehe Verifikation).

## Context

Die öffentliche Umfrageseite (`survey.html`, `src/webSurvey/`) wird oft per iframe in Kundenportale eingebettet. Bisher sieht sie immer gleich aus: Polly-Blau (`#14387f`), System-Schrift und feste Größen in `src/webSurvey/webSurvey.css`.

Kunden sollen sie an ihre CI anpassen können:
- Schriftart
- Schriftgrößen, und zwar **getrennt pro Textart** (manche Kunden haben strikte Vorgaben für Überschriften, Beschreibungen, Labels usw.)
- Textfarben, Hintergrund und Akzentfarbe

Das soll ohne Deploy und ohne Eingriff von uns gehen.

## Mit dem Nutzer abgestimmte Entscheidungen

14. **Speicherort:** Die Designs liegen in einer eigenen DynamoDB-Tabelle pro Mandant und werden in der Polly-App gepflegt (Einstellungen → Web-Designs, mit Live-Vorschau). Es gibt keine Dateien, keinen Deploy und kein Data-Table-Feld.
15. **Zuordnung:** Ein Mandant hat mehrere benannte Designs, eines davon ist Standard. Jede Umfrage wählt im Editor ihr Design (`web_theme_id`, optional). Ohne Auswahl gilt das Standard-Design des Mandanten, ohne Standard-Design das eingebaute Polly-Design.
16. **Schriften:** Es gibt nur feste Schrift-Stacks des Systems. Schriftdateien werden nicht hochgeladen und es gibt keine Google Fonts, die CSP (`font-src 'self'`) bleibt unverändert. Größe, Stärke und Zeilenhöhe sind pro Textart einstellbar.
17. **Kontrast:** Kombinationen unter WCAG AA (4.5:1 Text, 3:1 Rahmen/Fokus) erzeugen im Editor nur eine Warnung, gespeichert werden kann trotzdem. Die Doku hält fest: WCAG 2.2 AA ist nur ohne Kontrastwarnung zugesichert, die Verantwortung liegt beim Mandanten.

## Grundidee

- Ein Design besteht nur aus **Tokens** (Hex-Farben, Zahlen, Enum-Schlüssel), nie aus freiem CSS. Damit ist CSS-Injection (`url()`, `@import`, Selektoren) ausgeschlossen.
- Dieselbe Prüffunktion läuft beim Speichern (Lambda), beim Ausliefern (Lambda) und noch einmal auf der Seite.
- Die Seite setzt die Tokens als CSS-Custom-Properties über die CSSOM: `document.documentElement.style.setProperty('--ws-…', value)`. Die CSP `style-src 'self'` sperrt nur Inline-`<style>` und `style`-Attribute im Markup, CSSOM-Zugriffe sind erlaubt. Das muss im Build mit aktiver CSP im Browser geprüft werden (siehe Verifikation).
- `webSurvey.css` stellt alle festen Werte auf Variablen um. Die Defaults sind die heutigen Werte, ohne Design ändert sich also nichts.
- **Effizienz:**
  - HTML, JS und CSS bleiben statisch und für alle Mandanten gleich, das Amplify-CDN cacht sie weiter.
  - Das Design kommt im bestehenden `GET /web-survey` mit (wenige hundert Byte), es gibt keinen zusätzlichen Request.
  - In der Lambda läuft das Laden der Designs parallel zum Laden von Prod und wird gecacht.
  - Im Browser genügt eine Neuberechnung der Styles, Schriftdateien werden nicht geladen.

## 1. Datenmodell

Neues Modul `src/domain/webTheme/webTheme.ts`: rein, ohne Vue, **aliasfrei** (kein `@/`). Lambda, App und Seite nutzen es gemeinsam (siehe CLAUDE.md → Stolperfallen, Lambdas importieren aus `src/`).

```ts
type WebThemeFont = "system" | "sans" | "serif" | "humanist" | "rounded";   // → feste Stacks (FONT_STACKS)
type WebTextRole =
  | "heading"        // h1: Umfragetitel, Überschrift der Status-/Fehlerseiten
  | "subheading"     // h2: Überschrift der Fehlerübersicht
  | "body"           // Begrüßung, Verabschiedung, Meldungstexte, Grundschrift
  | "questionTitle"  // legend/label der Frage
  | "description"    // Beschreibung der Frage
  | "option"         // Antwortoptionen, Skalenwerte, Eingabe im Textfeld
  | "scaleLabel"     // Min-/Max-Labels der Skala
  | "hint"           // Zeichenzähler, Hinweise, Pflichtfeld-Erklärung
  | "error"          // Fehlertexte an Feldern
  | "button";
interface WebTextStyle {
  size: number;          // px, Grenzen pro Rolle (z. B. heading 16–48, option 12–24, hint 10–20)
  weight: 400 | 500 | 600 | 700;
  lineHeight: number;    // 1.0–2.0
}
interface WebThemeTokens {
  schemaVersion: 1;
  fontFamily: WebThemeFont;
  text: Record<WebTextRole, WebTextStyle>;
  colors: {
    background, surface, text, heading, textMuted, primary, onPrimary, border, error: string  // nur #rrggbb
  };
  transparentBackground?: boolean;   // für iframes: Seitenhintergrund transparent
}
interface WebTheme { id: string; name: string; isDefault: boolean; tokens: WebThemeTokens; updatedAt: string; updatedBy?: string }
```

**Defaults** (`DEFAULT_WEB_THEME_TOKENS`) entsprechen dem heutigen Stand von `webSurvey.css` und den Tailwind-Klassen in den Templates. Beim Umsetzen gegen den aktuellen Code prüfen:

| Rolle | Größe | Stärke | Zeilenhöhe | heute |
|---|---|---|---|---|
| heading | 28 | 700 | 1.25 | `.web-heading` |
| subheading | 18 | 600 | 1.5 | `text-lg font-semibold` |
| body | 16 | 400 | 1.5 | `body` |
| questionTitle | 17 | 600 | 1.5 | `.web-question__title` |
| description | 16 | 400 | 1.5 | `.web-question__description` |
| option | 16 | 400 | 1.5 | `.web-option` (ausgewählt bleibt fest 600) |
| scaleLabel | 14 | 400 | 1.5 | `.web-scale__labels` |
| hint | 14 | 400 | 1.5 | `text-sm` |
| error | 16 | 600 | 1.5 | `.web-question__error` |
| button | 16 | 600 | 1.5 | `.web-button` |

Farben-Defaults: die heutigen `--ws-*`-Werte aus `:root`. `heading` = `text` (`#0f172a`), `onPrimary` = `#ffffff`.

Funktionen:
- `FONT_STACKS`: Schlüssel → `font-family`-String. `system` ist der heutige Stack.
- `sanitizeWebThemeTokens(input): WebThemeTokens | null`:
  - Arbeitet als Whitelist: unbekannte Felder und Rollen werden verworfen.
  - Zahlen außerhalb der Grenzen machen das Design ungültig, es gibt keine stillen Korrekturen. Farben werden per `/^#[0-9a-f]{6}$/i` geprüft.
  - Ein Teil-Design (fehlende Rollen oder Farben) wird mit den Defaults aufgefüllt. So können später neue Rollen dazukommen, ohne dass gespeicherte Designs ungültig werden.
- `toCssVariables(tokens): Record<string, string>` → `--ws-font-family`, `--ws-<rolle>-size/-weight/-line-height` und die Farben.
  - Größen werden im Editor in px angegeben und als `rem` ausgegeben (`px / 16`). Bei Standardeinstellung des Browsers sind sie damit pixelgenau, Zoom und eine größere Grundschrift des Nutzers wirken weiter (WCAG 1.4.4).
  - Abstände bleiben unabhängig von den Schriftgrößen.
- `checkThemeContrast(tokens): ContrastWarning[]` (relative Luminanz nach WCAG):
  - Grenzwert 4.5:1 für text/background, text/surface, heading/surface, textMuted/surface, primary/surface (Links), onPrimary/primary (Button) und error/surface
  - Grenzwert 3:1 für border/surface und den Fokus (primary/background)

Abgeleitete Töne (`--ws-primary-dark`, `-light`, `-accent`) berechnet die CSS mit `color-mix()` aus `--ws-primary`. Sie werden nicht gespeichert.

## 2. Backend

**Tabelle `WebSurveyThemesTable`** (`amplify/backend.ts`):
- PK `tenantId`, SK `themeId`
- Attribute `name`, `isDefault`, `tokens` (Map), `updatedAt`, `updatedBy`
- `PAY_PER_REQUEST`, `RemovalPolicy.RETAIN`
- Höchstens 50 Designs pro Mandant (prüft die Lambda)
- Der Tabellenname kommt per Env-Variable an die Lambdas, wie bei den anderen Tabellen.

**Neue Lambda `web_themes`** (`amplify/functions/web_themes/`, `defineFunction`, `attachTenantAuth`, Genesys-Bearer):
- `GET /web-themes`: Liste der Designs des Mandanten, für jeden angemeldeten App-Nutzer (Auswahl im Umfrage-Editor).
- `PUT /web-themes/{id}`: anlegen oder ändern.
  - Body `{ name, isDefault, tokens }`, `name` 1–60 Zeichen. Die Tokens laufen durch `sanitizeWebThemeTokens`, ungültige ergeben 400.
  - Wird `isDefault: true` gesetzt, verliert das bisherige Standard-Design die Markierung im selben `TransactWrite`.
  - Die Body-Größe wird über `readRequestBody` aus `shared/http.ts` begrenzt.
- `DELETE /web-themes/{id}`
- Schreiben (PUT/DELETE) erfordert serverseitig `polly_deploy`, M2M-Tokens bekommen 403 `forbidden_m2m`. Die Rollenprüfung ist dieselbe wie in `amplify/functions/invitations/handler.ts` (`loadCallerRoles`, `loadInstallationProjectTag`, `hasPollyRole` aus `src/domain/permissions/roleCheck.ts`). Sie wird nach `amplify/functions/shared/caller_roles.ts` verschoben und von beiden Lambdas genutzt.

**`web_survey`** (`amplify/functions/web_survey/handler.ts`):
- `loadTenantThemesCached(tenantId)` lädt mit **einer** Query auf PK `tenantId` alle Designs des Mandanten (≤ 50, wenige KB).
  - Sie braucht nur `tenantId` aus den Claims und läuft deshalb per `Promise.all` **parallel zu `loadProd`**.
  - 30 s Cache pro Container, nach dem Muster von `prodCache`/`tenantCache`.
- `pickTheme(themes, webThemeId)` wählt danach im Speicher: zuerst das gesetzte Design, sonst das Standard-Design, sonst `undefined` (die Seite nutzt dann ihre Defaults).
- Fehler beim Laden der Designs sind nicht fatal: Die Lambda loggt sie und liefert ohne Design aus.
- Antworten (nur bereinigte Tokens, ohne Name, ID und Bearbeiter):
  - `GET /web-survey` → `{ status: "ok", survey, theme? }`
  - `used`/`unavailable` (Signatur gültig, Mandant bekannt) → `{ status, theme? }` mit dem Standard-Design, damit auch diese Meldungen im iframe im CI erscheinen. `invalid`/`expired` haben kein Design.
  - `409 survey_changed` → neue Fassung samt Design.
- Grants: `web_survey` darf lesen, `web_themes` darf lesen und schreiben.

**Typen:** In `src/domain/survey/webSurveyTypes.ts` bekommen die Antworttypen ein optionales `theme?: WebThemeTokens`. Die Prüfung der API-Antwort in `src/domain/survey/webSurveyPage.ts` wendet `sanitizeWebThemeTokens` an. Ein ungültiges Design wird ignoriert, es ist kein Fehler.

## 3. Zuordnung zur Umfrage (Draft → Flow-JSON)

- `Survey` in `src/domain/survey/surveyTypes.ts` bekommt das optionale Feld `web_theme_id?: string`. `cloneSurvey` übernimmt es.
- Der Validator (`surveyValidator.ts`) prüft das UUID-Format; dazu kommt eine neue Feld-ID in `surveyFieldIds.ts`.
- Der Translator (`src/services/surveyFlowTranslator.ts`) schreibt `web_theme_id` nur dann auf oberste Ebene des Flow-JSON, wenn es gesetzt ist. Das sind etwa 55 Zeichen, Architect ignoriert das Feld. `flowTypes.ts` wird entsprechend ergänzt. Die Lambda reicht `web_theme_id` nicht an die Seite weiter, sie gehört nicht in `WebSurvey`.
- Folge: Ein **Wechsel** des Designs wirkt wie jede Umfrageänderung erst nach dem Deploy nach Prod. **Inhaltliche Änderungen** an einem Design wirken sofort, nach höchstens 30 s Cache, auf alle Umfragen, die es nutzen.
- Editor: `SurveyMetaForm.vue` bekommt neben Sprache und Basis-URL ein `Select` „Web-Design“ mit den Einträgen „Standard des Mandanten“ (leer) und den Designs aus `GET /web-themes`. Ist das gewählte Design gelöscht, erscheint ein Hinweis.

## 4. Pflege in der App

- `src/pages/settings.vue` bekommt eine neue Card „Web-Designs“ mit Liste, Standard-Markierung, Anlegen, Duplizieren und Löschen. Bearbeiten ist nur mit `canDeploy` möglich, sonst gibt es den Tooltip `permissions.missingDeploy`.
- Editor als neue Komponente `src/components/webTheme/WebThemeEditor.vue`:
  - Name
  - Schrift (Select der Stacks, jede Option in ihrer eigenen Schrift)
  - Tabelle „Textstile“ mit einer Zeile pro Rolle (Überschrift, Zwischenüberschrift, Fließtext, Fragetitel, Beschreibung, Antwortoptionen, Skalen-Labels, Hinweise, Fehlertexte, Button). Pro Zeile Größe in px (`InputNumber` mit den Grenzen der Rolle), Stärke (`Select`) und Zeilenhöhe. Dazu „Auf Standard zurücksetzen“ pro Zeile und für alle.
  - Fährt man mit der Maus über eine Zeile oder fokussiert sie, wird die Rolle in der Vorschau hervorgehoben (`postMessage({ type: "polly:highlight", role })`).
  - neun Farben (PrimeVue `ColorPicker` plus Hex-Eingabe)
  - Schalter „Hintergrund transparent“
  - Kontrastwarnungen aus `checkThemeContrast` an den betroffenen Feldern, mit Verhältnis (z. B. „3,2:1, mindestens 4,5:1“). Speichern bleibt möglich.
- Logik: `src/composables/useWebThemes.ts` und `src/services/webThemeService.ts` (`apiFetch` aus `services/pollyApi.ts` auf `${API_PREFIX}/web-themes`).
- **Live-Vorschau:** ein iframe auf `survey.html?preview=1` im selben Origin.
  - Im Vorschaumodus rendert die Seite eine feste Beispielumfrage aus `src/webSurvey/previewSurvey.ts`: alle Fragetypen, eine Folgefrage, Min/Max-Labels, ein Pflichtfehler, ein Hinweis und die Fehlerübersicht.
  - Sie ruft keine API auf, Absenden ist ohne Wirkung.
  - Die Tokens kommen per `postMessage({ type: "polly:theme", tokens })`. Angenommen wird nur bei `event.origin === location.origin` und `event.source === window.parent`, danach läuft `sanitizeWebThemeTokens`.
  - Die Vorschau entspricht damit exakt der echten Seite, und App-CSS und Umfrage-CSS bleiben getrennt.
- Beim Löschen eines Designs, das Umfragen im Entwurf nutzen (Liste aus dem `appStore`), erscheint ein Hinweis. Betroffene Umfragen fallen auf das Standard-Design zurück.
- i18n: neue Keys `webThemes.*` und `surveyEditor.meta.webTheme` in allen App-Locales (`de/en/fr/tlh/la`, Schema `de.ts`).

## 5. Umfrageseite (`src/webSurvey/`)

- `webSurvey.css`:
  - Alle Farben und Schriftwerte laufen über `--ws-*`: `--ws-font-family`, je Rolle `--ws-<rolle>-size/-weight/-line-height`, `--ws-heading-color` und `--ws-on-primary` (heute fest `#ffffff` am Button). Die Defaults stehen in `:root`.
  - **Jede Textrolle bekommt eine eigene semantische Klasse.** Die Templates gestalten Text heute teils mit Tailwind-Utilities, die sich nicht anpassen lassen:
    - `text-sm text-slate-600` am Zähler in `WebQuestion.vue`
    - `text-slate-700` an der Begrüßung und `text-sm text-slate-700` in `WebSurveyApp.vue`
    - `text-lg font-semibold` an der Überschrift der Fehlerübersicht

    Sie werden durch `web-intro`, `web-hint`, `web-subheading` usw. ersetzt. Tailwind bleibt nur für Layout (flex, gap, Listen).
  - Schriftgrößen sind nur in diesen Rollenklassen gesetzt, sonst nirgends.
  - Die NPS-Zeile (11 Spalten, auch bei 320 px einzeilig) begrenzt die Schrift der Skalenwerte z. B. mit `min(var(--ws-option-size), 3.6vw)`; den Wert beim Umsetzen ausmessen. Große Optionsschriften brechen so das Layout nicht.
  - Abgeleitete Töne entstehen über `color-mix()` (Chrome 111, Safari 16.2, Firefox 113). Davor steht jeweils der heutige feste Wert als Fallback-Deklaration.
  - Bei `transparentBackground` gilt `body { background: transparent }`, gesetzt über eine Variable oder eine Klasse am Root, nicht über Inline-Style.
- Neues Modul `src/webSurvey/applyTheme.ts`: setzt die Variablen aus `toCssVariables` per `setProperty` und entfernt beim Zurücksetzen alle `--ws-*` wieder.
  - `WebSurveyApp.vue` ruft es nach dem Laden, bei `survey_changed` und bei Statusseiten mit `theme` auf.
  - `main.ts` startet über `?preview=1` den Vorschaumodus mit `postMessage`-Empfang.
- Damit beim Laden im iframe nichts aufblitzt, bleibt der Ladezustand neutral (nur Text, keine Akzentflächen).
- Die Regeln aus CLAUDE.md gelten weiter: kein `v-html`, keine fremden Quellen, keine Imports der App in `src/webSurvey/`, CSP unverändert.
- `startFrameHeightReporting` meldet die Höhe nach einem Design-Wechsel über den bestehenden ResizeObserver neu; prüfen.

## 6. Doku (gemeinsam mit dem Code)

- `implementationsplan_web_surveys.md`: M6 in „Fortschritt“ mit Verweis auf diese Datei, Entscheidungen 14–17 übernehmen.
- `polly_web.md`:
  - Abschnitt „Darstellung / Designs“: Tokens, Rollen, Fallback-Kette, Cache, Vorschau-Protokoll (`polly:theme`, `polly:highlight`)
  - Antwortfeld `theme` in der API-Beschreibung
  - Sicherheit: nur Tokens, CSSOM statt Inline-CSS, Origin-Prüfung der Vorschau
  - Barrierefreiheit: AA nur ohne Kontrastwarnung zugesichert
- `survey_definition.md` und `survey_translator_for_flow.md`: `web_theme_id`
- `permissions.md`: Web-Designs bearbeiten erfordert `polly_deploy`, lesen darf jeder App-Nutzer.
- `CLAUDE.md`: Lambda `web_themes`, Tabelle, `domain/webTheme/`, neue Testdatei in der Testliste.

## Kritische Dateien

- Seite: `src/webSurvey/webSurvey.css`, `main.ts`, `WebSurveyApp.vue`, `components/WebQuestion.vue`
- Backend: `amplify/backend.ts`, `amplify/functions/web_survey/handler.ts`, `amplify/functions/invitations/handler.ts` (Rollenprüfung auslagern)
- Domain: `src/domain/survey/{surveyTypes,flowTypes,webSurveyTypes,webSurveyPage,surveyValidator,surveyFieldIds}.ts`
- App: `src/services/surveyFlowTranslator.ts`, `src/components/survey/SurveyMetaForm.vue`, `src/pages/settings.vue`

## Wiederverwendung

| Baustein | Ort |
|---|---|
| `attachTenantAuth`, `resolveTenantContext` | `amplify/backend.ts`, `amplify/functions/shared/tenant_auth.ts` |
| Rollenprüfung (`loadCallerRoles`, `loadInstallationProjectTag`) | `amplify/functions/invitations/handler.ts` → `shared/caller_roles.ts` |
| `hasPollyRole` | `src/domain/permissions/roleCheck.ts` |
| `readRequestBody`, `fetchWithTimeout` | `amplify/functions/shared/http.ts` |
| Cache-Muster | `prodCache`/`tenantCache` in `amplify/functions/web_survey/handler.ts` |
| `apiFetch`, `API_PREFIX` | `src/services/pollyApi.ts`, `src/constants/apiConstants.ts` |
| Muster Einstellungs-Card | `src/pages/settings.vue` |
| `startFrameHeightReporting` | `src/webSurvey/frameHeight.ts` |

## Verifikation

- `npx vue-tsc --noEmit` läuft fehlerfrei (auch `amplify/`).
- `npm test`, dazu neu `test/webTheme.test.ts` (ins `test`-Script in `package.json` aufnehmen; in der Sandbox `node --import tsx test/webTheme.test.ts`):
  - Sanitizer: unbekannte Felder und Rollen, `url(...)`/`;`/`expression` in Farben, Grenzen pro Rolle, Auffüllen eines Teil-Designs
  - Kontrast mit bekannten Paaren: Schwarz/Weiß 21:1, `#767676`/Weiß ≈ 4.54:1
  - `toCssVariables` (px → rem, alle Rollen)
- Erweiterte Tests:
  - `surveyFlowTranslator.test.ts`: `web_theme_id` nur, wenn gesetzt
  - `surveyValidation.test.ts`: UUID-Format
  - `webSurveyPage.test.ts`: Antwort mit gültigem, ungültigem und fehlendem `theme`
  - `webSurveyBackend.test.ts`: `pickTheme`-Fallback-Kette
- `npm run build`, dann `npx vite preview`:
  - Mit aktiver CSP greifen die Variablen aus `setProperty`, die Konsole zeigt keine CSP-Verletzung.
  - `survey.html?preview=1` per iframe aus einer fremden Origin nimmt keine Tokens an.
- Ende-zu-Ende über eine Branch-Umgebung (`branch_umgebung_einrichten.md`):
  1. Zwei Designs anlegen, eines als Standard markieren. Eine Kombination mit Kontrastwarnung speichern: Die Warnung erscheint, gespeichert wird trotzdem.
  2. Umfrage A ohne Design und Umfrage B mit Design 2 nach Prod deployen und je einen Link öffnen: A hat das Standard-Design, B Design 2.
  3. Design 2 ändern: Nach ≤ 30 s zeigt Link B die Änderung ohne Deploy.
  4. Design 2 löschen: B fällt auf das Standard-Design zurück. Ein benutzter Einmal-Link zeigt seine Meldung im Standard-Design.
  5. Einbettung per iframe mit „Hintergrund transparent“, Höhenanpassung prüfen.
  6. Ohne `polly_deploy`: Liste sichtbar, Bearbeiten gesperrt. `PUT /web-themes/…` liefert 403.
  7. axe/Lighthouse mit dem Default-Design ohne Fehler.
  8. Ein Design mit der Höchstgröße jeder Rolle bei 320 px Breite und 400 % Zoom: kein horizontales Scrollen, NPS bleibt einzeilig. Ein Design mit abweichenden Werten pro Rolle: In den DevTools hat jedes Element genau den Wert seiner Rolle.
- `tools/api_tests.py`: Fälle für `GET /web-themes` und `PUT` ohne Rolle.

## Reihenfolge

M6a (Datenmodell und Tests) → M6c (Seite auf Variablen und Rollenklassen umstellen; ohne Design sieht sie unverändert aus) → M6b (Backend) → M6d (App: Einstellungen, Vorschau, Editor-Auswahl, Translator) → M6e (Doku, Ende-zu-Ende).
