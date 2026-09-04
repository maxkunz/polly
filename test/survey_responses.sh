#!/usr/bin/env bash
# survey_responses API – curl Test Suite
# =============================================================
# Konfiguration: Genesys-Token und API URL
# =============================================================

API_URL="${API_URL:-https://main.d1a6p4nkkob4i7.amplifyapp.com/api}"
GENESYS_TOKEN="${GENESYS_TOKEN:-}"
GENESYS_REGION="${GENESYS_REGION:-mypurecloud.de}"

# Abbrechen wenn kein Token übergeben wird
if [ -z "$GENESYS_TOKEN" ]; then
  echo "Error: No Genesys token provided."
  echo "Please set the GENESYS_TOKEN environment variable."
  echo "Example: export GENESYS_TOKEN=<GENESYS_BEARER_TOKEN>"
  echo "You can check your token using dev tools when logged into the Genesys Cloud Portal"
  exit 1
fi

# IDs für den Test
CONVERSATION_ID="test-conv-$(date +%s)"
SURVEY_ID="1718e427-0661-4716-95f5-4b1e4bc0233a"
SURVEY_NAME="mini_1718e427"
SURVEY_VERSION=5

BASE_HEADERS=(
  -H "Authorization: Bearer ${GENESYS_TOKEN}"
  -H "x-genesys-region: ${GENESYS_REGION}"
  -H "Content-Type: application/json"
)

echo "==== API: ${API_URL} ===="
echo "==== ConversationId: ${CONVERSATION_ID} ===="
echo "==== Region: ${GENESYS_REGION} ===="
echo ""

# -------------------------------------------------------------------
# 1. Erste Antwort senden: yes_no Frage
# -------------------------------------------------------------------
echo ">>> [1] POST /survey-responses – yes_no Antwort"
curl -s -X POST "${API_URL}/survey-responses" \
  "${BASE_HEADERS[@]}" \
  -d "{
    \"conversationId\": \"${CONVERSATION_ID}\",
    \"surveyId\": \"${SURVEY_ID}\",
    \"surveyName\": \"${SURVEY_NAME}\",
    \"surveyVersion\": ${SURVEY_VERSION},
    \"questionName\": \"ja_oder_nein_46d4db2f\",
    \"questionType\": \"yes_no\",
    \"value\": false,
    \"isCompleted\": false
  }" | jq .
echo ""

# -------------------------------------------------------------------
# 2. NPS Antwort (0–10 Skala)
# -------------------------------------------------------------------
echo ">>> [2] POST /survey-responses – nps Antwort"
curl -s -X POST "${API_URL}/survey-responses" \
  "${BASE_HEADERS[@]}" \
  -d "{
    \"conversationId\": \"${CONVERSATION_ID}\",
    \"surveyId\": \"${SURVEY_ID}\",
    \"surveyName\": \"${SURVEY_NAME}\",
    \"surveyVersion\": ${SURVEY_VERSION},
    \"questionName\": \"nps_ce9b05b7\",
    \"questionType\": \"nps\",
    \"value\": 9,
    \"isCompleted\": false
  }" | jq .
echo ""

# -------------------------------------------------------------------
# 3. Rating Antwort (konfigurierbare Skala, hier 1–8)
# -------------------------------------------------------------------
echo ">>> [3] POST /survey-responses – rating Antwort"
curl -s -X POST "${API_URL}/survey-responses" \
  "${BASE_HEADERS[@]}" \
  -d "{
    \"conversationId\": \"${CONVERSATION_ID}\",
    \"surveyId\": \"${SURVEY_ID}\",
    \"surveyName\": \"${SURVEY_NAME}\",
    \"surveyVersion\": ${SURVEY_VERSION},
    \"questionName\": \"bewertung_3557a5bf\",
    \"questionType\": \"rating\",
    \"value\": 5,
    \"isCompleted\": false
  }" | jq .
echo ""

# -------------------------------------------------------------------
# 4. Choice Antwort (optionId als value)
# -------------------------------------------------------------------
echo ">>> [4] POST /survey-responses – choice Antwort"
curl -s -X POST "${API_URL}/survey-responses" \
  "${BASE_HEADERS[@]}" \
  -d "{
    \"conversationId\": \"${CONVERSATION_ID}\",
    \"surveyId\": \"${SURVEY_ID}\",
    \"surveyName\": \"${SURVEY_NAME}\",
    \"surveyVersion\": ${SURVEY_VERSION},
    \"questionName\": \"auswahl_frucht_58bd0bde\",
    \"questionType\": \"choice\",
    \"value\": \"Äpfel\",
    \"isCompleted\": false
  }" | jq .
echo ""

# -------------------------------------------------------------------
# 5. Comment Antwort (transkribierter Freitext aus Flow) 
# 6. Session abschliesse
# -------------------------------------------------------------------
echo ">>> [5] POST /survey-responses – comment Antwort (Freitext)"
curl -s -X POST "${API_URL}/survey-responses" \
  "${BASE_HEADERS[@]}" \
  -d "{
    \"conversationId\": \"${CONVERSATION_ID}\",
    \"surveyId\": \"${SURVEY_ID}\",
    \"surveyName\": \"${SURVEY_NAME}\",
    \"surveyVersion\": ${SURVEY_VERSION},
    \"questionName\": \"kommentar_e80f5583\",
    \"questionType\": \"comment\",
    \"value\": \"Wartezeit war etwas lang, aber der Support sehr freundlich.\",
    \"isCompleted\": true
  }" | jq .
