#!/usr/bin/env python3
"""
Polly API – Testsuite gegen die deployte API
=============================================================
Ersetzt die frühere curl-Suite survey_responses.sh. Pro Test eine Zeile:

  [1] POST /survey-responses – yes_no Antwort ........ ok
  [2] POST /survey-responses – nps Antwort ........... FEHLER
        erwartet HTTP 200, erhalten HTTP 404
        Antwort: {"error":"survey_not_found"}

Verwendung:
  export GENESYS_TOKEN=<Bearer aus dem Genesys-Portal>
  python3 tools/api_tests.py [Optionen]

Konfiguration über Umgebungsvariablen (Token nur so, nie per Parameter):
  GENESYS_TOKEN           Bearer-Token (Genesys-Portal, Dev-Tools). Ohne Token laufen nur die
                          öffentlichen /web-survey-Fälle, Exit-Code ist dann 1.
  GENESYS_TOKEN_NO_DEPLOY optional: Token eines Users OHNE Rolle polly_deploy (403-Fall)
  API_URL                 Pflicht: Basis-URL inkl. Präfix, z. B. https://<app>.amplifyapp.com/api
                          (ohne API_URL bricht das Skript ab)
  GENESYS_REGION          Default mypurecloud.de

Optionen (jeweils auch per gleichnamiger Umgebungsvariable in Großbuchstaben):
  --survey-id             Umfrage für die Antworttests, muss in der Data Table DIESER Installation
                          existieren, sonst liefern [1]–[5] 404
  --survey-name           Name der Umfrage (Default mini_1718e427)
  --survey-version        Version der Umfrage (Default 5)
  --datatable-id          Data Table der Umfragen; ohne sie entfallen die Lösch-Tests [D1]–[D4]
  --existing-survey-id    Umfrage, die in dieser Data Table existiert ([D1], erwartet 409)
  --preview-survey-id     Umfrage mit Stage-Stand für die Webvorschau (Default: --survey-id)
  --web-token             vorhandene Einladung (JWT) für [W6]/[W7]; ohne sie wird über POST /invitations
                          eine erzeugt (1 h gültig, braucht polly_deploy und Prod-Stand von --survey-id).
                          Für [W8]/[W9] wird immer eine Einladung mit 5 s Laufzeit erzeugt.
  --web-theme-write       legt ein Test-Design an und löscht es wieder ([T6]/[T7]; WEB_THEME_WRITE=1)
  -k / --insecure         TLS-Zertifikate nicht prüfen (nur zum Testen)
  -v / --verbose          bei Erfolg ebenfalls HTTP-Status ausgeben

Neue Tests: Fall in main() mit suite.case(...) ergänzen. Neue Endpunkt-Gruppe mit Token:
einfach api.genesys(...) als Request verwenden, siehe tests_* unten.

ACHTUNG: Schreibt echte Daten in die deployte API.
"""

import argparse
import base64
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional, Union

DEFAULT_REGION = "mypurecloud.de"
REQUEST_TIMEOUT_SECONDS = 30


# -------------------------------------------------------------------
# HTTP-Schicht
# -------------------------------------------------------------------

@dataclass
class Response:
    status: int
    headers: dict  # Namen in Kleinschreibung
    text: str

    def json(self) -> Any:
        try:
            return json.loads(self.text)
        except ValueError:
            return None


class HttpClient:
    """Dünne Hülle um urllib: liefert auch bei 4xx/5xx eine Response statt einer Exception."""

    def __init__(self, base_url: str, ssl_context: Optional[ssl.SSLContext] = None):
        self.base_url = base_url.rstrip("/")
        self.ssl_context = ssl_context

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[dict] = None,
        body: Union[dict, bytes, str, None] = None,
        headers: Optional[dict] = None,
    ) -> Response:
        url = self.base_url + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        all_headers = {"User-Agent": "polly-survey-responses-tests", **(headers or {})}
        data = None
        if isinstance(body, dict):
            data = json.dumps(body).encode()
            all_headers.setdefault("Content-Type", "application/json")
        elif isinstance(body, str):
            data = body.encode()
        elif isinstance(body, bytes):
            data = body
        req = urllib.request.Request(url, data=data, method=method, headers=all_headers)
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS, context=self.ssl_context) as res:
                return self._to_response(res.status, res.headers, res.read())
        except urllib.error.HTTPError as err:
            return self._to_response(err.code, err.headers, err.read())

    @staticmethod
    def _to_response(status: int, headers, raw: bytes) -> Response:
        return Response(status, {k.lower(): v for k, v in headers.items()}, raw.decode("utf-8", "replace"))


