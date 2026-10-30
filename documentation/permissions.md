# Berechtigungen (Frontend-Rollen)

Polly prüft im Frontend drei Genesys-Cloud-Rollen des eingeloggten Users. Die Prüfung dient nur als Schutz gegen versehentliche Fehlbedienung. Sie ist **keine** Sicherheitsgrenze: Die Data Tables und die API werden serverseitig nicht zusätzlich abgesichert. Ausnahmen mit serverseitiger Prüfung sind unten beschrieben: Einladungslinks, Web-Designs und der MCP-Zugang für KI-Clients.

| Rolle | Erlaubt |
|---|---|
| `<projectTag>_polly_write` (oder `polly_write`) | Umfragen anlegen, klonen, bearbeiten/speichern, löschen |
| `<projectTag>_polly_deploy` (oder `polly_deploy`) | Deploy nach Stage und Prod, Rollback, Queue-Mapping speichern, Einladungslinks für Web-Umfragen erzeugen, Webvorschau des Stage-Stands öffnen, Web-Designs anlegen/ändern/löschen (Einstellungen) |
| `<projectTag>_polly_reporting` (oder `polly_reporting`) | Umfrageergebnisse exportieren (CSV-Download im Report) |

- Ohne Rolle hat ein User nur Lesezugriff. Er kann Umfragen im schreibgeschützten Editor ansehen und die Report-Vorschau öffnen, aber keine Ergebnisse exportieren.
- Die Rollen sind unabhängig voneinander. Ein User nur mit `polly_deploy` kann deployen, aber nicht editieren.
- Fehlende Rechte zeigen sich als deaktivierte Buttons mit Tooltip und als Hinweisbanner im Editor bzw. in der Deploy-Ansicht.
- Read-only-User nehmen kein Umfrage-Lock und sehen keinen Lock-Konflikt-Dialog.

**Ausnahme Einladungslinks:** `POST /invitations` und `POST /invitations/preview` (Webvorschau) prüfen `polly_deploy` zusätzlich **serverseitig** (Rollen des Aufrufers über `/api/v2/users/me?expand=authorization`, gleiche Namenslogik inkl. `projectTag`-Präfix), da der Endpunkt gültige Einladungen signiert. Cognito-M2M-Tokens werden dort mit `403` abgelehnt. Siehe [polly_web.md](polly_web.md).

**Ausnahme Web-Designs:** `PUT`/`DELETE /web-themes/{id}` prüfen `polly_deploy` ebenso serverseitig (gemeinsame Prüfung in `amplify/functions/shared/caller_roles.ts`), M2M-Tokens bekommen `403 forbidden_m2m`. `GET /web-themes` (Liste, Auswahl im Umfrage-Editor) darf jeder angemeldete App-Nutzer; ohne `polly_deploy` öffnet die Einstellungsseite Designs nur zum Ansehen. Die Wahl des Designs einer Umfrage ist Teil des Drafts und erfordert wie jede Änderung `polly_write`.

## MCP: serverseitige Prüfung

Der MCP-Zugang für KI-Clients ([polly_mcp.md](polly_mcp.md)) handelt im Namen einer angemeldeten Person und schreibt in die Data Table. Anders als die App prüft er die Rollen deshalb **bei jedem Tool-Aufruf serverseitig** (Rollen des Aufrufers über `/api/v2/users/me?expand=authorization` mit dem gespeicherten Genesys-Token, gleiche Namenslogik inkl. `projectTag`-Präfix, Cache höchstens 60 Sekunden, `shared/caller_roles.ts`). Die Rolle kommt nie aus dem MCP-Token oder der Eingabe. Cognito-M2M-Tokens sind für MCP nicht zugelassen. Ohne mindestens eine Polly-Rolle wird schon der Login abgelehnt.

