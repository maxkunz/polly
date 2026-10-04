#!/usr/bin/env python3
"""
survey_responses API – universeller Massendaten-Generator
=============================================================
Liest eine Umfrage-Definition (Draft-JSON, siehe documentation/survey_definition.md),
spielt zufällige Sessions entlang des Fragenbaums durch und schickt die Antworten
schrittweise an die deployte API, genau wie der Architect Flow es tun würde.

Verwendung:
  export GENESYS_TOKEN=<Bearer aus dem Genesys-Portal>
  python3 test/survey_responses_bulk.py umfrage.json [-n ANZAHL_SESSIONS]
  python3 test/survey_responses_bulk.py --surveyid <UUID> [-n ANZAHL_SESSIONS]

Optionen (jeweils auch per Umgebungsvariable):
  --surveyid              UUID einer Umfrage: statt der JSON-Datei wird das Draft-Feld der
                          Zeile survey_<UUID> aus der Genesys Data Table geladen
                          (siehe documentation/datatablerow_survey_entry.md)
  --table / DATA_TABLE_NAME
                          Name der Data Table (Default "Polly Mock Surveys")
  -n / SESSIONS           Anzahl Sessions (Default 200)
  -p / PARALLEL           gleichzeitige Sessions (Default 10)
  --abort-pct / ABORT_PCT Anteil abgebrochener Sessions in % (Default 15)
  --skip-comment-pct / SKIP_COMMENT_PCT
                          Anteil Sessions ohne Schlusskommentar in % (Default 10)
  --answers               Datei mit Kommentar-Antworten, eine pro Zeile
                          (Default: answers.txt neben dem Skript)
  API_URL, GENESYS_REGION wie in survey_responses.sh

ACHTUNG: Schreibt echte Daten in die deployte API.
"""

import argparse
import json
import os
import random
import signal
import sys
import threading
import time
import http.client
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

DEFAULT_API_URL = "https://main.d1a6p4nkkob4i7.amplifyapp.com/api"
DEFAULT_TABLE_NAME = "Polly Mock Surveys"  # POLLY_DATA_TABLE_NAME in src/constants/surveyConstants.ts


def env_int(name, default):
    return int(os.environ.get(name, default))


# ---------------------------------------------------------------- Antwort-Generatoren

def rand_yes_no(_q):
    return random.random() < 0.6


def rand_rating(q):
    """Zufallswert min..max, leicht positiv verteilt (Modus im oberen Viertel)."""
    opts = q.get("options") or {}
    lo, hi = opts.get("min_value", 1), opts.get("max_value", 5)
    return max(lo, min(hi, round(random.triangular(lo, hi, lo + (hi - lo) * 0.8))))


def rand_nps(_q):
    """NPS 0-10: Promoter überwiegen, wenige Detraktoren."""
    r = random.random()
    if r < 0.2:
        return random.randint(0, 6)
    if r < 0.4:
        return random.randint(7, 8)
    return random.randint(9, 10)


def rand_choice(q):
    """Liefert das ganze Options-Objekt (id + label): die id wird für die Pfadsuche
    (Folgefrage-Bedingungen referenzieren Options-IDs) gebraucht, das label für die
    API, die wie der echte Flow nur Labels kennt (siehe survey_responses_api.md)."""
    return random.choice(q["options"]["labels"])


def make_answer_fn(comments):
    generators = {
        "yes_no": rand_yes_no,
        "rating": rand_rating,
        "nps": rand_nps,
        "choice": rand_choice,
        "comment": lambda _q: random.choice(comments),
    }

    def answer(q):
        try:
            return generators[q["type"]](q)
        except KeyError:
            raise SystemExit(f"Unbekannter Fragetyp '{q.get('type')}' in Frage '{q.get('name')}'")

    return answer


# ---------------------------------------------------------------- Pfad durch den Fragenbaum

def condition_matches(cond, value):
    op, ref = cond["operator"], cond["value"]
    if isinstance(value, dict):  # choice-Antwort: Bedingung referenziert die Options-ID
        value = value["id"]
    if op == "equals":
        return value == ref
    if op == "less_than":
        return value < ref
    if op == "greater_than":
        return value > ref
    return False


def walk(questions, answer, path):
    """Tiefensuche: Frage, danach (falls Bedingung passt) die Folgefrage, dann die nächste."""
    for q in questions:
        value = answer(q)
        path.append((q, value))
        for fu in q.get("follow_ups") or []:
            if condition_matches(fu["condition"], value):
                walk([fu["question"]], answer, path)
                break


# ---------------------------------------------------------------- HTTP

class Stats:
    def __init__(self):
        self.lock = threading.Lock()
        self.times = []
        self.fails = []

    def ok(self, t):
        with self.lock:
            self.times.append(t)

    def fail(self, msg):
        with self.lock:
            self.fails.append(msg)