class PollyApi(HttpClient):
    """Zugriffe auf das Polly-Backend. Je nach Endpunkt mit oder ohne Genesys-Token."""

    def __init__(self, base_url: str, region: str, token: str, ssl_context=None):
        super().__init__(base_url, ssl_context)
        self.region = region
        self.token = token

    def genesys_headers(self, token: Optional[str] = None) -> dict:
        """Header für Aufrufe mit Genesys-Bearer (Default: GENESYS_TOKEN)."""
        return {
            "Authorization": f"Bearer {token if token is not None else self.token}",
            "x-genesys-region": self.region,
            "Content-Type": "application/json",
        }

    def genesys(self, method: str, path: str, *, token: Optional[str] = None, **kwargs) -> Response:
        """Aufruf mit Genesys-Token; `token=` überschreibt das Standardtoken (z. B. ungültig, ohne Rolle)."""
        return self.request(method, path, headers=self.genesys_headers(token), **kwargs)

    def public(self, method: str, path: str, **kwargs) -> Response:
        """Aufruf ohne Authentifizierung (öffentliche Endpunkte, 401-Fälle)."""
        return self.request(method, path, **kwargs)


# -------------------------------------------------------------------
# Test-Rahmen
# -------------------------------------------------------------------

Status = Union[int, tuple]
BodyCheck = Callable[[Response], Optional[str]]  # liefert None bei Erfolg, sonst die Fehlermeldung


def json_field(name: str, expected: Any) -> BodyCheck:
    """Body ist JSON und Feld `name` hat den Wert `expected`."""
    def check(res: Response) -> Optional[str]:
        body = res.json()
        actual = body.get(name, "<fehlt>") if isinstance(body, dict) else "<kein JSON-Objekt>"
        return None if actual == expected else f"erwartet {name}={expected!r}, erhalten {actual!r}"
    return check


def json_has(*names: str) -> BodyCheck:
    """Body ist ein JSON-Objekt mit allen Feldern in `names` (nicht leer)."""
    def check(res: Response) -> Optional[str]:
        body = res.json()
        if not isinstance(body, dict):
            return "Antwort ist kein JSON-Objekt"
        missing = [n for n in names if not body.get(n)]
        return f"Felder fehlen oder sind leer: {', '.join(missing)}" if missing else None
    return check


def text_contains(fragment: str) -> BodyCheck:
    def check(res: Response) -> Optional[str]:
        return None if fragment in res.text else f"Antwort enthält '{fragment}' nicht"
    return check


def header_present(*names: str) -> BodyCheck:
    def check(res: Response) -> Optional[str]:
        missing = [n for n in names if n.lower() not in res.headers]
        return f"Header fehlen: {', '.join(missing)}" if missing else None
    return check


class Suite:
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self._color = sys.stdout.isatty()

    def _paint(self, text: str, code: str) -> str:
        return f"\033[{code}m{text}\033[0m" if self._color else text

    def section(self, title: str) -> None:
        print(f"\n{self._paint(title, '1')}")

    def info(self, text: str) -> None:
        print(text)

    def skip(self, label: str, reason: str) -> None:
        self.skipped += 1
        print(f"{label} {self._paint('übersprungen', '33')} ({reason})")

    def case(
        self,
        label: str,
        request: Callable[[], Response],
        status: Status = 200,
        *checks: BodyCheck,
    ) -> Optional[Response]:
        """Führt einen Test aus. Gibt die Response zurück (auch bei Fehler), damit Folgetests sie nutzen können."""
        print(f"{label} ... ", end="", flush=True)
        try:
            res = request()
        except Exception as exc:  # Netzwerk, Timeout, TLS
            self._fail([f"Request fehlgeschlagen: {type(exc).__name__}: {exc}"], None)
            return None
        allowed = status if isinstance(status, tuple) else (status,)
        problems = []
        if res.status not in allowed:
            wanted = " oder ".join(f"HTTP {s}" for s in allowed)
            problems.append(f"erwartet {wanted}, erhalten HTTP {res.status}")
        else:
            problems.extend(msg for msg in (check(res) for check in checks) if msg)
        if problems:
            self._fail(problems, res)
        else:
            self.passed += 1
            print(self._paint("ok", "32") + (f" (HTTP {res.status})" if self.verbose else ""))
        return res

    def _fail(self, problems: list, res: Optional[Response]) -> None:
        self.failed += 1
        print(self._paint("FEHLER", "31;1"))
        for problem in problems:
            print(f"      {problem}")
        if res is not None:
            body = res.text.replace("\n", " ")
            print(f"      Antwort: {body[:300]}{'…' if len(body) > 300 else ''}")

    def summary(self) -> int:
        line = f"{self.passed} ok, {self.failed} Fehler, {self.skipped} übersprungen"
        print(f"\n==== {self._paint(line, '31;1' if self.failed else '32')} ====")
        return 1 if self.failed else 0