| Tool | Fachliches Recht | Rolle |
|---|---|---|
| `get_authoring_guide` | – | jede Polly-Rolle |
| `list_surveys`, `get_survey` | `surveys.read` | jede Polly-Rolle |
| `list_web_themes` | `themes.read` | jede Polly-Rolle (nur mit Feature `web_survey`) |
| `validate_survey` | – | `polly_write` |
| `create_survey`, `begin_edit`, `save_draft`, `end_edit` | – | `polly_write` |
| `deploy_survey` (Stage und Prod), `rollback_survey` | – | `polly_deploy` |
| `get_results_summary`, `get_aggregates`, `get_responses` | `reporting.read` | `polly_reporting` |

- Die Spalte „Fachliches Recht“ nennt den entsprechenden Scope der Kunden-API ([polly_customer_api.md](polly_customer_api.md)), damit beide Zugänge dieselben Begriffe verwenden. Scopes gelten für MCP nicht, maßgeblich ist die Rolle.
- Wer mehrere Rollen hat, darf die Tools aller seiner Rollen nutzen. Wer nur `polly_reporting` hat, kann also auswerten und lesen, aber nichts schreiben.
- **Nicht per MCP:** Löschen von Umfragen, Queue-Mapping, Einladungslinks, Web-Designs schreiben.
- Das Umfrage-Lock gilt zusätzlich (serverseitig erzwungen, siehe [polly_mcp.md](polly_mcp.md), Abschnitt „Lock“).
- Wer MCP für den Mandanten ein- oder ausschaltet, braucht `polly_deploy` (serverseitig in `mcp_admin`, Cognito-Tokens bekommen `403`).

## Einrichtung in Genesys

1. Das Setup legt die Rollen mit dem Projekt-Tag als Prefix an: `<projectTag>_polly_write`, `<projectTag>_polly_deploy` und `<projectTag>_polly_reporting` (in `meta.setup.frontendRoles`, Uninstall löscht sie wieder). Sie benötigen keine Permissions, entscheidend ist nur der Name. Groß-/Kleinschreibung wird ignoriert. Geprüft wird die Rolle mit dem Prefix der eigenen Installation **oder** die unpräfixierte Rolle (`polly_write`, `polly_deploy`, `polly_reporting`, Legacy-Check). Die präfixierten Rollen berechtigen nur in der eigenen Installation, sodass mehrere Installationen in einer Org getrennt berechtigt werden können. Die unpräfixierte Rolle gilt dagegen in allen Installationen und eignet sich daher für Kunden mit mehreren Mandanten/Installationen als Rolle für „Meta-Admins“, die überall berechtigt sein sollen.
2. Die Rollen den gewünschten Usern zuweisen.
3. Der Implicit-Grant-OAuth-Client des Frontends braucht ggf. den Scope `authorization:readonly`, damit `GET /api/v2/users/me?expand=authorization` die Rollen liefert. Schlägt der Abruf fehl, arbeitet der User read-only (Warnung in der Browser-Konsole).

## Technik

- Die Rollennamen stehen als Konstanten in `src/constants/permissionConstants.ts`.
- Die Rollen werden beim Login geladen (`services/genesys_helper.ts`, `loadCurrentUserRoles`). Sie liegen in `appStore.currentUser.roles`.
- Die Getter `appStore.canWrite`, `appStore.canDeploy` und `appStore.canExport` liefern die Berechtigungen.
- Die Rollen werden höchstens alle `ROLE_CACHE_TTL_MINUTES` (5 Minuten) neu gelesen (`appStore.refreshRoles`). Auslöser sind ein Seiten-/Ansichtswechsel, die Rückkehr in den Browser-Tab und jede schreibende Aktion (Speichern, Löschen, Neu anlegen, Deploy, Queue-Mapping, Export) direkt vor der Ausführung.
- Rollenänderungen in Genesys greifen damit spätestens nach 5 Minuten. Schlägt ein Refresh fehl, bleiben die bisherigen Rollen erhalten.