echo ""

# -------------------------------------------------------------------
# 7. Session abrufen (Prüfen ob status: completed)
# -------------------------------------------------------------------
echo ">>> [7] GET /survey-responses/session?conversationId=..."
curl -s -X GET "${API_URL}/survey-responses/session?conversationId=${CONVERSATION_ID}" \
  "${BASE_HEADERS[@]}" | jq .
echo ""

# -------------------------------------------------------------------
# 8. Aggregate abrufen (Live-Stats für Report-UI)
# -------------------------------------------------------------------
echo ">>> [8] GET /survey-responses/aggregates?surveyId=..."
curl -s -X GET "${API_URL}/survey-responses/aggregates?surveyId=${SURVEY_ID}" \
  "${BASE_HEADERS[@]}" | jq .
echo ""

# -------------------------------------------------------------------
# 9. Raw Responses (paginiert, nur completed)
# -------------------------------------------------------------------
echo ">>> [9] GET /survey-responses/raw?status=completed&limit=10"
curl -s -X GET "${API_URL}/survey-responses/raw?surveyId=${SURVEY_ID}&status=completed&limit=10" \
  "${BASE_HEADERS[@]}" | jq .
echo ""

# -------------------------------------------------------------------
# 10. Raw Responses – abgebrochene Anrufe (partial)
# -------------------------------------------------------------------
echo ">>> [10] GET /survey-responses/raw?status=partial"
curl -s -X GET "${API_URL}/survey-responses/raw?surveyId=${SURVEY_ID}&status=partial" \
  "${BASE_HEADERS[@]}" | jq .
echo ""

# -------------------------------------------------------------------
# 11. Raw Responses – timed_out (nach Cleanup-Lambda)
# -------------------------------------------------------------------
echo ">>> [11] GET /survey-responses/raw?status=timed_out"
curl -s -X GET "${API_URL}/survey-responses/raw?surveyId=${SURVEY_ID}&status=timed_out" \
  "${BASE_HEADERS[@]}" | jq .
echo ""

# -------------------------------------------------------------------
# 12. Cursor-Paginierung (nextCursor aus vorherigem Response verwenden)
# -------------------------------------------------------------------
# NEXT_CURSOR=$(curl -s ... | jq -r '.nextCursor')
# curl -s -X GET "${API_URL}/survey-responses/raw?surveyId=${SURVEY_ID}&cursor=${NEXT_CURSOR}" ...
echo ">>> [12] Cursor-Paginierung (manuell: nextCursor aus [9] Response in &cursor= einfügen)"
echo ""

# -------------------------------------------------------------------
# 13. Fehlerfall: fehlende conversationId (400 erwartet)
# -------------------------------------------------------------------
echo ">>> [13] POST /survey-responses – fehlende conversationId (400 erwartet)"
curl -s -X POST "${API_URL}/survey-responses" \
  "${BASE_HEADERS[@]}" \
  -d "{
    \"surveyId\": \"${SURVEY_ID}\",
    \"questionName\": \"nps_ce9b05b7\",
    \"questionType\": \"nps\",
    \"value\": 5
  }" | jq .
echo ""

# -------------------------------------------------------------------
# 14. Fehlerfall: weder questionName noch isCompleted (400 erwartet)
# -------------------------------------------------------------------
echo ">>> [14] POST /survey-responses – kein questionName, kein isCompleted (400 erwartet)"
curl -s -X POST "${API_URL}/survey-responses" \
  "${BASE_HEADERS[@]}" \
  -d "{
    \"conversationId\": \"${CONVERSATION_ID}\",
    \"surveyId\": \"${SURVEY_ID}\"
  }" | jq .
echo ""

# -------------------------------------------------------------------
# 15. Fehlerfall: kein Auth-Token (401 erwartet)
# -------------------------------------------------------------------
echo ">>> [15] POST /survey-responses – kein Token (401 erwartet)"
curl -s -X POST "${API_URL}/survey-responses" \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"${CONVERSATION_ID}\",
    \"surveyId\": \"${SURVEY_ID}\",
    \"questionName\": \"nps_ce9b05b7\",
    \"questionType\": \"nps\",
    \"value\": 5
  }" | jq .
echo ""

# -------------------------------------------------------------------
# 16. Fehlerfall: kein Auth-Token (401 erwartet)
# -------------------------------------------------------------------
echo ">>> [15] POST /survey-responses – invalid Token (401 erwartet)"
curl -s -X POST "${API_URL}/survey-responses" \
  -H "Authorization: Bearer invalidTokenhahahahaxxor" \
  -H "x-genesys-region: ${GENESYS_REGION}" \
  -H "Content-Type: application/json" \
  -d "{
    \"conversationId\": \"${CONVERSATION_ID}\",
    \"surveyId\": \"${SURVEY_ID}\",
    \"questionName\": \"nps_ce9b05b7\",
    \"questionType\": \"nps\",
    \"value\": 5
  }" | jq .
echo ""

echo "==== Fertig ===="