# -------------------------------------------------------------------
# Testgruppen
# -------------------------------------------------------------------

def tests_web_public(suite: Suite, api: PollyApi) -> None:
    """Öffentliche Endpunkte, laufen ohne Genesys-Token."""
    suite.section(f"Web-Kanal: {api.base_url}/web-survey")
    manipulated = "eyJhbGciOiJIUzI1NiIsImtpZCI6IjAwMDAwMDAwIn0.e30.AAAA"

    suite.case("[W1] GET /web-survey ohne Token (200, status invalid)",
               lambda: api.public("GET", "/web-survey"), 200, json_field("status", "invalid"))
    suite.case("[W2] GET /web-survey mit manipuliertem Token (200, status invalid)",
               lambda: api.public("GET", "/web-survey", params={"token": manipulated}),
               200, json_field("status", "invalid"))
    suite.case("[W3] POST /web-survey/submit mit kaputtem JSON (400 invalid_request)",
               lambda: api.public("POST", "/web-survey/submit", body='{kein json',
                                  headers={"Content-Type": "application/json"}),
               400, text_contains("invalid_request"))
    suite.case("[W4] POST /web-survey/submit mit ungültigem Token (403 invalid)",
               lambda: api.public("POST", "/web-survey/submit",
                                  body={"token": "a.b.c", "surveyVersion": 1, "answers": {}}),
               403, text_contains("invalid"))
    suite.case("[W5] POST /web-survey/submit über 64 KB (413 payload_too_large)",
               lambda: api.public("POST", "/web-survey/submit", body=b"a" * 70000,
                                  headers={"Content-Type": "application/json"}),
               413, text_contains("payload_too_large"))


EXPIRING_INVITATION_SECONDS = 5  # POST /invitations lehnt ein exp in der Vergangenheit ab


def create_invitation(suite: Suite, api: PollyApi, label: str, survey_id: str, exp: int) -> str:
    """Erzeugt über POST /invitations eine mehrfach nutzbare Einladung und liefert den JWT ('' bei Fehler)."""
    res = suite.case(label,
                     lambda: api.genesys("POST", "/invitations",
                                         body={"surveyId": survey_id, "count": 1, "multi": True, "exp": exp}),
                     200, json_has("tokens"))
    body = res.json() if res is not None and res.status == 200 else None
    tokens = body.get("tokens") if isinstance(body, dict) else None
    return tokens[0].get("jwt", "") if isinstance(tokens, list) and tokens and isinstance(tokens[0], dict) else ""


def prepare_invitations(suite: Suite, api: PollyApi, cfg: argparse.Namespace) -> None:
    """Legt gültige (1 h) und bald ablaufende Einladung an; braucht polly_deploy und einen Prod-Stand der Umfrage."""
    suite.section("Web-Kanal: Einladungen erzeugen (POST /invitations)")
    now = int(time.time())
    if cfg.web_token:
        suite.skip("[I1]", "WEB_TOKEN vorgegeben")
    else:
        cfg.web_token = create_invitation(suite, api, "[I1] gültige Einladung, läuft in 1 Stunde ab",
                                          cfg.survey_id, now + 3600)
    cfg.expiring_exp = now + EXPIRING_INVITATION_SECONDS
    cfg.expiring_token = create_invitation(
        suite, api, f"[I2] Einladung, die in {EXPIRING_INVITATION_SECONDS} s abläuft (für [W8]/[W9])",
        cfg.survey_id, cfg.expiring_exp)


