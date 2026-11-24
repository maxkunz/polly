#!/usr/bin/env python3
"""Legt einen Kunden-API-Client an (POST /onboarding/api-clients/create).

Fragt tenantId, Label, Scopes, API-URL und Admin-Token ab, legt den Client an, zeigt die
Zugangsdaten auf der Konsole an und hängt sie an tools/run_api_tests.env an
(Leerzeile, Kommentar "new entry", export-Variablen wie in run_api_tests.env.sample).

Vorbelegung: API_URL aus tools/run_api_tests.env, Admin-Token aus der Umgebungsvariablen
ADMIN_TOKEN (sonst verdeckte Eingabe). Nur Standardbibliothek.
Doku: documentation/betrieb_api_zugaenge.md
"""
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.request

ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run_api_tests.env")

# Scope (ohne Präfix polly-api/) -> Beschreibung, siehe betrieb_api_zugaenge.md Abschnitt 2
SCOPES = [
    ("reporting.read", "Antworten abrufen"),
    ("surveys.read", "Umfragedetails lesen"),
    ("invitations.write", "Einladungslinks erzeugen (Feature Flag web_survey)"),
    ("themes.read", "Web-Designs exportieren"),
    ("themes.write", "Web-Designs importieren (Feature Flag web_survey)"),
]
# Die Testsuite (Fälle [C1]–[C21]) braucht laut Vorlage alle drei Scopes
TEST_SCOPES = ["reporting.read", "invitations.write", "surveys.read"]


def read_env_value(name):
    """Letzter Wert von `export NAME="..."` in der env-Datei (leer, wenn nicht vorhanden)."""
    if not os.path.isfile(ENV_FILE):
        return ""
    value = ""
    pattern = re.compile(r"^\s*export\s+" + re.escape(name) + r"=(.*?)\s*(#.*)?$")
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            m = pattern.match(line.rstrip("\n"))
            if m:
                value = m.group(1).strip().strip('"').strip("'")
    return value


def ask(prompt, default=""):
    suffix = f" [{default}]" if default else ""
    while True:
        answer = input(f"{prompt}{suffix}: ").strip()
        if answer:
            return answer
        if default:
            return default
        print("  Pflichtangabe.")


def ask_scopes():
    print("Scopes:")
    for i, (name, desc) in enumerate(SCOPES, 1):
        print(f"  {i}) {name} – {desc}")
    default = ",".join(str(i) for i, (n, _) in enumerate(SCOPES, 1) if n in TEST_SCOPES)
    while True:
        raw = ask("Nummern, kommas getrennt (Vorgabe = die drei Scopes der Testsuite)", default)
        try:
            picked = sorted({int(x) for x in raw.replace(" ", "").split(",") if x})
            if picked and all(1 <= i <= len(SCOPES) for i in picked):
                return [SCOPES[i - 1][0] for i in picked]
        except ValueError:
            pass
        print("  Ungültige Eingabe.")


def create_client(api_url, admin_token, tenant_id, label, scopes):
    url = api_url.rstrip("/") + "/onboarding/api-clients/create"
    body = json.dumps({"tenantId": tenant_id, "label": label, "scopes": scopes}).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"content-type": "application/json", "x-admin-token": admin_token},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        hints = {
            400: "tenantId, label oder scopes fehlen bzw. sind ungültig",
            403: "Admin-Token fehlt oder ist falsch",
            409: "Mandant unbekannt oder nicht APPROVED",
        }
        sys.exit(f"Fehler: HTTP {e.code} ({hints.get(e.code, 'unerwartet')})\n{detail}")
    except urllib.error.URLError as e:
        sys.exit(f"Fehler: {url} nicht erreichbar: {e.reason}")


def append_env(client):
    existing = ""
    if os.path.isfile(ENV_FILE):
        with open(ENV_FILE, encoding="utf-8") as f:
            existing = f.read()
    lines = []
    if existing and not existing.endswith("\n"):
        lines.append("")
    lines += [
        "",
        "# new entry",
        f"# Label: {client.get('label', '')}, Mandant: {client.get('tenantId', '')}",
        f'export API_CLIENT_ID="{client["clientId"]}"',
        f'export API_CLIENT_SECRET="{client["clientSecret"]}"',
        f'export API_TOKEN_URL="{client["tokenUrl"]}"',
    ]
    with open(ENV_FILE, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    print("Neuen Kunden-API-Client anlegen\n")
    api_url = ask("API-URL inkl. Präfix (z. B. https://<app>.amplifyapp.com/api)", read_env_value("API_URL"))
    admin_token = os.environ.get("ADMIN_TOKEN") or getpass.getpass("Admin-Token (verdeckt): ").strip()
    if not admin_token:
        sys.exit("Fehler: Admin-Token fehlt.")
    tenant_id = ask("tenantId des Mandanten")
    label = ask("Label (max. 100 Zeichen, Zweck des Zugangs)")
    if len(label) > 100:
        sys.exit("Fehler: Label länger als 100 Zeichen.")
    scopes = ask_scopes()

    print(f"\nAnlegen: Mandant {tenant_id}, Label \"{label}\", Scopes {', '.join(scopes)}")
    if input("Fortfahren? [J/n] ").strip().lower() in ("n", "nein"):
        sys.exit("Abgebrochen.")

    client = create_client(api_url, admin_token, tenant_id, label, scopes)
    for key in ("clientId", "clientSecret", "tokenUrl"):
        if not client.get(key):
            sys.exit(f"Fehler: Antwort ohne {key}: {json.dumps({k: v for k, v in client.items() if k != 'clientSecret'})}")

    print("\nClient angelegt (das Secret wird nur jetzt angezeigt):")
    print(f"  clientId:     {client['clientId']}")
    print(f"  clientSecret: {client['clientSecret']}")
    print(f"  tokenUrl:     {client['tokenUrl']}")
    print(f"  scope:        {client.get('scope', '')}")
    print(f"  tenantId:     {client.get('tenantId', '')}")
    print(f"  label:        {client.get('label', '')}")

    append_env(client)
    print(f"\nZugangsdaten an {os.path.relpath(ENV_FILE)} angehängt.")
    print("Hinweis: Frühere API_CLIENT_*-Zeilen in der Datei werden von späteren überschrieben (zuletzt gesetzter Wert gilt).")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        sys.exit("\nAbgebrochen.")
