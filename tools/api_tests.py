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
  API_CLIENT_ID           optional: Client-ID eines API-Zugangs (Kunden-API /ext/v1) mit allen fünf Scopes
                          (ohne themes.read/themes.write entfallen [C28]–[C34])
  API_CLIENT_SECRET       dazu das Client-Secret
  API_TOKEN_URL           dazu die Token-URL (…/oauth2/token); ohne alle drei entfallen die Fälle [C1]–[C34]

Optionen (jeweils auch per gleichnamiger Umgebungsvariable in Großbuchstaben):
  --survey-id             Umfrage für die Antworttests, muss in der Data Table DIESER Installation
                          existieren, sonst liefern [1]–[5] 404
  --survey-name           Name der Umfrage (Default mini_1718e427; mit --datatable-id aus Prod gelesen)
  --survey-version        Version der Umfrage (Default 5; mit --datatable-id aus Prod gelesen)
  --datatable-id          Data Table der Umfragen: Name, Version und Fragen der Antworttests kommen aus der
                          Spalte Prod von survey_<id> (Fehler [S2], wenn nicht deployt); ohne sie gelten die
                          festen Fragen von mini_1718e427, und die Lösch-Tests [D1]–[D4] entfallen
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

def check_genesys_token(suite: Suite, cfg: argparse.Namespace, ssl_context: Optional[ssl.SSLContext]) -> bool:
    """Prüft GENESYS_TOKEN direkt bei Genesys (GET /api/v2/users/me); bei Fehler bricht main() ab."""
    suite.section(f"Genesys-Token: https://api.{cfg.region}/api/v2/users/me")
    genesys = HttpClient(f"https://api.{cfg.region}", ssl_context)
    res = suite.case("[G1] GET /api/v2/users/me (200, id)",
                     lambda: genesys.request("GET", "/api/v2/users/me",
                                             headers={"Authorization": f"Bearer {cfg.token}"}),
                     200, json_has("id"))
    body = res.json() if res is not None and res.status == 200 else None
    if isinstance(body, dict) and body.get("name"):
        print(f"Angemeldet als {body['name']}")
    return res is not None and res.status == 200 and isinstance(body, dict) and bool(body.get("id"))


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


DEFAULT_QUESTIONS = [
    ("ja_oder_nein_46d4db2f", "yes_no", False),
    ("nps_ce9b05b7", "nps", 9),
    ("bewertung_3557a5bf", "rating", 5),
    ("auswahl_frucht_58bd0bde", "choice", "Äpfel"),
    ("kommentar_e80f5583", "comment", "Wartezeit war etwas lang, aber der Support sehr freundlich."),
]


def sample_answer(question: dict) -> Any:
    """Gültiger Beispielwert zu einer Frage aus dem Prod-Flow-JSON."""
    qtype = question.get("type")
    if qtype == "yes_no":
        return False
    if qtype == "nps":
        return 9
    if qtype == "rating":
        values = (question.get("options") or {}).get("values") or []
        return values[-1] if values else 1
    if qtype == "choice":
        labels = question.get("labels") or []
        return labels[0] if labels else ""
    return "Testantwort aus api_tests.py"