def tests_web_invitation(suite: Suite, api: PollyApi, web_token: str) -> None:
    suite.section("Web-Kanal: gültige Einladung")
    if not web_token:
        suite.skip("[W6]/[W7]", "keine Einladung vorhanden")
        return
    suite.case("[W6] GET /web-survey mit gültiger Einladung (status ok, bereinigtes Flow-JSON)",
               lambda: api.public("GET", "/web-survey", params={"token": web_token}),
               200, json_field("status", "ok"), json_has("survey"))
    suite.case("[W7] POST /web-survey/submit mit falscher surveyVersion (409 survey_changed)",
               lambda: api.public("POST", "/web-survey/submit",
                                  body={"token": web_token, "surveyVersion": -1, "answers": {}}),
               409, text_contains("survey_changed"))


def tests_web_expired(suite: Suite, api: PollyApi, token: str, exp: int) -> None:
    """Läuft zuletzt, damit die Einladung bis dahin meist schon abgelaufen ist."""
    suite.section("Web-Kanal: abgelaufene Einladung")
    if not token:
        suite.skip("[W8]/[W9]", "keine kurzlebige Einladung vorhanden")
        return
    wait = exp + 3 - time.time()  # die Sekunde exp gilt noch als gültig
    if wait > 0:
        print(f"Warte {wait:.0f} s bis zum Ablauf der Einladung ...")
        time.sleep(wait)
    suite.case("[W8] GET /web-survey mit abgelaufener Einladung (200, status expired)",
               lambda: api.public("GET", "/web-survey", params={"token": token}),
               200, json_field("status", "expired"))
    suite.case("[W9] POST /web-survey/submit mit abgelaufener Einladung (403 expired)",
               lambda: api.public("POST", "/web-survey/submit",
                                  body={"token": token, "surveyVersion": 1, "answers": {}}),
               403, json_field("status", "expired"))