class Connection:
    """Keep-Alive-Verbindung für alle Requests einer Session (TLS-Aufbau nur einmal,
    wie bei `curl --next` im Bash-Skript). urllib würde pro Request neu verbinden."""

    def __init__(self, url):
        u = urllib.parse.urlsplit(url)
        self.cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
        self.host, self.port, self.path = u.hostname, u.port, u.path or "/"
        self.conn = None

    def post(self, body, headers):
        if self.conn is None:
            self.conn = self.cls(self.host, self.port, timeout=30)
        try:
            self.conn.request("POST", self.path, body=body, headers=headers)
            resp = self.conn.getresponse()
            return resp.status, resp.read().decode("utf-8", "replace")
        except Exception:
            self.close()  # Verbindung ggf. vom Server geschlossen -> beim nächsten Versuch neu
            raise

    def close(self):
        if self.conn is not None:
            self.conn.close()
            self.conn = None


def post(conn, headers, payload, label, stats, stop):
    """POST mit bis zu 3 Versuchen bei 429/5xx/Netzwerkfehlern.

    Bei 401 (Token abgelaufen/ungültig) gibt es nur einen zweiten Versuch; schlägt auch der
    fehl, wird der ganze Lauf abgebrochen, statt jeden Request einzeln mit Pause zu wiederholen.
    """
    body = json.dumps(payload).encode("utf-8")
    status, text = 0, ""
    for attempt in range(1, 4):
        start = time.monotonic()
        try:
            status, text = conn.post(body, headers)
        except Exception as e:  # Netzwerkfehler
            status, text = 0, str(e)
        elapsed = time.monotonic() - start
        if status in (200, 201):
            stats.ok(elapsed)
            return
        if status == 401:
            if attempt == 2:
                if not stop.is_set():
                    stop.set()
                    print(f"\n!!! HTTP 401 Unauthorized – GENESYS_TOKEN abgelaufen oder ungültig. "
                          f"Lauf wird abgebrochen.\n    {text}", file=sys.stderr)
                break
            time.sleep(1)
        elif status == 0 and attempt == 1:
            continue  # veraltete Keep-Alive-Verbindung: sofort mit neuer Verbindung wiederholen
        elif status in (0, 429) or status >= 500:
            time.sleep(attempt * 2)
        else:
            break
    stats.fail(f"{label} -> HTTP {status} {text}")


# ---------------------------------------------------------------- Session

def build_requests(survey, conv, answer, args):
    path = []
    walk(survey["questions"], answer, path)

    if random.random() * 100 < args.abort_pct and len(path) > 1:
        path = path[: random.randint(1, len(path) - 1)]
        aborted = True
    else:
        aborted = False

    base = {
        "conversationId": conv,
        "surveyId": survey["id"],
        "surveyName": survey["name"],
        "surveyVersion": survey["version"],
    }
    reqs = []
    last = len(path) - 1
    skip_last = (
        not aborted
        and path[last][0]["type"] == "comment"
        and random.random() * 100 < args.skip_comment_pct
    )
    for i, (q, value) in enumerate(path):
        if i == last and skip_last:
            reqs.append((f"{conv} (complete)", {**base, "isCompleted": True}))
            break
        reqs.append((f"{conv} {q['name']}", {
            **base,
            "questionName": q["name"],
            "questionType": q["type"],
            "value": value["label"] if isinstance(value, dict) else value,
            "isCompleted": i == last and not aborted,
        }))
    return reqs


def run_session(n, survey, answer, args, url, headers, run_id, stats, stop):
    if stop.is_set():
        return False
    conn = Connection(url)
    try:
        for label, payload in build_requests(survey, f"{run_id}-{n}", answer, args):
            if stop.is_set():
                break
            post(conn, headers, payload, label, stats, stop)
    finally:
        conn.close()
    return True


# ---------------------------------------------------------------- Umfrage aus Data Table

def genesys_get(region, token, path, params=None):
    url = f"https://api.{region}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        if e.code == 404:
            return None
        sys.exit(f"Error: Genesys {path} -> HTTP {e.code} {detail}")
    except urllib.error.URLError as e:
        sys.exit(f"Error: Genesys {path} nicht erreichbar: {e.reason}")


def load_survey_from_datatable(region, token, table_name, survey_id):
    """Lädt das Draft-Feld der Zeile survey_<uuid> aus der Genesys Data Table."""
    res = genesys_get(region, token, "/api/v2/flows/datatables", {"name": table_name, "pageSize": 100})
    table = next((t for t in (res or {}).get("entities", []) if t.get("name") == table_name), None)
    if not table:
        sys.exit(f"Error: Data Table '{table_name}' nicht gefunden")
    key = f"survey_{survey_id}"
    row = genesys_get(region, token, f"/api/v2/flows/datatables/{table['id']}/rows/{urllib.parse.quote(key)}",
                      {"showbrief": "false"})
    if row is None:
        sys.exit(f"Error: Zeile '{key}' in Data Table '{table_name}' nicht gefunden")
    raw = row.get("Draft") or row.get("draft")  # Groß-/Kleinschreibung der Spalte variiert
    if not raw:
        sys.exit(f"Error: Zeile '{key}' hat kein Draft-Feld")
    return json.loads(raw) if isinstance(raw, str) else raw


