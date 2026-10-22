# Testumgebung für einen Branch einrichten

Diese Anleitung beschreibt, wie ein Feature-Branch eine eigene, vollständig getrennte Umgebung bekommt: eigenes Backend in AWS, eigene Polly-Installation in Genesys Cloud. Sie gilt für eine Amplify-App mit mehreren verbundenen Branches (z. B. `main` und `feature/websurveys`).

## Überblick

| Bereich | Was getrennt wird | Wie |
|---|---|---|
| AWS-Backend | API Gateway, Lambdas, DynamoDB-Tabellen, Cognito, SQS, Secrets | automatisch über `envSuffix = <appId>-<branch>` in `amplify/backend.ts` |
| Hosting | Frontend-Build | automatisch pro Branch (`https://<branch>.<appId>.amplifyapp.com`) |
| Weiterleitung `/api` | Welches API Gateway das Frontend erreicht | **manuell**: Rewrite-Regel + Umgebungsvariable `VITE_API_PREFIX` |
| Genesys | Data Tables, Rollen, OAuth-Clients, Data Action, Flows | Setup der App in der neuen Umgebung |
| Mandant | Eintrag in der Tenants-Tabelle des neuen Backends | Setup legt ihn an, **manuell freigeben** |

Mandanten lassen sich **nicht** aus einer anderen Umgebung in die Tenants-Tabelle kopieren. Ein Eintrag verweist auf einen Client im Cognito User Pool seiner Umgebung (`backendClientId`), auf ein Secret unter `gc-clients/<envSuffix>/…` und auf eine Data Action, deren Token-URL und Pfad zur alten Umgebung gehören. Das Onboarding über das Setup muss deshalb in jeder Umgebung neu laufen.

## 1. Branch in Amplify verbinden

1. Den Branch nach GitHub pushen.
2. Amplify Console → App → **Add branch** → Branch wählen.
3. Den ersten Build abwarten. [amplify.yml](../amplify.yml) deployt das Backend mit `npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID`. Ein neuer Branch erzeugt einen eigenen Stack.
4. Optionale Branch-Umgebungsvariablen (Hosting → Environment variables, als Override für den Branch):
   - `GENESYS_REGION`, falls die Test-Org nicht in `mypurecloud.de` liegt
   - `WEB_SURVEY_RESERVED_CONCURRENCY`, siehe [polly_web.md](polly_web.md)

Der Branchname wird für die Ressourcennamen bereinigt (Kleinbuchstaben, Sonderzeichen → `-`) und auf 20 Zeichen gekürzt. Aus `feature/websurveys` wird `feature-websurveys`.

Für Repos in einer GitHub-Organisation muss die GitHub App „AWS Amplify“ für das Repo freigegeben sein. Das ist bei einer bestehenden Amplify-App bereits der Fall, sonst muss ein Owner der Organisation sie freigeben.

## 2. API Gateway des Branches ermitteln

Die HTTP API heißt `app-api-<appId>-<branch>`, z. B. `app-api-d1a6p4nkkob4i7-feature-websurveys`. Die URL findet man so:

- **API Gateway Console** (Region `eu-central-1`) → APIs, nach dem Namen filtern → Invoke URL der Stage `$default`.
- **Amplify Console** → Branch → Deployments → `amplify_outputs.json` herunterladen → `custom.apiUrl`.
- **CLI:**
  ```bash
  aws apigatewayv2 get-apis --region eu-central-1 \
    --query "Items[?contains(Name,'feature-websurveys')].[Name,ApiId,ApiEndpoint]" --output table
  ```

## 3. API-Präfix und Rewrite-Regel

Das Frontend ruft das Backend relativ auf, Amplify Hosting leitet den Pfad per Rewrite-Regel auf das API Gateway weiter. **Rewrite-Regeln gelten für die ganze App**, nicht pro Branch. Deshalb bekommt jeder zusätzliche Branch ein eigenes Pfad-Präfix.

Das Präfix kommt aus der Build-Variable `VITE_API_PREFIX` (Default `/api`, siehe `src/constants/apiConstants.ts`). Es wirkt auf alle Backend-Aufrufe der App, auf Onboarding und Uninstall im Setup und auf die URL der Data Action, die das Setup anlegt.

**Umgebungsvariable** (Hosting → Environment variables):