def tests_survey_responses(suite: Suite, api: PollyApi, cfg: argparse.Namespace, conversation_id: str) -> None:
    suite.section("Antworten: POST /survey-responses")

    def answer(question_name: str, question_type: str, value: Any, completed: bool) -> Callable[[], Response]:
        body = {
            "conversationId": conversation_id,
            "surveyId": cfg.survey_id,
            "surveyName": cfg.survey_name,
            "surveyVersion": cfg.survey_version,
            "questionName": question_name,
            "questionType": question_type,
            "value": value,
            "isCompleted": completed,
        }
        return lambda: api.genesys("POST", "/survey-responses", body=body)

    suite.case("[1] POST /survey-responses – yes_no Antwort", answer("ja_oder_nein_46d4db2f", "yes_no", False, False))
    suite.case("[2] POST /survey-responses – nps Antwort", answer("nps_ce9b05b7", "nps", 9, False))
    suite.case("[3] POST /survey-responses – rating Antwort", answer("bewertung_3557a5bf", "rating", 5, False))
    suite.case("[4] POST /survey-responses – choice Antwort", answer("auswahl_frucht_58bd0bde", "choice", "Äpfel", False))
    suite.case("[5] POST /survey-responses – comment Antwort, Session abschließen",
               answer("kommentar_e80f5583", "comment",
                      "Wartezeit war etwas lang, aber der Support sehr freundlich.", True))

    suite.section("Auswertung")
    suite.case("[7] GET /survey-responses/session",
               lambda: api.genesys("GET", "/survey-responses/session", params={"conversationId": conversation_id}))
    suite.case("[8] GET /survey-responses/aggregates",
               lambda: api.genesys("GET", "/survey-responses/aggregates", params={"surveyId": cfg.survey_id}))

    def raw(**extra) -> Callable[[], Response]:
        return lambda: api.genesys("GET", "/survey-responses/raw", params={"surveyId": cfg.survey_id, **extra})

    suite.case("[9] GET /survey-responses/raw?status=completed&limit=10", raw(status="completed", limit=10))
    suite.case("[10] GET /survey-responses/raw?status=partial", raw(status="partial"))
    suite.case("[11] GET /survey-responses/raw?status=timed_out", raw(status="timed_out"))

    first_page = suite.case("[12] GET /survey-responses/raw?limit=1 (Cursor-Paginierung, Seite 1)", raw(limit=1))
    cursor = (first_page.json() or {}).get("nextCursor") if first_page and isinstance(first_page.json(), dict) else None
    if cursor:
        suite.case("[12b] GET /survey-responses/raw?cursor=… (Seite 2)", raw(limit=1, cursor=cursor))
    else:
        suite.skip("[12b]", "weniger als zwei Antworten, kein nextCursor")

    suite.section("CSV-Export")
    now = datetime.now(timezone.utc)
    export_from = (now - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00.000Z")
    export_to = now.strftime("%Y-%m-%dT23:59:59.999Z")
    window = {"surveyId": cfg.survey_id, "from": export_from, "to": export_to}

    suite.case("[12a] GET /survey-responses/export/summary",
               lambda: api.genesys("GET", "/survey-responses/export/summary", params=window))
    suite.case("[12c] GET /survey-responses/export (CSV, Header x-sessions/x-rows)",
               lambda: api.genesys("GET", "/survey-responses/export",
                                   params={**window, "version": cfg.survey_version}),
               200, header_present("x-sessions", "x-rows"))
    suite.case("[12d] GET /survey-responses/export – fehlende from/to (400)",
               lambda: api.genesys("GET", "/survey-responses/export", params={"surveyId": cfg.survey_id}), 400)
    bad_cursor = base64.b64encode(json.dumps({
        "tenantId": "fremd",
        "responseId": "x",
        "surveyStartedAt": f"{cfg.survey_id}#2026-01-01T00:00:00.000Z",
    }, separators=(",", ":")).encode()).decode()
    suite.case("[12e] GET /survey-responses/export – manipulierter Cursor (400)",
               lambda: api.genesys("GET", "/survey-responses/export", params={**window, "cursor": bad_cursor}), 400)
    suite.case("[12f] GET /survey-responses/export – kein Token (401)",
               lambda: api.public("GET", "/survey-responses/export", params=window), 401)


def tests_survey_responses_errors(suite: Suite, api: PollyApi, cfg: argparse.Namespace, conversation_id: str) -> None:
    suite.section("Fehlerfälle: POST /survey-responses")
    nps = {"surveyId": cfg.survey_id, "questionName": "nps_ce9b05b7", "questionType": "nps", "value": 5}
    unknown_survey_id = str(uuid.uuid4())

    suite.case("[13] fehlende conversationId (400)",
               lambda: api.genesys("POST", "/survey-responses", body=nps), 400)
    suite.case("[14] kein questionName, kein isCompleted (400)",
               lambda: api.genesys("POST", "/survey-responses",
                                   body={"conversationId": conversation_id, "surveyId": cfg.survey_id}), 400)
    suite.case("[15] kein Token (401)",
               lambda: api.public("POST", "/survey-responses",
                                  body={"conversationId": conversation_id, **nps}), 401)
    suite.case("[16] ungültiges Token (401)",
               lambda: api.genesys("POST", "/survey-responses", token="invalidTokenhahahahaxxor",
                                   body={"conversationId": conversation_id, **nps}), 401)
    suite.case(f"[17] unbekannte Umfrage {unknown_survey_id} (404 survey_not_found)",
               lambda: api.genesys("POST", "/survey-responses", body={
                   "conversationId": f"{conversation_id}-unknown", "surveyId": unknown_survey_id,
                   "questionName": "q", "questionType": "nps", "value": 5}),
               404, text_contains("survey_not_found"))
    suite.case("[18] surveyId keine UUID (400)",
               lambda: api.genesys("POST", "/survey-responses", body={
                   "conversationId": f"{conversation_id}-baduuid", "surveyId": "kein-uuid",
                   "questionName": "q", "questionType": "nps", "value": 5}), 400)


def tests_delete(suite: Suite, api: PollyApi, cfg: argparse.Namespace, conversation_id: str) -> None:
    """DELETE /survey-responses; braucht die Data Table der Umfragen."""
    suite.section("Ergebnisse löschen: DELETE /survey-responses")
    if not cfg.datatable_id:
        suite.skip("[D1]–[D4]", "DATATABLE_ID nicht gesetzt")
        return

    if cfg.existing_survey_id:
        suite.case("[D1] existierende Umfrage (409, nichts wird gelöscht)",
                   lambda: api.genesys("DELETE", "/survey-responses", params={
                       "surveyId": cfg.existing_survey_id, "datatableId": cfg.datatable_id}), 409)
    else:
        suite.skip("[D1]", "EXISTING_SURVEY_ID nicht gesetzt")

    deleted_survey_id = str(uuid.uuid4())
    suite.case(f"[D2] nie existierende Umfrage {deleted_survey_id} (202)",
               lambda: api.genesys("DELETE", "/survey-responses", params={
                   "surveyId": deleted_survey_id, "datatableId": cfg.datatable_id}), 202)
    suite.case("[D3] GET /survey-responses/delete-status",
               lambda: api.genesys("GET", "/survey-responses/delete-status", params={"surveyId": deleted_survey_id}))
    suite.case("[D4] Antwort zur gelöschten Umfrage (ignored: true)",
               lambda: api.genesys("POST", "/survey-responses", body={
                   "conversationId": f"{conversation_id}-del", "surveyId": deleted_survey_id,
                   "questionName": "q", "questionType": "nps", "value": 5}),
               200, json_field("ignored", True))


def tests_web_themes(suite: Suite, api: PollyApi, cfg: argparse.Namespace) -> None:
    """GET/PUT/DELETE /web-themes. Schreiben braucht polly_deploy."""
    suite.section("Web-Designs: /web-themes")
    theme_id = str(uuid.uuid4())
    theme_body = {"name": "curl-Test", "isDefault": False,
                  "tokens": {"fontFamily": "serif", "colors": {"primary": "#aa0000"}}}
    path = f"/web-themes/{theme_id}"

    suite.case("[T1] GET /web-themes (Liste der Designs)", lambda: api.genesys("GET", "/web-themes"))
    suite.case("[T2] PUT /web-themes ohne Token (401)",
               lambda: api.public("PUT", path, body=theme_body), 401)
    suite.case("[T3] PUT /web-themes mit CSS in einer Farbe (400 invalid_request, nichts gespeichert)",
               lambda: api.genesys("PUT", path, body={
                   "name": "x", "isDefault": False,
                   "tokens": {"colors": {"text": "url(https://evil.example)"}}}),
               400, text_contains("invalid_request"))
    suite.case("[T4] PUT /web-themes mit ungültiger ID (400 invalid_request)",
               lambda: api.genesys("PUT", "/web-themes/kein-uuid", body=theme_body),
               400, text_contains("invalid_request"))

    if cfg.token_no_deploy:
        suite.case("[T5] PUT /web-themes ohne Rolle polly_deploy (403 missing_role)",
                   lambda: api.genesys("PUT", path, token=cfg.token_no_deploy, body=theme_body),
                   403, text_contains("missing_role"))
    else:
        suite.skip("[T5]", "GENESYS_TOKEN_NO_DEPLOY nicht gesetzt")

    if cfg.web_theme_write:
        suite.case(f"[T6] PUT /web-themes/{theme_id} (Design angelegt, braucht polly_deploy)",
                   lambda: api.genesys("PUT", path, body=theme_body))
        suite.case(f"[T7] DELETE /web-themes/{theme_id}", lambda: api.genesys("DELETE", path))
    else:
        suite.skip("[T6]/[T7]", "WEB_THEME_WRITE nicht gesetzt")


def tests_preview(suite: Suite, api: PollyApi, cfg: argparse.Namespace) -> None:
    """Webvorschau des Stage-Stands (POST /invitations/preview, braucht polly_deploy)."""
    suite.section("Webvorschau: /invitations/preview")
    survey_id = cfg.preview_survey_id or cfg.survey_id

    suite.case("[P1] POST /invitations/preview ohne Token (401)",
               lambda: api.public("POST", "/invitations/preview", body={"surveyId": survey_id}), 401)
    suite.case("[P2] POST /invitations/preview mit ungültiger surveyId (400 invalid_request)",
               lambda: api.genesys("POST", "/invitations/preview", body={"surveyId": "kein-uuid"}),
               400, text_contains("invalid_request"))
    created = suite.case("[P3] POST /invitations/preview (200 mit jwt; 409 no_stage ohne Stage-Stand)",
                         lambda: api.genesys("POST", "/invitations/preview", body={"surveyId": survey_id}),
                         (200, 409))

    body = created.json() if created is not None else None
    jwt = body.get("jwt") if isinstance(body, dict) and created.status == 200 else None
    if created is not None and created.status == 200 and isinstance(body, dict) and body.get("exp"):
        remaining_days = (body["exp"] - time.time()) / 86400
        if not 6.9 < remaining_days < 7.1:
            print(f"      Hinweis: exp liegt {remaining_days:.2f} Tage in der Zukunft, erwartet 7")
    if not jwt:
        suite.skip("[P4]–[P6]", "kein Vorschau-Token erhalten")
        return

    preview = suite.case("[P4] GET /web-survey mit Vorschau-Token (status ok, preview: true)",
                         lambda: api.public("GET", "/web-survey", params={"token": jwt}),
                         200, json_field("status", "ok"), json_field("preview", True))
    survey = (preview.json() or {}).get("survey") if preview and isinstance(preview.json(), dict) else None
    version = survey.get("version", 0) if isinstance(survey, dict) else 0

    suite.case("[P5] POST /web-survey/submit mit falscher surveyVersion (409 survey_changed, preview: true)",
               lambda: api.public("POST", "/web-survey/submit",
                                  body={"token": jwt, "surveyVersion": -1, "answers": {}}),
               409, text_contains("survey_changed"), json_field("preview", True))
    suite.case("[P6] POST /web-survey/submit ohne Antworten (200 preview: true; 400 invalid_answers bei Pflichtfragen)",
               lambda: api.public("POST", "/web-survey/submit",
                                  body={"token": jwt, "surveyVersion": version, "answers": {}}),
               (200, 400))


# -------------------------------------------------------------------
# main
# -------------------------------------------------------------------

def env_default(name: str, default: Any = None) -> Any:
    return os.environ.get(name, default)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="survey_responses API – Testsuite", formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("--survey-id", default=env_default("SURVEY_ID", "1718e427-0661-4716-95f5-4b1e4bc0233a"))
    p.add_argument("--survey-name", default=env_default("SURVEY_NAME", "mini_1718e427"))
    p.add_argument("--survey-version", type=int, default=int(env_default("SURVEY_VERSION", 5)))
    p.add_argument("--datatable-id", default=env_default("DATATABLE_ID", ""))
    p.add_argument("--existing-survey-id", default=env_default("EXISTING_SURVEY_ID", ""))
    p.add_argument("--preview-survey-id", default=env_default("PREVIEW_SURVEY_ID", ""))
    p.add_argument("--web-token", default=env_default("WEB_TOKEN", ""))
    p.add_argument("--web-theme-write", action="store_true", default=env_default("WEB_THEME_WRITE") == "1")
    p.add_argument("-k", "--insecure", action="store_true", default=env_default("INSECURE") == "1")
    p.add_argument("-v", "--verbose", action="store_true")
    cfg = p.parse_args()
    # Tokens und URL nur aus der Umgebung
    cfg.api_url = env_default("API_URL", "")
    cfg.region = env_default("GENESYS_REGION", DEFAULT_REGION)
    cfg.token = env_default("GENESYS_TOKEN", "")
    cfg.token_no_deploy = env_default("GENESYS_TOKEN_NO_DEPLOY", "")
    return cfg


def main() -> int:
    cfg = parse_args()
    if not cfg.api_url:
        print("Fehler: API_URL ist nicht gesetzt.\n"
              "Bitte die Basis-URL inkl. Präfix setzen, z. B. export API_URL=https://<app>.amplifyapp.com/api")
        return 1
    ssl_context = ssl._create_unverified_context() if cfg.insecure else None  # noqa: SLF001
    api = PollyApi(cfg.api_url, cfg.region, cfg.token, ssl_context)
    suite = Suite(cfg.verbose)
    conversation_id = f"test-conv-{int(time.time())}"

    print(f"API: {api.base_url}\nRegion: {cfg.region}\nConversationId: {conversation_id}")

    tests_web_public(suite, api)

    if not cfg.token:
        print("\nFehler: Kein Genesys-Token angegeben. Bitte GENESYS_TOKEN setzen,\n"
              "z. B. export GENESYS_TOKEN=<GENESYS_BEARER_TOKEN> (Dev-Tools im Genesys-Cloud-Portal).")
        suite.summary()
        return 1

    prepare_invitations(suite, api, cfg)
    tests_web_invitation(suite, api, cfg.web_token)
    tests_survey_responses(suite, api, cfg, conversation_id)
    tests_survey_responses_errors(suite, api, cfg, conversation_id)
    tests_delete(suite, api, cfg, conversation_id)
    tests_web_themes(suite, api, cfg)
    tests_preview(suite, api, cfg)
    tests_web_expired(suite, api, cfg.expiring_token, cfg.expiring_exp)
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
