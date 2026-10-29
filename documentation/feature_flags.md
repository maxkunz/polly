# Feature Flags

Feature Flags schalten Funktionen pro Installation ein oder aus. Sie gelten nur im Frontend und schützen dort vor Fehlbedienung. Wie bei den Rollen (siehe [permissions.md](permissions.md)) sind sie **keine** Sicherheitsgrenze: Das Backend prüft sie nicht.

## Speicherort

Die Flags stehen in der Zeile `__meta` der Umfrage-Data-Table (`<projectTag>_polly_surveys`), Feld `Draft`, als Objekt `features`:

```json
{
  "appTitle": "demo",
  "setup": { "...": "..." },
  "features": { "web_survey": true }
}
```

- Ein Flag ist nur aktiv, wenn der Wert genau `true` ist. Fehlende Flags und nicht-boolesche Werte (z. B. `"true"`) gelten als **aus**.
- Unbekannte Keys bleiben beim Lesen erhalten (für neuere App-Versionen). Angezeigt werden sie nicht.

## Pflege

- **Onboarding:** Im Setup-Assistenten (Schritt „Installation“, Abschnitt „Funktionen“) wählt man die Flags aus. Die Vorauswahl kommt aus der Registry (`defaultOnSetup`). Das Setup schreibt die Auswahl nach `__meta`.
- **Nach der Installation** ändert man Flags nur direkt in der Data Table. Die App hat dafür bewusst keine Oberfläche. Die Änderung wirkt nach dem Neuladen der App.
- **Bestehende Installationen** (vor Einführung der Flags) haben keinen Block `features`, dort sind alle Flags aus. Zum Freischalten ergänzt man im JSON des Felds `Draft` der Zeile `__meta` z. B. `"features": {"web_survey": true}`. Die übrigen Felder bleiben unverändert.
- **Einstellungen → Setup** zeigt unter „Aktivierte Funktionen“ nur die aktiven Flags.

## Flags

| Key | Wirkung, wenn aus |
|---|---|
| `web_survey` | Ausgeblendet werden: Einstellungen → Web-Designs und Standard-Basis-URL; im Umfrage-Editor Basis-URL, Sprache, Design und der Button „Einladungslinks“ (auch `?invite=1` öffnet die Einladungsansicht nicht). Beim Speichern einer Umfrage werden die Standardwerte gesetzt: `base_url: ""`, `language: "de"`, `web_theme_id` entfernt. Der Validator prüft diese Felder dann nicht. Schon erzeugte Einladungslinks und die öffentliche Umfrageseite funktionieren weiter. |

## Technik

- Registry und reine Logik: `src/domain/features/featureFlags.ts` (`FEATURE_FLAGS`, `normalizeFeatures`, `isFeatureEnabled`, `enabledFeatures`, `defaultSetupFeatures`). Das Modul ist aliasfrei, Lambdas können es also importieren.
- `Meta.features` (`src/domain/Meta.ts`) wird beim App-Start mit der Zeile `__meta` geladen.
- Abfrage in der App: `app.hasFeature("<key>")`, für `web_survey` zusätzlich `app.webSurveyEnabled` (`src/stores/appStore.ts`).
- **Neues Flag:** einen Eintrag in `FEATURE_FLAGS` anlegen und die Texte `features.<key>.label` / `.description` in allen Locales ergänzen. Danach fragt man es mit `app.hasFeature("<key>")` ab und trägt es oben in die Tabelle ein.