# ---------------------------------------------------------------- Main

def count_questions(questions):
    return sum(1 + count_questions([f["question"] for f in q.get("follow_ups") or []]) for q in questions)


def main():
    ap = argparse.ArgumentParser(description="Zufällige Umfrage-Sessions an die survey_responses-API senden")
    ap.add_argument("survey", nargs="?", help="JSON-Datei mit der Umfrage-Definition")
    ap.add_argument("--surveyid", help="Umfrage-UUID: Draft aus der Genesys Data Table laden statt JSON-Datei")
    ap.add_argument("--table", default=os.environ.get("DATA_TABLE_NAME", DEFAULT_TABLE_NAME),
                    help="Name der Data Table (nur mit --surveyid)")
    ap.add_argument("-n", "--sessions", type=int, default=env_int("SESSIONS", 200))
    ap.add_argument("-p", "--parallel", type=int, default=env_int("PARALLEL", 10))
    ap.add_argument("--abort-pct", type=float, default=env_int("ABORT_PCT", 15))
    ap.add_argument("--skip-comment-pct", type=float, default=env_int("SKIP_COMMENT_PCT", 10))
    ap.add_argument("--answers", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "answers.txt"))
    args = ap.parse_args()

    token = os.environ.get("GENESYS_TOKEN", "")
    if not token:
        sys.exit("Error: No Genesys token provided.\nPlease set the GENESYS_TOKEN environment variable.\n"
                 "Example: export GENESYS_TOKEN=<GENESYS_BEARER_TOKEN>")

    region = os.environ.get("GENESYS_REGION", "mypurecloud.de")
    if args.surveyid:
        source = f"Data Table '{args.table}', survey_{args.surveyid}"
        survey = load_survey_from_datatable(region, token, args.table, args.surveyid)
    elif args.survey:
        source = args.survey
        with open(args.survey, encoding="utf-8") as f:
            survey = json.load(f)
    else:
        ap.error("JSON-Datei oder --surveyid angeben")
    for key in ("id", "name", "version", "questions"):
        if key not in survey:
            sys.exit(f"Error: Feld '{key}' fehlt in {source}")

    with open(args.answers, encoding="utf-8") as f:
        comments = [line.strip() for line in f if line.strip()]
    if not comments:
        sys.exit(f"Error: {args.answers} enthält keine Antworten")

    api_url = os.environ.get("API_URL", DEFAULT_API_URL)
    url = f"{api_url}/survey-responses"
    headers = {
        "Authorization": f"Bearer {token}",
        "x-genesys-region": region,
        "Content-Type": "application/json",
    }
    run_id = f"bulk-{int(time.time())}"
    answer = make_answer_fn(comments)
    stats = Stats()
    stop = threading.Event()

    # Ctrl-C: keine neuen Sessions mehr starten, laufende zu Ende bringen.
    # Ein zweites Ctrl-C bricht sofort ab.
    def on_interrupt(_sig, _frame):
        if stop.is_set():
            os._exit(130)
        stop.set()
        print("\n!!! Abbruch angefordert – warte auf laufende Sessions (nochmal Ctrl-C bricht sofort ab) ...")

    signal.signal(signal.SIGINT, on_interrupt)
    signal.signal(signal.SIGTERM, on_interrupt)

    print(f"==== API: {api_url} ====")
    print(f"==== Region: {region} ====")
    print(f"==== Umfrage: {survey['name']} v{survey['version']} ({count_questions(survey['questions'])} Fragen) | "
          f"{len(comments)} Kommentar-Antworten ====")
    print(f"==== Run: {run_id} | Sessions: {args.sessions} | parallel: {args.parallel} | "
          f"Abbruch: {args.abort_pct:g}% ====\n")

    started = 0
    with ThreadPoolExecutor(max_workers=args.parallel) as pool:
        futures = []
        for i in range(1, args.sessions + 1):
            futures.append(pool.submit(run_session, i, survey, answer, args, url, headers, run_id, stats, stop))
        for i, fut in enumerate(futures, 1):
            if fut.result():
                started += 1
            if i % 25 == 0:
                with stats.lock:
                    n = len(stats.times)
                    avg = f"{sum(stats.times) / n:.3f} (n={n})" if n else "-"
                print(f"  fertig: {i}/{args.sessions} | Ø Antwortzeit: {avg}")

    n = len(stats.times)
    avg = f"{sum(stats.times) / n:.3f} s" if n else "-"
    state = "Abgebrochen" if stop.is_set() else "Fertig"
    print(f"\n==== {state}: {started}/{args.sessions} Sessions, {n} Requests erfolgreich, "
          f"{len(stats.fails)} fehlgeschlagen, Ø Antwortzeit {avg} ====")
    if stats.fails:
        print("Erste Fehler:")
        print("\n".join(stats.fails[:10]))
    print("Abgebrochene Sessions bleiben 'partial' bzw. werden von der Cleanup-Lambda auf 'timed_out' gesetzt.")


if __name__ == "__main__":
    main()
