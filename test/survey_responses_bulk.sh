#!/usr/bin/env bash
# survey_responses API – Massendaten-Generator
# =============================================================
# Erzeugt zufällige Umfrage-Sessions für die Umfrage "mini_1718e427"
# (Version 21) und schickt sie schrittweise an die deployte API, genau
# wie der Architect Flow es tun würde.
#
# Der Fragenbaum der Umfrage:
#   yes_no -> rating (1-5) -> [Folgefrage je nach Wert]
#          -> choice (Frucht) -> [Folgefrage je Option]
#          -> nps (0-10) -> comment (letzte Frage, schließt die Session)
#
# Verwendung:
#   export GENESYS_TOKEN=<Bearer aus dem Genesys-Portal>
#   ./test/survey_responses_bulk.sh [ANZAHL_SESSIONS]
#
# Optionale Umgebungsvariablen:
#   API_URL, GENESYS_REGION  wie in survey_responses.sh
#   SESSIONS                 Anzahl Sessions (Default 200, oder 1. Argument)
#   PARALLEL                 gleichzeitige Sessions (Default 5)
#   ABORT_PCT                Anteil abgebrochener Sessions in % (Default 15)
#   SKIP_COMMENT_PCT         Anteil Sessions ohne Schlusskommentar in % (Default 10)
#
# ACHTUNG: Schreibt echte Daten in die deployte API.
# =============================================================

API_URL="${API_URL:-https://main.d1a6p4nkkob4i7.amplifyapp.com/api}"
GENESYS_TOKEN="${GENESYS_TOKEN:-}"
GENESYS_REGION="${GENESYS_REGION:-mypurecloud.de}"

SESSIONS="${1:-${SESSIONS:-200}}"
PARALLEL="${PARALLEL:-10}"
ABORT_PCT="${ABORT_PCT:-15}"
SKIP_COMMENT_PCT="${SKIP_COMMENT_PCT:-10}"

if [ -z "$GENESYS_TOKEN" ]; then
  echo "Error: No Genesys token provided."
  echo "Please set the GENESYS_TOKEN environment variable."
  echo "Example: export GENESYS_TOKEN=<GENESYS_BEARER_TOKEN>"
  exit 1
fi

SURVEY_ID="1718e427-0661-4716-95f5-4b1e4bc0233a"
SURVEY_NAME="mini_1718e427"
SURVEY_VERSION=21

# Options-IDs der Frage "Auswahl Frucht"
OPT_ORANGE="c7ad1192-bf4c-489c-9fdf-297e76d1c453"
OPT_PASSION="b7ea9d06-bdea-4c1b-9ee1-66ce5d6e5ac1"
OPT_CURRANT="35de19af-cef6-464d-b349-93d444b032fb"

RUN_ID="bulk-$(date +%s)"
FAIL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/survey_bulk.XXXXXX")" || { echo "Error: mktemp fehlgeschlagen"; exit 1; }
trap 'rm -rf "$FAIL_DIR"' EXIT

COMMENTS_FINAL=(
  "Wartezeit war etwas lang, aber der Support sehr freundlich."
  "Alles bestens, danke!"
  "Mein Problem wurde leider nicht gelöst."
  "Der Berater war kompetent und schnell."
  "Bitte mehr Personal in der Hotline."
  "Ich musste mehrfach anrufen."
  "Sehr gute Beratung."
  "Die Warteschleifenmusik ist furchtbar."
  "Kurz und schmerzlos."
  "Keine Anmerkungen."
)
COMMENTS_LOW=(
  "Wartezeit war zu lang."
  "Das Problem wurde nicht gelöst."
  "Der Berater war unfreundlich."
  "Ich wurde dreimal weiterverbunden."
)
COMMENTS_MID=(
  "Ganz okay, nichts Besonderes."
  "Es ging, aber es war etwas umständlich."
  "Durchschnittlich."
)
COMMENTS_HIGH=(
  "Sehr freundlich und kompetent."
  "Schnelle Lösung, danke!"
  "Alles hat reibungslos geklappt."
  "Top Service."
)
COMMENTS_FRUIT=(
  "Sehr lecker."
  "Schmeckt mir nicht so."
  "Mag ich am liebsten."
  "Geht so."
)

# Zufallszahl 0..n-1
rnd() { echo $((RANDOM % $1)); }

# Zufälliges Element aus einem Array (Name des Arrays als Argument)
pick() {
  local name="$1"
  local len
  eval "len=\${#${name}[@]}"
  local i
  i=$(rnd "$len")
  eval "echo \"\${${name}[$i]}\""
}

# Gewichtete Zahl für Rating (1-5), leicht positiv verteilt
rand_rating() {
  local r=$((RANDOM % 100))
  if   [ $r -lt 8 ];  then echo 1
  elif [ $r -lt 20 ]; then echo 2
  elif [ $r -lt 38 ]; then echo 3
  elif [ $r -lt 70 ]; then echo 4
  else echo 5
  fi
}