| Variable | Value | Branch |
|---|---|---|
| `VITE_API_PREFIX` | `/api` | All branches |
| `VITE_API_PREFIX` | `/api_websurveys` | feature/websurveys |

Der erste Eintrag einer Variable gilt immer für „All branches“, das Feld Branch ist dort nicht änderbar. Den Wert für einen einzelnen Branch legt man über **Actions → Add variable override** an. Den Default auf `/api` lassen, sonst läuft auch `main` beim nächsten Build gegen das Test-Backend.

**Rewrite-Regel** (Hosting → Rewrites and redirects → Manage redirects):

```json
[
  {
    "source": "/api/<*>",
    "status": "200",
    "target": "https://<API-ID main>.execute-api.eu-central-1.amazonaws.com/<*>"
  },
  {
    "source": "/api_websurveys/<*>",
    "status": "200",
    "target": "https://<API-ID feature-websurveys>.execute-api.eu-central-1.amazonaws.com/<*>"
  },
  {
    "source": "/s/<*>",
    "status": "200",
    "target": "/survey.html"
  }
]
```

- Amplify nimmt die erste passende Regel. Die `/api…`-Regeln müssen vor einer SPA-Regel stehen, die alle Pfade auf `/index.html` umleitet, und vor der Regel `/s/<*>` → `/survey.html` (Web-Kanal).
- Die Regel `/s/<*>` (öffentliche Umfrageseite, siehe [polly_web.md](polly_web.md#hosting)) ist relativ und gilt damit für jeden Branch. Sie muss ebenfalls vor der SPA-Regel stehen, weil Einladungs-Tokens Punkte enthalten.
- Die Präfixe dürfen sich nicht überlappen. `/api/<*>` passt nicht auf `/api_websurveys/…`, das ist in Ordnung.

Danach den Branch **neu bauen**, denn Vite setzt die Variable beim Build ein.

## 4. Genesys vorbereiten

In der Genesys-Org, in der getestet wird:

1. **OAuth-Client für das Frontend** (Code-/Implicit-Grant): Die URL des Branches als Redirect-URL eintragen, z. B. `https://feature-websurveys.<appId>.amplifyapp.com/`. Scopes wie bei der bestehenden Installation, für die Rollenprüfung ggf. `authorization:readonly` (siehe [permissions.md](permissions.md)).
2. **App-Integration** (Custom Client Application) anlegen. Die URL **ohne** `datatable_id` und `mapping_datatable_id` eintragen. Fehlen die beiden Parameter, startet die App im Setup-Modus:
   ```
   https://feature-websurveys.<appId>.amplifyapp.com/?gcHostOrigin=https%3A%2F%2Fapps.mypurecloud.de&gcTargetEnv=prod&client_id=<OAuth-Client-ID>
   ```
   `gcHostOrigin` muss zur Region der Org passen.

## 5. Setup ausführen

1. Die App über die Integration in Genesys öffnen und das Setup starten.
2. **`projectTag`:** Liegt in derselben Org schon eine Polly-Installation, einen anderen Tag wählen. Sonst kollidieren Data Tables, Rollen und Data Action.
3. Das Setup legt an bzw. trägt ein:
   - Division (oder übernimmt eine bestehende)
   - Data Tables `<projectTag>_polly_surveys` und `<projectTag>_polly_mapping`
   - OAuth-Client für das Backend, Data-Action-Integration und Data Action (URL `<domain><präfix>/survey-responses`)
   - Onboarding gegen das neue Backend (Eintrag in der Tenants-Tabelle mit Status `PENDING`)
   - Bot- und Inbound-Flow in Architect
   - Rollen `<projectTag>_polly_write`, `_polly_deploy`, `_polly_reporting`
   - Redirect-URL des Frontend-OAuth-Clients und URL der App-Integration, jetzt **mit** `datatable_id` und `mapping_datatable_id`. Diese Parameter muss man nicht selbst nachtragen.

Alle angelegten Ressourcen stehen danach in `meta.setup` der `__meta`-Zeile. Der Uninstall braucht sie.

## 6. Mandant freigeben

Das Backend nimmt Anfragen eines Mandanten erst an, wenn sein Eintrag in der Tenants-Tabelle den Status `APPROVED` hat. Nach dem Setup steht er auf `PENDING`.

**Variante A: direkt in DynamoDB**
DynamoDB Console → Tabelle `TenantsTable` des neuen Stacks (Name enthält den Stack des Branches) → den neuen Eintrag öffnen → `status` auf `APPROVED` setzen.

**Variante B: über den Admin-Endpunkt**
Der Admin-Token liegt als Secret im Stack des Branches (Secrets Manager, Secret des `onboarding`-Admin-Tokens, wird beim Deploy erzeugt):

```bash
curl -X POST "https://<branch>.<appId>.amplifyapp.com/api_websurveys/onboarding/approve" \
  -H "content-type: application/json" \
  -H "x-admin-token: <ADMIN_TOKEN>" \
  -d '{"backendClientId": "<backendClientId aus der Tenants-Tabelle>"}'
```

## 7. Rollen zuweisen und prüfen

1. Den Testusern die Rollen `<projectTag>_polly_write`, `_polly_deploy` und `_polly_reporting` zuweisen. Rollenänderungen greifen nach spätestens 5 Minuten.
2. App öffnen. In den Entwicklertools des Browsers (Network) müssen die Backend-Aufrufe auf das Präfix des Branches gehen, z. B. `/api_websurveys/...`.
3. Data Action in Genesys über **Test** ausführen. Die Antwort muss erfolgreich sein und in der Response-Tabelle des neuen Stacks landen.
4. Für Testanrufe eine Rufnummer bzw. einen Einstiegspunkt auf den neu importierten Inbound-Flow legen.

## Fehlersuche

| Symptom | Ursache |
|---|---|
| Login in Genesys schlägt fehl (`redirect_uri` ungültig) | Redirect-URL des Frontend-OAuth-Clients enthält die Branch-Domain nicht |
| App startet direkt im Editor statt im Setup | URL der Integration enthält noch `datatable_id` / `mapping_datatable_id` |
| Backend-Aufrufe liefern HTML statt JSON oder 404 | Rewrite-Regel für das Präfix fehlt oder steht hinter der SPA-Regel |
| Einladungslink `/s/<jwt>` öffnet die Genesys-App (Login) statt der Umfrage | Rewrite-Regel `/s/<*>` → `/survey.html` fehlt oder steht hinter der SPA-Regel |
| Aufrufe gehen auf `/api` statt auf das Branch-Präfix | Override für `VITE_API_PREFIX` fehlt oder Branch nach dem Setzen nicht neu gebaut |
| `Tenant not approved` bzw. 401/403 nach dem Setup | Mandant steht noch auf `PENDING` (Schritt 6) |
| Antworten landen im Backend von `main` | Data Action wurde vor dem Präfix angelegt und zeigt noch auf `/api/survey-responses`. In Genesys anpassen oder Setup neu ausführen |

## Lokal entwickeln

`npm run dev` nutzt immer `/api`. Der Dev-Proxy in [vite.config.ts](../vite.config.ts) leitet auf eine fest eingetragene API-Gateway-URL weiter. Für das Backend eines Branches diese URL lokal ändern und nicht committen.

Alternative ohne Amplify-Branch: `AWS_BRANCH=<kürzel> npx ampx sandbox` baut mit den eigenen AWS-Credentials ein persönliches Backend. Ohne `AWS_BRANCH` heißt der Suffix `app-local` und kollidiert mit anderen Sandboxes im selben Konto.

## Umgebung abbauen

1. In der App den **Uninstall** ausführen. Er entfernt die Genesys-Ressourcen aus `meta.setup` und markiert den Mandanten als `DELETED`.
2. App-Integration und, falls eigens angelegt, den Frontend-OAuth-Client in Genesys löschen.
3. Branch in Amplify trennen. Der Stack wird gelöscht.
4. Rewrite-Regel und Override von `VITE_API_PREFIX` entfernen.
5. Einige Ressourcen bleiben stehen und müssen bei Bedarf von Hand gelöscht werden: die DynamoDB-Tabellen und der JWT-Schlüssel `polly-web-survey-jwt-<envSuffix>` (beide `RemovalPolicy.RETAIN`) sowie die Secrets der Mandanten unter `gc-clients/<envSuffix>/…` (legt die Lambda `onboarding` zur Laufzeit an, nicht der Stack). Solange dieser Schlüssel existiert, schlägt ein neuer Deploy desselben Branches fehl (siehe [polly_web.md](polly_web.md)).