def load_prod_questions(suite: Suite, api: PollyApi, cfg: argparse.Namespace) -> None:
    """Liest Name, Version und Fragen aus der Spalte Prod der Umfragezeile (Genesys) in cfg.

    Ohne --datatable-id bleiben die festen Vorgaben (mini_1718e427); mit ihr ist ein fehlender
    Prod-Stand ein Fehler, und die Antworttests verwenden die echten Fragen der Umfrage."""
    cfg.questions = DEFAULT_QUESTIONS
    suite.section("Umfrage: Prod-Stand aus der Data Table")
    if not cfg.datatable_id:
        suite.skip("[S1]", "DATATABLE_ID nicht gesetzt, feste Fragen von --survey-name")
        return
    genesys = HttpClient(f"https://api.{cfg.region}", api.ssl_context)
    res = suite.case("[S1] Zeile survey_<id> aus der Data Table lesen",
                     lambda: genesys.request("GET", f"/api/v2/flows/datatables/{cfg.datatable_id}/rows/"
                                             f"survey_{cfg.survey_id}", params={"showbrief": "false"},
                                             headers={"Authorization": f"Bearer {cfg.token}"}),
                     200)
    row = res.json() if res is not None and res.status == 200 else None
    try:
        prod = json.loads(row.get("Prod") or "") if isinstance(row, dict) else None
    except ValueError:
        prod = None
    questions = prod.get("questions") if isinstance(prod, dict) else None
    suite.case("[S2] Prod-Stand vorhanden und nicht leer (sonst nicht deployt)",
               lambda: Response(200 if questions else 404, {}, ""), 200)
    if not questions:
        return
    cfg.survey_name = prod.get("name", cfg.survey_name)
    cfg.survey_version = prod.get("version", cfg.survey_version)
    cfg.questions = [(q["name"], q["type"], sample_answer(q)) for q in questions
                     if isinstance(q, dict) and q.get("name") and q.get("type")]
    print(f"Umfrage {cfg.survey_name} Version {cfg.survey_version}, {len(cfg.questions)} Fragen")


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

    for number, (name, qtype, value) in enumerate(cfg.questions, start=1):
        last = number == len(cfg.questions)
        suite.case(f"[{number}] POST /survey-responses – {qtype} Antwort" + (", Session abschließen" if last else ""),
                   answer(name, qtype, value, last))

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
    first_name, first_type, first_value = cfg.questions[0]
    nps = {"surveyId": cfg.survey_id, "questionName": first_name, "questionType": first_type, "value": first_value}
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


