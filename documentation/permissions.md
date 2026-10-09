# Berechtigungen (Frontend-Rollen)

Polly prüft im Frontend drei Genesys-Cloud-Rollen des eingeloggten Users. Die Prüfung dient nur als Schutz gegen versehentliche Fehlbedienung. Sie ist **keine** Sicherheitsgrenze: Die Data Tables und die API werden serverseitig nicht zusätzlich abgesichert.

| Rolle | Erlaubt |
|---|---|
| `<projectTag>_polly_write` (oder `polly_write`) | Umfragen anlegen, klonen, bearbeiten/speichern, löschen |
| `<projectTag>_polly_deploy` (oder `polly_deploy`) | Deploy nach Stage und Prod, Rollback, Queue-Mapping speichern |
| `<projectTag>_polly_reporting` (oder `polly_reporting`) | Umfrageergebnisse exportieren (CSV-Download im Report) |

- Ohne Rolle hat ein User nur Lesezugriff. Er kann Umfragen im schreibgeschützten Editor ansehen und die Report-Vorschau öffnen, aber keine Ergebnisse exportieren.
- Die Rollen sind unabhängig voneinander. Ein User nur mit `polly_deploy` kann deployen, aber nicht editieren.
- Fehlende Rechte zeigen sich als deaktivierte Buttons mit Tooltip und als Hinweisbanner im Editor bzw. in der Deploy-Ansicht.
- Read-only-User nehmen kein Umfrage-Lock und sehen keinen Lock-Konflikt-Dialog.

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
