# API-Zugänge für Kunden einrichten (Betrieb)

Diese Anleitung beschreibt, wie das Betriebsteam Zugänge zur Kunden-API (`/ext/v1/…`) anlegt, übergibt, sperrt und erneuert. Was der Kunde mit dem Zugang machen kann, steht in der Kundenspezifikation [polly_customer_api.md](polly_customer_api.md).

> **Stand:** Entwurf. Die Verwaltung der Zugänge und die Anmeldung stehen. Die APIs selbst (Reporting, Einladungen, Umfragedetails) stehen, der Ende-zu-Ende-Test folgt, siehe [implementationsplan_external_api.md](implementationsplan_external_api.md).

Ein Zugang (API-Client) ist ein Cognito-Client mit Client Credentials im User Pool der Umgebung und ein Eintrag in der DynamoDB-Tabelle `ApiClientsTable`. Der Eintrag ordnet den Client einem Mandanten zu. Jeder Aufruf der Kunden-API prüft:

1. das Token
2. den Scope der Route
3. ob der Client in `ApiClientsTable` mit Status `ACTIVE` steht
4. ob der Mandant `APPROVED` ist

## 1. Voraussetzungen

- **Mandant installiert und freigegeben:** Der Kunde hat Polly über das Setup installiert, und sein Eintrag in der Tenants-Tabelle steht auf `APPROVED` (siehe [branch_umgebung_einrichten.md](branch_umgebung_einrichten.md#6-mandant-freigeben)).
- **`tenantId` des Mandanten:** DynamoDB Console → Tabelle `TenantsTable` des Stacks der Umgebung → nach `tenantName` filtern → Feld `tenantId`. Nicht mit `backendClientId` verwechseln: Das ist der Client der Data Action.
- **Admin-Token der Umgebung:** Secrets Manager → Secret, dessen Name mit `OnboardingAdminToken` beginnt und das zum Stack der Umgebung gehört (Tag `aws:cloudformation:stack-name`). Per CLI:
  ```bash
  aws secretsmanager list-secrets --region eu-central-1 \
    --query "SecretList[?contains(Name,'OnboardingAdminToken')].[Name,Tags[?Key=='aws:cloudformation:stack-name'].Value|[0]]" \
    --output table
  aws secretsmanager get-secret-value --region eu-central-1 --secret-id <Name> \
    --query SecretString --output text
  ```
- **API-URL der Umgebung mit Präfix:** `https://<app-domain><präfix>`, z. B. `https://main.<appId>.amplifyapp.com/api` oder für einen Branch `https://<branch>.<appId>.amplifyapp.com/api_websurveys` (Präfix aus `VITE_API_PREFIX`, siehe [branch_umgebung_einrichten.md](branch_umgebung_einrichten.md#3-api-präfix-und-rewrite-regel)).

In den Beispielen unten:

```bash
API="https://<app-domain><präfix>"
ADMIN_TOKEN="<Admin-Token>"
```

## 2. Scopes wählen

| Scope beim Anlegen | Erlaubt | Voraussetzung |
|---|---|---|
| `reporting.read` | Antworten abrufen (`GET /ext/v1/reporting/data`) | |
| `invitations.write` | Einladungslinks erzeugen (`POST /ext/v1/invitations`) | Nur bei aktivem Web-Kanal (Feature Flag `web_survey`). Die API prüft das Flag nicht selbst. |
| `surveys.read` | Umfragedetails lesen (`GET /ext/v1/surveys…`) | |
| `themes.read` | Web-Designs exportieren (`GET /ext/v1/web-themes`) | |
| `themes.write` | Web-Designs importieren (`POST /ext/v1/web-themes/import`) | Nur bei aktivem Web-Kanal (Feature Flag `web_survey`), die API prüft das Flag nicht selbst. Der Scope erlaubt dasselbe wie die Rolle `polly_deploy` beim Pflegen der Designs, und zwar ohne Optimistic Locking (der Import überschreibt). |

Nur die Scopes vergeben, die der Kunde braucht. `invitations.write` erlaubt dasselbe wie die Rolle `polly_deploy` beim Erzeugen von Einladungen. Bestehende Clients haben `themes.read` und `themes.write` nicht: dafür einen neuen Client anlegen (siehe „Scopes ändern“).

## 3. Client anlegen

```bash
curl -X POST "$API/onboarding/api-clients/create" \
  -H "content-type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{
    "tenantId": "<tenantId>",
    "label": "Kunde X – Reporting ins DWH",
    "scopes": ["reporting.read", "surveys.read"]
  }'
```

- `tenantId`: Pflicht, siehe Voraussetzungen.
- `label`: Pflicht, max. 100 Zeichen. Wofür der Zugang ist. Erscheint in der Liste und hilft beim späteren Aufräumen.
- `scopes`: Pflicht, mindestens einer, ohne Präfix `polly-api/`.

**Antwort `200`:**

```json
{
  "clientId": "4p1k…",
  "clientSecret": "1q2w…",
  "tokenUrl": "https://app-m2m-<envSuffix>.auth.eu-central-1.amazoncognito.com/oauth2/token",
  "scope": "polly-api/reporting.read polly-api/surveys.read",
  "tenantId": "<tenantId>",
  "label": "Kunde X – Reporting ins DWH"
}
```

**Das `clientSecret` wird nur in dieser Antwort angezeigt** und nirgends gespeichert. Geht es verloren, einen neuen Client anlegen (Schritt 7).

**Fehler:**

| HTTP | Ursache |
|---|---|
| `400` | `tenantId`, `label` oder `scopes` fehlen bzw. sind ungültig |
| `403` | Admin-Token fehlt oder ist falsch |
| `409` | Mandant unbekannt oder nicht `APPROVED` |

**Prüfen:** Mit den Zugangsdaten ein Token holen (siehe [polly_customer_api.md](polly_customer_api.md#21-token-abrufen)). Antwortet der Token-Dienst mit `200` und `access_token`, ist der Zugang eingerichtet.

## 4. Übergabe an den Kunden

Der Kunde bekommt:

- Token-URL (`tokenUrl` aus der Antwort)
- Client-ID
- Client-Secret
- Scope-String (`scope` aus der Antwort)
- `[API_URL]` je API mit dem Präfix der Umgebung:
  - Reporting: `https://<app-domain><präfix>/ext/v1/reporting`
  - Einladungen: `https://<app-domain><präfix>/ext/v1` (Route `/invitations`)
  - Umfragedetails: `https://<app-domain><präfix>/ext/v1` (Route `/surveys`)
- Die Kundenspezifikation [polly_customer_api.md](polly_customer_api.md)

Das Client-Secret auf einem sicheren Weg und **getrennt von der Client-ID** übergeben, z. B. Client-ID per E-Mail und Secret über einen Passwort-Link mit Ablauf.

## 5. Clients auflisten

```bash
curl -X POST "$API/onboarding/api-clients/list" \
  -H "content-type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"tenantId": "<tenantId>"}'
```

**Antwort `200`** (ohne Secrets):

```json
{
  "tenantId": "<tenantId>",
  "clients": [
    {
      "clientId": "4p1k…",
      "label": "Kunde X – Reporting ins DWH",
      "scopes": ["reporting.read", "surveys.read"],
      "status": "ACTIVE",
      "createdAt": "2026-10-23T10:15:00.000Z"
    }
  ]
}
```

Der Status `DELETING` bedeutet, dass ein Löschen abgebrochen ist. Der Client ist dann schon gesperrt, das Löschen kann einfach wiederholt werden.

## 6. Sperren und Löschen

```bash
curl -X POST "$API/onboarding/api-clients/delete" \
  -H "content-type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"clientId": "<clientId>"}'
```

- Die Sperre wirkt **sofort**, auch für Tokens, die noch bis zu 60 Minuten gültig wären. Sie liefern ab dann `403 access_denied`.
- Gelöscht werden der Cognito-Client und der Eintrag in `ApiClientsTable`.
- Die Route löscht nur Clients aus `ApiClientsTable`. Eine `backendClientId` aus der Tenants-Tabelle (Data Action) ergibt `404` und bleibt unangetastet.
- Ein Sperren ohne Löschen gibt es nicht. Soll der Kunde später wieder Zugriff haben, einen neuen Client anlegen.

## 7. Secret erneuern

Ein Secret lässt sich nicht nachträglich ändern oder erneut anzeigen.

1. Neuen Client mit denselben Scopes anlegen (Schritt 3), im `label` z. B. „… (neu ab 2026-11)“.
2. Die neuen Zugangsdaten an den Kunden übergeben (Schritt 4).
3. Nach der Umstellung beim Kunden den alten Client löschen (Schritt 6).

Bis zum Löschen funktionieren beide Clients parallel.

## 8. Scopes ändern

Wie beim Erneuern: neuen Client mit den gewünschten Scopes anlegen, übergeben, alten Client löschen. Die Scopes eines bestehenden Clients werden nicht geändert.

## 9. Uninstall und Löschen des Mandanten

- **Uninstall in der App:** Der Eintrag steht danach auf `DELETED`. Die API-Clients des Mandanten werden mit `403 access_denied` abgelehnt, bleiben aber bestehen. Ausnahme: Gibt es eine weitere Installation mit derselben `tenantId`, die noch `APPROVED` ist, funktionieren die Clients weiter (sie hängen am Mandanten, nicht an der Installation).
- **Löschen des Mandanten** (`/onboarding/delete`): Die API-Clients des Mandanten werden mitgelöscht, sofern danach kein weiterer Eintrag mit derselben `tenantId` in der Tenants-Tabelle übrig ist. Die Antwort enthält die Anzahl in `deletedApiClients`. Scheitert das Löschen einzelner Clients, werden die übrigen trotzdem gelöscht; die nicht gelöschten stehen in `failedApiClientIds`, `apiClientsError` ist dann gesetzt. Scheitert das Aufräumen ganz, ist der Mandant trotzdem gelöscht und `apiClientsError` nennt den Fehler. In beiden Fällen sind die übrigen Clients gesperrt und lassen sich einzeln löschen (Schritte 5 und 6).
- **Wipe:** `wipeAllRoute` im Onboarding-Handler räumt die API-Clients genauso ab, hat aber keine HTTP-Route in `backend.ts` und ist damit derzeit nicht aufrufbar.
- **Neuinstallation** mit derselben `tenantId`: Bestehende Clients funktionieren wieder, sobald der neue Eintrag `APPROVED` ist.

## 10. Umgebungsvariable `WEB_SURVEY_ORIGIN`

Die Einladungs-API (`POST /ext/v1/invitations`) baut `fullLink` wie die App. Hat die Umfrage keine `base_url`, zeigt der Link auf die Polly-Umfrageseite `<WEB_SURVEY_ORIGIN>/s/<token>`.

- **Ohne Variable** leitet das Backend den Ursprung ab: `https://<branch>.<appId>.amplifyapp.com`. Der Branchname wird kleingeschrieben, Zeichen außer `a-z`, `0-9` und `-` (z. B. `/`, `_`, `.`) werden zu `-`, und er wird **nicht** auf 20 Zeichen gekürzt (anders als bei den Ressourcennamen). In der Sandbox (`npx ampx sandbox`, ohne App-ID) entsteht eine Domain, die es nicht gibt; `backend.ts` warnt dann beim Synthetisieren.
- **Setzen** (Amplify Console → Hosting → Environment variables, für den Branch) bei eigener Domain, z. B. `https://umfragen.example.com`. Ohne `/` am Ende; die Variable wirkt beim nächsten Backend-Deploy.
- **Prüfen:** Mit der Einladungs-API einen Link erzeugen und `fullLink` im Browser öffnen. Zeigt er auf eine falsche Domain, die Variable setzen und neu deployen.

## 11. Fehlersuche

| Antwort | Ursache |
|---|---|
| Token-Abruf `400 invalid_client` | Client-ID oder Secret falsch, Client gelöscht, oder Token-URL einer anderen Umgebung |
| Token-Abruf `400 invalid_scope` | Der angefragte Scope ist dem Client nicht zugeordnet |
| `401 invalid_token` | Token abgelaufen (60 min), beschädigt oder aus einer anderen Umgebung (falsche Token-URL) |
| `403 insufficient_scope` | Der Client hat den Scope der Route nicht. Auch der `backend/invoke`-Client der Data Action bekommt auf `/ext/v1` immer 403. |
| `403 access_denied` | Client gelöscht bzw. Status nicht `ACTIVE`, oder Mandant nicht `APPROVED` (z. B. nach Uninstall) |
| `409` (Einladungen) | Umfrage ohne Prod-Stand, nicht vorhanden oder wird gerade gelöscht (`no_prod`) |
| `413 response_too_large` (Einladungen) | Antwort wäre über dem Lambda-Limit; sollte durch die Längengrenze der Basis-URL nicht vorkommen. Kunde soll weniger Links pro Aufruf anfordern. |
| `429` | Drosselung der Route im API Gateway. Die Grenze gilt pro Route für **alle** Mandanten zusammen; ein Client, der in einer Schleife aufruft, bremst die anderen mit aus. Im Zugriffsprotokoll des API Gateways nachsehen, welcher Client die Last erzeugt. |

**Protokolle:** CloudWatch Logs der jeweiligen Lambda.

- Abgelehnte Anmeldungen stehen mit `[api_client_auth]` und `clientId`.
- Anlegen und Löschen von Clients stehen in der Lambda `onboarding` (`API client created`, `API client deleted`) mit `clientId` und `tenantId`.
