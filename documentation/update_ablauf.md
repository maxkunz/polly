# Polly-Update: Ablauf und Zuständigkeiten

Übersicht, wer bei einem Polly-Update was tut. Der Stand ist ein Entwurf und wird nach und nach ergänzt.

## Ablauf

| # | Schritt | Wer | Wann |
|---|---|---|---|
| 1 | Flow in Architect anpassen und den aktualisierten Flow in `main` einchecken | Flow-Entwickler (Manu) | nur bei Flow-Änderungen |
| 2 | Frontend-/Backend-Änderungen einchecken. Vorher `npm test` und `npx vue-tsc --noEmit` ausführen, Doku in `documentation/` mit anpassen | Entwickler (André / Max) | nur bei Frontend-/Backend-Änderungen (ein Update kann auch nur den Flow betreffen) |
| 3 | Deployment-Tag auf `main` erzeugen | Entwickler | immer |
| 4 | Update in AWS deployen (Konverter-Skript von Lenny, siehe unten) | Lenny | immer |
| 5 | In der Anwendung "Deploy Flow" klicken | Person mit Rolle `polly_deploy` | nur wenn der Flow angepasst wurde |
| 6 | Prüfen, ob das Update läuft (siehe "Prüfung") | Entwickler, Tester, später der Kunde | immer |

## Hosting in der AWS ESC

Dort gibt es kein Amplify, die Amplify-Pipeline (`amplify.yml`) wird also nicht genutzt. Stattdessen deployt Lenny das Update mit einem Konverter-Skript in AWS.

## Prüfung

Nach dem Deploy prüfen:

* Entwickler
* Tester
* später auch der Kunde

Ein 404 `{"message":"Not Found"}` nach dem Deploy kommt vom API Gateway, nicht von der Lambda. Dann ist die Route nicht live geschaltet. Hinweise stehen in `branch_umgebung_einrichten.md`.

## Je nach Situation nötig

* Botflow: Die Setup-Karte (nur Dev-Ansicht in den Einstellungen) hat den Button "Botflow aktualisieren". Er ersetzt den Botflow in Genesys durch die mitgelieferte Vorlage, eigene Flow-Anpassungen werden überschrieben. Andere Ressourcen (Data Tables, OAuth-Client, Data Action) aktualisiert er nicht.
* Neue Ressourcen in den Mandanten (Data-Table-Spalten, OAuth-Client, Redirect-URIs, Data Action) müssen bei Bedarf manuell nachgezogen werden. Einen automatischen Weg dafür gibt es im Setup nicht.
* Neue Umgebungsvariablen, Secrets oder Feature Flags (`__meta`-Zeile) müssen vor dem Deploy vorhanden sein.
* Rollback: Umfragen per Prod → Backup in der App, AWS per Rollback auf den vorherigen Tag. Der genaue Ablauf ist noch zu beschreiben.
* Mehrere Genesys-Orgs: Flow-Import und "Deploy Flow" sind pro Org nötig.