# NPS (0-10): Promoter überwiegen, wenige Detraktoren
rand_nps() {
  local r=$((RANDOM % 100))
  if   [ $r -lt 20 ]; then echo $((RANDOM % 7))        # 0-6 Detraktoren
  elif [ $r -lt 40 ]; then echo $((7 + RANDOM % 2))    # 7-8 Passive
  else echo $((9 + RANDOM % 2))                        # 9-10 Promoter
  fi
}

# Payload senden, bei 401/429/5xx bis zu 3x mit Pause wiederholen.
# Fehler (inkl. Response-Body) landen in FAIL_DIR.
post_payload() {
  local label="$1" payload="$2" out http body attempt
  for attempt in 1 2 3; do
    out=$(curl -s -w $'\n%{http_code} %{time_total}' -X POST "${API_URL}/survey-responses" \
      -H "Authorization: Bearer ${GENESYS_TOKEN}" \
      -H "x-genesys-region: ${GENESYS_REGION}" \
      -H "Content-Type: application/json" \
      -d "$payload")
    http="${out##*$'\n'}"
    body="${out%$'\n'*}"
    echo "${http#* }" >> "${FAIL_DIR}/times.$$"
    http="${http%% *}"
    if [ "$http" = "200" ] || [ "$http" = "201" ]; then return 0; fi
    case "$http" in 401|429|5*) sleep $((attempt * 2)) ;; *) break ;; esac
  done
  echo "$label -> HTTP $http $body" >> "${FAIL_DIR}/fail.$$"
}

# Eine Antwort für die aktuelle Session vormerken (wird in flush_session gesendet).
# Parameter: conversationId questionName questionType value(JSON) isCompleted
# Die Texte stammen aus festen Pools ohne Anführungszeichen/Backslashes, daher
# reicht printf statt jq (spart pro Request einen Prozessstart).
send() {
  local conv="$1" qname="$2" qtype="$3" value="$4" completed="$5"
  PENDING_LABELS+=("$conv $qname")
  PENDING_PAYLOADS+=("$(printf '{"conversationId":"%s","surveyId":"%s","surveyName":"%s","surveyVersion":%s,"questionName":"%s","questionType":"%s","value":%s,"isCompleted":%s}' \
    "$conv" "$SURVEY_ID" "$SURVEY_NAME" "$SURVEY_VERSION" "$qname" "$qtype" "$value" "$completed")")
}

# Nur die Session abschließen (kein Schlusskommentar)
send_complete_only() {
  local conv="$1"
  PENDING_LABELS+=("$conv (complete)")
  PENDING_PAYLOADS+=("$(printf '{"conversationId":"%s","surveyId":"%s","surveyName":"%s","surveyVersion":%s,"isCompleted":true}' \
    "$conv" "$SURVEY_ID" "$SURVEY_NAME" "$SURVEY_VERSION")")
}

# Alle vorgemerkten Requests einer Session mit EINEM curl-Prozess senden
# (curl --next): die Verbindung wird wiederverwendet, TLS-Aufbau nur einmal.
# Requests, die nicht mit 200/201 antworten, werden einzeln mit Retry wiederholt.
flush_session() {
  local count=${#PENDING_PAYLOADS[@]} i results line http t
  [ "$count" -eq 0 ] && return 0

  local args=()
  for ((i = 0; i < count; i++)); do
    [ "$i" -gt 0 ] && args+=(--next)
    args+=(-s -o /dev/null -w '%{http_code} %{time_total}\n' -X POST "${API_URL}/survey-responses"
      -H "Authorization: Bearer ${GENESYS_TOKEN}"
      -H "x-genesys-region: ${GENESYS_REGION}"
      -H "Content-Type: application/json"
      -d "${PENDING_PAYLOADS[$i]}")
  done
  results=$(curl "${args[@]}")

  for ((i = 0; i < count; i++)); do
    line=$(printf '%s\n' "$results" | sed -n "$((i + 1))p")
    http="${line%% *}"
    t="${line#* }"
    if [ "$http" = "200" ] || [ "$http" = "201" ]; then
      echo "$t" >> "${FAIL_DIR}/times.$$"
    else
      post_payload "${PENDING_LABELS[$i]}" "${PENDING_PAYLOADS[$i]}"
    fi
  done
}

# Eine komplette (oder abgebrochene) Session durchspielen
build_session() {
  local n="$1"
  local conv="${RUN_ID}-${n}"
  local steps=7                      # max. Anzahl Fragen auf dem Pfad
  local stop_after=$steps            # nach wie vielen Fragen abbrechen
  local aborted=0

  if [ $((RANDOM % 100)) -lt "$ABORT_PCT" ]; then
    aborted=1
    stop_after=$((1 + RANDOM % (steps - 1)))
  fi

  local done_steps=0
  # Gibt 0 zurück, solange weitergemacht werden soll
  next_step() {
    done_steps=$((done_steps + 1))
    [ $done_steps -le $stop_after ]
  }

  # 1. yes_no
  next_step || return 0
  if [ $((RANDOM % 100)) -lt 60 ]; then send "$conv" ja_oder_nein_46d4db2f yes_no true false
  else send "$conv" ja_oder_nein_46d4db2f yes_no false false; fi

  # 2. rating + Folgefrage
  next_step || return 0
  local rating
  rating=$(rand_rating)
  send "$conv" bewertung_3557a5bf rating "$rating" false
  next_step || return 0
  local txt fu
  if   [ "$rating" -lt 3 ]; then fu=warum_weniger_als_3_d64ccdb1; txt=$(pick COMMENTS_LOW)
  elif [ "$rating" -eq 3 ]; then fu=warum_3_0c414408;             txt=$(pick COMMENTS_MID)
  else                           fu=warum_mehr_als_3_d80a2522;    txt=$(pick COMMENTS_HIGH)
  fi
  send "$conv" "$fu" comment "\"$txt\"" false

  # 3. choice + Folgefrage
  next_step || return 0
  local opt fq
  case $((RANDOM % 3)) in
    0) opt=$OPT_ORANGE;  fq=lecker_8931c696 ;;
    1) opt=$OPT_PASSION; fq=xx_4d104e1f ;;
    *) opt=$OPT_CURRANT; fq=cdfdfgfdg_85a9c5c4 ;;
  esac
  send "$conv" auswahl_frucht_58bd0bde choice "\"${opt}\"" false
  next_step || return 0
  send "$conv" "$fq" comment "\"$(pick COMMENTS_FRUIT)\"" false

  # 4. nps
  next_step || return 0
  send "$conv" nps_ce9b05b7 nps "$(rand_nps)" false

  # 5. Schlusskommentar + Abschluss
  next_step || return 0
  if [ $((RANDOM % 100)) -lt "$SKIP_COMMENT_PCT" ]; then
    send_complete_only "$conv"
  else
    send "$conv" kommentar_e80f5583 comment "\"$(pick COMMENTS_FINAL)\"" true
  fi
}