def tests_mcp_settings(suite: Suite, api: PollyApi, cfg: argparse.Namespace) -> None:
    """/mcp-settings (Lambda mcp_admin). Aktivieren und Deaktivieren sind nicht dabei: Sie legen einen Genesys-Client an."""
    suite.section("MCP-Schalter: /mcp-settings")
    path = "/mcp-settings"

    suite.case("[M1] GET /mcp-settings ohne Token (401)", lambda: api.public("GET", path), 401)
    suite.case("[M2] PUT /mcp-settings ohne Token (401)",
               lambda: api.public("PUT", path, body={"allowComments": True}), 401)
    suite.case("[M3] DELETE /mcp-settings ohne Token (401)", lambda: api.public("DELETE", path), 401)

    if cfg.api_client_id and cfg.api_client_secret and cfg.api_token_url:
        basic = base64.b64encode(f"{cfg.api_client_id}:{cfg.api_client_secret}".encode()).decode()
        try:
            token_res = HttpClient(cfg.api_token_url, api.ssl_context).request(
                "POST", "", body=urllib.parse.urlencode({"grant_type": "client_credentials"}),
                headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"})
        except (urllib.error.URLError, OSError) as exc:
            # Netz- oder TLS-Fehler beim Token-Endpunkt darf den restlichen Lauf nicht beenden
            suite.skip("[M4]", f"Token-Endpunkt nicht erreichbar ({exc})")
            return
        body = token_res.json() if token_res.status == 200 else None
        cognito_token = body.get("access_token", "") if isinstance(body, dict) else ""
        if cognito_token:
            # Ein Cognito-Token gehört nie zu einem Genesys-User: 403 (M2M des Mandanten) oder 401 (unbekannter Client)
            suite.case("[M4] GET /mcp-settings mit Cognito-Token (401 oder 403, nie 200)",
                       lambda: api.request("GET", path, headers={"Authorization": f"Bearer {cognito_token}"}), (401, 403))
        else:
            suite.skip("[M4]", "kein Cognito-Token erhalten")
    else:
        suite.skip("[M4]", "API_CLIENT_ID, API_CLIENT_SECRET oder API_TOKEN_URL nicht gesetzt")

    if cfg.token_no_deploy:
        suite.case("[M5] GET /mcp-settings ohne Rolle polly_deploy (403 missing_role)",
                   lambda: api.genesys("GET", path, token=cfg.token_no_deploy), 403, text_contains("missing_role"))
        suite.case("[M6] PUT /mcp-settings ohne Rolle polly_deploy (403 missing_role, nichts geändert)",
                   lambda: api.genesys("PUT", path, token=cfg.token_no_deploy, body={"allowComments": False}),
                   403, text_contains("missing_role"))
        suite.case("[M7] DELETE /mcp-settings ohne Rolle polly_deploy (403 missing_role, MCP bleibt an)",
                   lambda: api.genesys("DELETE", path, token=cfg.token_no_deploy), 403, text_contains("missing_role"))
    else:
        suite.skip("[M5]–[M7]", "GENESYS_TOKEN_NO_DEPLOY nicht gesetzt")

    # Beide Fälle scheitern vor jeder Änderung an der Eingabe
    suite.case("[M8] PUT /mcp-settings ohne Felder (400 invalid_request)",
               lambda: api.genesys("PUT", path, body={}), 400, text_contains("invalid_request"))
    suite.case("[M9] PUT /mcp-settings mit ungültiger Client-ID (400 invalid_request)",
               lambda: api.genesys("PUT", path, body={"clientId": "kein-uuid", "clientSecret": "x"}),
               400, text_contains("invalid_request"))
    suite.case("[M10] GET /mcp-settings mit polly_deploy (200, MCP-URL und Redirect-URI; erzeugt den URL-Schlüssel)",
               lambda: api.genesys("GET", path), 200, json_has("mcpUrl", "redirectUri"))


def tests_customer_api(suite: Suite, api: PollyApi, cfg: argparse.Namespace, conversation_id: str) -> None:
    """Kunden-API /ext/v1 mit Client Credentials. Braucht die Session aus tests_survey_responses."""
    suite.section("Kunden-API: /ext/v1")
    if not (cfg.api_client_id and cfg.api_client_secret and cfg.api_token_url):
        suite.skip("[C1]–[C34]", "API_CLIENT_ID, API_CLIENT_SECRET oder API_TOKEN_URL nicht gesetzt")
        return

    basic = base64.b64encode(f"{cfg.api_client_id}:{cfg.api_client_secret}".encode()).decode()
    token_endpoint = HttpClient(cfg.api_token_url, api.ssl_context)

    def fetch_token(scope: Optional[str] = None) -> Callable[[], Response]:
        form = {"grant_type": "client_credentials", **({"scope": scope} if scope else {})}
        return lambda: token_endpoint.request(
            "POST", "", body=urllib.parse.urlencode(form),
            headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"})

    def access_token(res: Optional[Response]) -> str:
        body = res.json() if res is not None and res.status == 200 else None
        return body.get("access_token", "") if isinstance(body, dict) else ""

    def ext(method: str, path: str, token: str, **kwargs) -> Callable[[], Response]:
        return lambda: api.request(method, f"/ext/v1{path}", headers={"Authorization": f"Bearer {token}"}, **kwargs)

    def is_list(name: str, minimum: int = 0) -> BodyCheck:
        def check(res: Response) -> Optional[str]:
            body = res.json()
            value = body.get(name) if isinstance(body, dict) else None
            if not isinstance(value, list):
                return f"{name} ist keine Liste"
            return None if len(value) >= minimum else f"{name} hat {len(value)} Einträge, erwartet mindestens {minimum}"
        return check

    def items(res: Response, name: str) -> list:
        body = res.json()
        value = body.get(name) if isinstance(body, dict) else None
        return value if isinstance(value, list) else []

    def error_code(code: str) -> BodyCheck:
        return json_field("error", code)

    full = access_token(suite.case("[C1] Token mit allen Scopes holen (200, access_token)", fetch_token(),
                                   200, json_has("access_token")))
    reporting_only = access_token(suite.case("[C2] Token nur mit reporting.read holen (200)",
                                             fetch_token("polly-api/reporting.read"), 200, json_has("access_token")))
    if not full or not reporting_only:
        suite.skip("[C3]–[C34]", "kein Token erhalten")
        return

    now = datetime.now(timezone.utc)
    stamp = "%Y-%m-%dT%H:%M:%S"
    window = {"surveyId": cfg.survey_id, "from": (now - timedelta(hours=1)).strftime(stamp),
              "to": (now + timedelta(hours=1)).strftime(stamp)}

    def has_session(res: Response) -> Optional[str]:
        body = res.json()
        data = body.get("data") if isinstance(body, dict) else None
        if not isinstance(data, list):
            return "data ist keine Liste"
        mine = [r for r in data if isinstance(r, dict) and r.get("responseId") == conversation_id]
        if not mine:
            return f"keine Antwort der Session {conversation_id} im Zeitraum (insgesamt {len(data)} Datensätze)"
        wrong = [r for r in mine if r.get("conversationId") != conversation_id or r.get("channel") != "flow"]
        return "conversationId/channel der Flow-Session stimmt nicht" if wrong else None

    data = suite.case("[C3] GET /reporting/data liefert die Session des Testlaufs", ext("GET", "/reporting/data", full,
                      params={**window, "limit": 1000}), 200, json_has("pagination"), has_session)
    reported = [r for r in items(data, "data") if isinstance(r, dict)] if data is not None and data.status == 200 else []

    suite.case("[C4] GET /reporting/data ohne surveyId (400 invalid_request)",
               ext("GET", "/reporting/data", full, params={k: v for k, v in window.items() if k != "surveyId"}),
               400, error_code("invalid_request"))
    suite.case("[C5] GET /reporting/data mit Zeitraum über 24 h (400 invalid_request)",
               ext("GET", "/reporting/data", full, params={
                   **window, "from": (now - timedelta(hours=30)).strftime(stamp)}),
               400, error_code("invalid_request"))
    suite.case("[C6] GET /reporting/data mit Z am Datum (400 invalid_request)",
               ext("GET", "/reporting/data", full, params={**window, "to": window["to"] + "Z"}),
               400, error_code("invalid_request"))
    suite.case("[C7] GET /reporting/data hinter der letzten Seite (200, data leer)",
               ext("GET", "/reporting/data", full, params={**window, "page": 9999}), 200, lambda res: None
               if isinstance(res.json(), dict) and res.json().get("data") == [] else "data ist nicht leer")

    expiration = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    invites = suite.case("[C8] POST /invitations erzeugt amount Links (200, inviteUrls)",
                         ext("POST", "/invitations", full, body={
                             "survey_uuid": cfg.survey_id, "amount": 2, "is_multi": True,
                             "expiration_date": expiration}),
                         200, is_list("inviteUrls", 2),
                         lambda res: None if len(items(res, "inviteUrls")) == 2 else "nicht genau 2 Einträge")
    invite_token = ""
    if invites is not None and invites.status == 200:
        first = (items(invites, "inviteUrls") or [{}])[0]
        invite_token = first.get("inviteToken", "") if isinstance(first, dict) else ""
        first = first if isinstance(first, dict) else {}
        if first.get("expiration_date") != expiration or first.get("is_multi") is not True:
            print(f"      Hinweis: erster Eintrag hat expiration_date/is_multi {first.get('expiration_date')!r}/"
                  f"{first.get('is_multi')!r}, erwartet {expiration!r}/True")
        if invite_token and invite_token not in first.get("fullLink", ""):
            print("      Hinweis: fullLink enthält den inviteToken nicht")
    if invite_token:
        suite.case("[C9] GET /web-survey akzeptiert einen erzeugten Token (status ok)",
                   lambda: api.public("GET", "/web-survey", params={"token": invite_token}),
                   200, json_field("status", "ok"))
    else:
        suite.skip("[C9]", "kein Einladungstoken erhalten")

    suite.case("[C10] POST /invitations mit amount 0 (400 invalid_request)",
               ext("POST", "/invitations", full, body={"survey_uuid": cfg.survey_id, "amount": 0, "is_multi": True}),
               400, error_code("invalid_request"))
    suite.case("[C11] POST /invitations mit vergangenem Ablaufdatum (400 invalid_request)",
               ext("POST", "/invitations", full, body={
                   "survey_uuid": cfg.survey_id, "amount": 1, "is_multi": True, "expiration_date": "2020-01-01"}),
               400, error_code("invalid_request"))
    suite.case("[C12] POST /invitations für unbekannte Umfrage (409 no_prod)",
               ext("POST", "/invitations", full, body={
                   "survey_uuid": str(uuid.uuid4()), "amount": 1, "is_multi": True}),
               409, error_code("no_prod"))

    suite.case("[C13] GET /surveys enthält die Testumfrage", ext("GET", "/surveys", full), 200,
                         is_list("surveys", 1),
                         lambda res: None if any(isinstance(s, dict) and s.get("surveyId") == cfg.survey_id
                                                 for s in items(res, "surveys"))
                         else f"Umfrage {cfg.survey_id} fehlt in der Liste")
    detail = suite.case("[C14] GET /surveys/{surveyId} liefert Fragen",
                        ext("GET", f"/surveys/{cfg.survey_id}", full), 200, is_list("questions", 1))
    survey = detail.json() if detail is not None and detail.status == 200 else None
    if isinstance(survey, dict):
        # Nur Antworten zum Prod-Stand vergleichen: [1]–[5] schreiben feste Fragennamen von --survey-name,
        # die zu einer anderen --survey-id nicht passen müssen
        matching = {r.get("questionId") for r in reported
                    if r.get("surveyName") == survey.get("name") and r.get("surveyVersion") == survey.get("version")}
        if survey.get("name") != cfg.survey_name:
            print(f"      Hinweis: Umfrage heißt {survey.get('name')!r}, --survey-name ist {cfg.survey_name!r}; "
                  "die Antworten aus [1]–[5] zählen für [C14b] nicht")
        if matching:
            known = {q.get("questionId") for q in items(detail, "questions") if isinstance(q, dict)}
            suite.case("[C14b] questionId aus dem Reporting passen zu den Umfragedetails", lambda: detail, 200,
                       lambda res: None if matching <= known
                       else f"questionId fehlen in den Details: {sorted(matching - known)}")
        else:
            suite.skip("[C14b]", f"keine Antworten zu {survey.get('name')} Version {survey.get('version')} im Zeitraum")
    else:
        suite.skip("[C14b]", "keine Umfragedetails erhalten")
    suite.case("[C15] GET /surveys/{surveyId} unbekannt (404 not_found)",
               ext("GET", f"/surveys/{uuid.uuid4()}", full), 404, error_code("not_found"))
    suite.case("[C16] GET /surveys/kein-uuid (400 invalid_request)",
               ext("GET", "/surveys/kein-uuid", full), 400, error_code("invalid_request"))

    suite.case("[C17] GET /reporting/data ohne Token (401 invalid_token)",
               lambda: api.public("GET", "/ext/v1/reporting/data", params=window), 401, error_code("invalid_token"))
    suite.case("[C18] POST /invitations mit reporting.read-Token (403 insufficient_scope)",
               ext("POST", "/invitations", reporting_only, body={
                   "survey_uuid": cfg.survey_id, "amount": 1, "is_multi": True}),
               403, error_code("insufficient_scope"))
    suite.case("[C19] GET /surveys mit reporting.read-Token (403 insufficient_scope)",
               ext("GET", "/surveys", reporting_only), 403, error_code("insufficient_scope"))
    suite.case("[C20] GET /reporting/data mit reporting.read-Token (200)",
               ext("GET", "/reporting/data", reporting_only, params=window), 200)
    suite.case("[C21] Kunden-Token an App-Route /survey-responses/aggregates (401 oder 403)",
               lambda: api.request("GET", "/survey-responses/aggregates", params={"surveyId": cfg.survey_id},
                                   headers={"Authorization": f"Bearer {full}", "x-genesys-region": api.region}),
               (401, 403))

    def counts_of(name: str) -> BodyCheck:
        def check(res: Response) -> Optional[str]:
            body = res.json()
            value = body.get(name) if isinstance(body, dict) else None
            if not isinstance(value, dict):
                return f"{name} ist kein Objekt"
            return None
        return check

    def summary_matches(res: Response) -> Optional[str]:
        body = res.json()
        if not isinstance(body, dict):
            return "Antwort ist kein Objekt"
        sessions = body.get("sessions")
        if not isinstance(sessions, int) or sessions < 1:
            return f"sessions ist {sessions!r}, erwartet mindestens 1 (Session des Testlaufs)"
        for name in ("statusCounts", "channelCounts", "versionCounts"):
            total = sum(v for v in (body.get(name) or {}).values() if isinstance(v, int))
            if total != sessions:
                return f"Summe von {name} ist {total}, sessions ist {sessions}"
        return None if (body.get("channelCounts") or {}).get("flow", 0) >= 1 else "channelCounts enthält keinen flow"

    suite.case("[C22] GET /reporting/summary zählt die Session des Testlaufs (Summen stimmen)",
               ext("GET", "/reporting/summary", full, params=window), 200,
               counts_of("statusCounts"), counts_of("channelCounts"), counts_of("versionCounts"), summary_matches)
    suite.case("[C23] GET /reporting/summary mit Zeitraum über 31 Tage (400 invalid_request)",
               ext("GET", "/reporting/summary", full, params={
                   **window, "from": (now - timedelta(days=40)).strftime(stamp)}),
               400, error_code("invalid_request"))
    suite.case("[C24] GET /reporting/summary ohne Token (401 invalid_token)",
               lambda: api.public("GET", "/ext/v1/reporting/summary", params=window), 401, error_code("invalid_token"))

    def aggregates_ok(res: Response) -> Optional[str]:
        body = res.json()
        questions = body.get("questions") if isinstance(body, dict) else None
        if not isinstance(questions, list):
            return "questions ist keine Liste"
        ids = [q.get("questionId") for q in questions if isinstance(q, dict)]
        if ids != sorted(ids):
            return "questions ist nicht nach questionId sortiert"
        for q in questions:
            if q.get("questionType") == "comment" and q.get("counts") is not None:
                return f"counts bei comment ist nicht null ({q.get('questionId')})"
            if "tenantId" in q or "tenantSurveyId" in q:
                return "interne Felder in der Antwort"
        return None

    suite.case("[C25] GET /reporting/aggregates liefert Fragen sortiert, ohne interne Felder",
               ext("GET", "/reporting/aggregates", full, params={"surveyId": cfg.survey_id}), 200, aggregates_ok)
    suite.case("[C26] GET /reporting/aggregates ohne surveyId (400 invalid_request)",
               ext("GET", "/reporting/aggregates", full), 400, error_code("invalid_request"))
    suite.case("[C27] GET /reporting/aggregates ohne Token (401 invalid_token)",
               lambda: api.public("GET", "/ext/v1/reporting/aggregates", params={"surveyId": cfg.survey_id}),
               401, error_code("invalid_token"))

    # Web-Designs: Export und Import mit fester Test-ID (Upsert, wiederholbar). Der Test löscht nichts,
    # das Design "Polly API-Test" bleibt im Mandanten stehen und wird beim nächsten Lauf überschrieben.
    def token_scopes(token: str) -> list:
        try:
            payload = token.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
            return str(claims.get("scope", "")).split()
        except (IndexError, ValueError):
            return []

    granted = token_scopes(full)
    missing = [scope for scope in ("polly-api/themes.read", "polly-api/themes.write") if scope not in granted]
    if missing:
        suite.skip("[C28]–[C34]", f"dem Client fehlen die Scopes {', '.join(missing)}")
        return

    theme_id = "00000000-0000-4000-8000-00000000a9e1"
    theme_name = "Polly API-Test"
    theme_import = {"themes": [{"themeId": theme_id, "name": theme_name, "isDefault": False,
                                "tokens": {"schemaVersion": 1}}]}

    suite.case("[C28] GET /web-themes liefert eine Liste (200)", ext("GET", "/web-themes", full), 200, is_list("themes"))

    def import_counts(created: int, updated: int) -> BodyCheck:
        def check(res: Response) -> Optional[str]:
            body = res.json()
            if not isinstance(body, dict):
                return "Antwort ist kein Objekt"
            if (body.get("created"), body.get("updated")) != (created, updated):
                return f"created/updated = {body.get('created')}/{body.get('updated')}, erwartet {created}/{updated}"
            saved = [t for t in items(res, "themes") if t.get("themeId") == theme_id]
            return None if saved and saved[0].get("name") == theme_name else "gespeichertes Design fehlt in der Antwort"
        return check

    def import_one_or_two(res: Response) -> Optional[str]:
        # Erster Lauf legt an (1/0), jeder weitere überschreibt (0/1)
        first = import_counts(1, 0)(res)
        return None if first is None or import_counts(0, 1)(res) is None else first

    suite.case("[C29] POST /web-themes/import legt das Test-Design an oder überschreibt es (200)",
               ext("POST", "/web-themes/import", full, body=theme_import), 200, import_one_or_two)
    suite.case("[C30] POST /web-themes/import wiederholt: Upsert überschreibt (200, created 0, updated 1)",
               ext("POST", "/web-themes/import", full, body=theme_import), 200, import_counts(0, 1))

    # Stand des Test-Designs aus [C31], [C33b] prüft damit, dass der abgelehnte Import nichts gespeichert hat
    exported: dict = {}

    def has_test_theme(res: Response) -> Optional[str]:
        found = [t for t in items(res, "themes") if t.get("themeId") == theme_id]
        if not found:
            return "Test-Design fehlt im Export"
        exported.update(found[0])
        extra = set(found[0]) - {"themeId", "name", "isDefault", "updatedAt", "tokens"}
        return f"unerwartete Felder im Export: {sorted(extra)}" if extra else None

    def test_theme_unchanged(res: Response) -> Optional[str]:
        if not exported:
            return "kein Stand aus [C31]"
        found = [t for t in items(res, "themes") if t.get("themeId") == theme_id]
        if not found:
            return "Test-Design fehlt im Export"
        return None if found[0] == exported else f"Test-Design geändert: updatedAt {found[0].get('updatedAt')}"

    suite.case("[C31] GET /web-themes enthält das importierte Design mit festen Feldern",
               ext("GET", "/web-themes", full), 200, has_test_theme)
    suite.case("[C32] POST /web-themes/import mit reporting.read-Token (403 insufficient_scope)",
               ext("POST", "/web-themes/import", reporting_only, body=theme_import), 403,
               error_code("insufficient_scope"))
    suite.case("[C32b] GET /web-themes mit reporting.read-Token (403 insufficient_scope)",
               ext("GET", "/web-themes", reporting_only), 403, error_code("insufficient_scope"))
    suite.case("[C33] POST /web-themes/import mit ungültigen Tokens (400, Index in der Meldung)",
               ext("POST", "/web-themes/import", full, body=
                   {"themes": [{"themeId": theme_id, "name": "Polly API-Test geändert",
                                "tokens": {"colors": {"primary": "rot"}}}]}),
               400, json_field("message", "themes[0].tokens are invalid"))
    suite.case("[C33b] GET /web-themes: Test-Design nach [C33] unverändert (nichts gespeichert)",
               ext("GET", "/web-themes", full), 200, test_theme_unchanged)
    suite.case("[C34] GET /web-themes ohne Token (401 invalid_token)",
               lambda: api.public("GET", "/ext/v1/web-themes"), 401, error_code("invalid_token"))


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
    cfg.api_client_id = env_default("API_CLIENT_ID", "")
    cfg.api_client_secret = env_default("API_CLIENT_SECRET", "")
    cfg.api_token_url = env_default("API_TOKEN_URL", "")
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

    if cfg.token and not check_genesys_token(suite, cfg, ssl_context):
        print("\nAbbruch: Das Genesys-Token ist ungültig oder abgelaufen (GENESYS_TOKEN neu holen).")
        suite.summary()
        return 1

    tests_web_public(suite, api)

    if not cfg.token:
        print("\nFehler: Kein Genesys-Token angegeben. Bitte GENESYS_TOKEN setzen,\n"
              "z. B. export GENESYS_TOKEN=<GENESYS_BEARER_TOKEN> (Dev-Tools im Genesys-Cloud-Portal).")
        suite.summary()
        return 1

    load_prod_questions(suite, api, cfg)
    prepare_invitations(suite, api, cfg)
    tests_web_invitation(suite, api, cfg.web_token)
    tests_survey_responses(suite, api, cfg, conversation_id)
    tests_survey_responses_errors(suite, api, cfg, conversation_id)
    tests_customer_api(suite, api, cfg, conversation_id)
    tests_delete(suite, api, cfg, conversation_id)
    tests_web_themes(suite, api, cfg)
    tests_mcp_settings(suite, api, cfg)
    tests_preview(suite, api, cfg)
    tests_web_expired(suite, api, cfg.expiring_token, cfg.expiring_exp)
    return suite.summary()


if __name__ == "__main__":
    sys.exit(main())
