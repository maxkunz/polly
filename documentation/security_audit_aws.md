# Security-Audit der AWS-Umgebung (Betrieb)

Prüfskripte, mit denen sich Rückfragen aus Security-Audits (z. B. AWS Security Hub, SCP-Prüfungen des Kunden-Cloud-Teams) gegen den **deployten** Stand eines Accounts beantworten lassen. Alle Befehle lesen nur, sie ändern nichts.

## Ausführen über AWS CloudShell

Die Skripte laufen ohne Installation direkt in der **AWS CloudShell** (AWS CLI v2 und `python3` sind dort vorhanden):

1. In der AWS-Konsole mit dem **richtigen Account bzw. der richtigen Rolle (Profil)** anmelden, also dem Account, in dem die zu prüfende Polly-Umgebung läuft. CloudShell nutzt immer die Anmeldung der Konsole, ein lokales `--profile` gibt es dort nicht.
2. Oben rechts die **Region** der Umgebung wählen (Polly: in der Regel `eu-central-1`) und CloudShell öffnen.
3. Skript einfügen und ausführen.

Vorab kurz prüfen, ob Account und Region stimmen und die Funktionen sichtbar sind. In CloudShell ist `aws configure get region` leer, die Region steht in `$AWS_REGION`:

```bash
aws sts get-caller-identity --query Account --output text
echo $AWS_REGION
aws lambda list-functions --query 'length(Functions)'
```

Die Zahl muss größer als 0 sein, sonst sind Region oder Rechte falsch und alle folgenden Prüfungen laufen ins Leere (leere Ausgabe ≠ sauber). Region und Account gehören mit ins Ticket.

## 1. Lambda Function URLs (Security Hub Lambda.1)

**Hintergrund:** Eine Function URL mit Authentifizierungstyp `NONE` macht eine Lambda direkt aus dem Internet erreichbar und umgeht API Gateway. Polly legt keine Function URLs an: Alle Lambdas hängen an der HttpApi `app-api-<envSuffix>` (`HttpLambdaIntegration` in `amplify/backend.ts`) oder laufen über SQS bzw. EventBridge. Eine SCP, die Function URLs mit `NONE` blockiert, betrifft Polly also nicht.

Prüfung in der aktuellen Region, erwartet ist keine Ausgabe:

```bash
for f in $(aws lambda list-functions --query 'Functions[].FunctionName' --output text); do
  aws lambda list-function-url-configs --function-name "$f" \
    --query 'FunctionUrlConfigs[].[FunctionArn,AuthType]' --output text
done
```

Über alle Regionen (falls Umgebungen in verschiedenen Regionen liegen, dauert einige Minuten):

```bash
for r in $(aws ec2 describe-regions --query 'Regions[].RegionName' --output text); do
  for f in $(aws lambda list-functions --region $r --query 'Functions[].FunctionName' --output text); do
    aws lambda list-function-url-configs --region $r --function-name "$f" \
      --query 'FunctionUrlConfigs[].[FunctionArn,AuthType]' --output text
  done
done
```

## 2. API-Gateway-Berechtigungen ohne `SourceArn`

**Hintergrund:** Darf `apigateway.amazonaws.com` eine Lambda ohne `SourceArn`-Bedingung aufrufen, kann jedes API Gateway (auch eines in einem fremden Account) die Funktion aufrufen. In Polly legt `HttpLambdaIntegration` (CDK, Standard `scopePermissionToRoute: true`) pro Route eine Berechtigung mit `SourceArn = arn:aws:execute-api:<region>:<account>:<apiId>/*/*<routePfad>` an. Sie gilt also nur für die eigene API und die jeweilige Route.

Das Skript gibt jede Funktion mit einer API-Gateway-Berechtigung **ohne** `SourceArn` aus und meldet am Ende eine Zusammenfassung. Funktionen ohne Resource Policy (z. B. per SQS oder EventBridge ausgelöste Lambdas) werden übersprungen.

```bash
n=0; bad=0
for f in $(aws lambda list-functions --query 'Functions[].FunctionName' --output text); do
  pol=$(aws lambda get-policy --function-name "$f" --query Policy --output text 2>/dev/null) || continue
  n=$((n+1))
  out=$(echo "$pol" | python3 -c 'import sys,json; p=json.load(sys.stdin)
for s in p["Statement"]:
  if "apigateway" in json.dumps(s.get("Principal")) and "SourceArn" not in json.dumps(s.get("Condition",{})):
    print(sys.argv[1], s["Sid"])' "$f")
  [ -n "$out" ] && { echo "$out"; bad=$((bad+1)); }
done
echo "Funktionen mit Policy geprüft: $n, ohne SourceArn: $bad"
```

Erwartet: `ohne SourceArn: 0`.

## Textbaustein für Rückfragen

> Polly verwendet keine Lambda Function URLs. Der Zugriff erfolgt ausschließlich über API Gateway, dessen Aufruf-Berechtigungen per `SourceArn` auf die eigene API und die jeweilige Route beschränkt sind. Geprüft am <Datum> in Account <Account-ID>, Region <Region>: keine Function URLs, 0 Berechtigungen ohne `SourceArn`. Eine SCP gegen Function URLs mit Authentifizierungstyp `NONE` hat keine Auswirkung auf Polly, Maßnahmen auf ATIP-Seite sind nicht erforderlich.