# Eine komplette (oder abgebrochene) Session aufbauen und senden
run_session() {
  PENDING_LABELS=()
  PENDING_PAYLOADS=()
  build_session "$1"
  flush_session
}

echo "==== API: ${API_URL} ===="
echo "==== Region: ${GENESYS_REGION} ===="
echo "==== Run: ${RUN_ID} | Sessions: ${SESSIONS} | parallel: ${PARALLEL} | Abbruch: ${ABORT_PCT}% ===="
echo ""

# Ctrl-C: keine neuen Sessions mehr starten, laufende zu Ende bringen, dann
# die Zusammenfassung ausgeben. Ein zweites Ctrl-C bricht laufende Sessions ab.
INTERRUPTED=0
on_interrupt() {
  if [ "$INTERRUPTED" -eq 0 ]; then
    INTERRUPTED=1
    echo ""
    echo "!!! Abbruch angefordert – warte auf laufende Sessions (nochmal Ctrl-C bricht sofort ab) ..."
  else
    kill $(jobs -rp) 2>/dev/null
  fi
}
trap on_interrupt INT TERM

STARTED=0
for ((i = 1; i <= SESSIONS; i++)); do
  # Parallelität begrenzen (bash 3.2 kompatibel, kein wait -n)
  while [ "$INTERRUPTED" -eq 0 ] && [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$PARALLEL" ]; do
    sleep 0.1
  done
  [ "$INTERRUPTED" -ne 0 ] && break
  run_session "$i" &
  STARTED=$i
  if [ $((i % 25)) -eq 0 ]; then
    # Durchschnittliche Antwortzeit (s) der Requests seit der letzten Ausgabe
    avg=$(cat "${FAIL_DIR}"/times.* 2>/dev/null | awk -v from="${LAST_TIMES:-0}" 'NR>from {s+=$1; n++} END {if (n) printf "%.3f (n=%d)", s/n, n; else print "-"}')
    LAST_TIMES=$(cat "${FAIL_DIR}"/times.* 2>/dev/null | wc -l | tr -d ' ')
    echo "  gestartet: ${i}/${SESSIONS} | Ø Antwortzeit: ${avg}"
  fi
done
# wait wird durch ein Signal vorzeitig beendet, daher wiederholen bis alle Jobs fertig sind
while [ -n "$(jobs -rp)" ]; do wait 2>/dev/null; done

FAILS=$(cat "${FAIL_DIR}"/fail.* 2>/dev/null | wc -l | tr -d ' ')
echo ""
REQUESTS=$(cat "${FAIL_DIR}"/times.* 2>/dev/null | wc -l | tr -d ' ')
AVG_ALL=$(cat "${FAIL_DIR}"/times.* 2>/dev/null | awk '{s+=$1; n++} END {if (n) printf "%.3f s", s/n; else print "-"}')
if [ "$INTERRUPTED" -ne 0 ]; then STATE="Abgebrochen"; else STATE="Fertig"; fi
echo "==== ${STATE}: ${STARTED}/${SESSIONS} Sessions gestartet, ${REQUESTS} Requests erfolgreich, ${FAILS} fehlgeschlagen, Ø Antwortzeit ${AVG_ALL} ===="
if [ "$FAILS" -gt 0 ]; then
  echo "Erste Fehler:"
  cat "${FAIL_DIR}"/fail.* | head -10
fi
echo "Abgebrochene Sessions bleiben 'partial' bzw. werden von der Cleanup-Lambda auf 'timed_out' gesetzt."
