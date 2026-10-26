#!/usr/bin/env bash
# Wrapper für tools/api_tests.py: setzt Token, Umfrage-ID und API-URL und startet den E2E-Test.
# Weitere Optionen werden durchgereicht, z. B. ./tools/run_api_tests.sh -v --web-theme-write
#
# Werte unten lokal eintragen. Die Datei wurde leer eingecheckt und ist lokal gegen Änderungen
# geschützt (siehe CLAUDE.md bzw. Hinweis im Commit), damit keine Tokens ins Repo gelangen.

export GENESYS_TOKEN=""   # Bearer aus dem Genesys-Portal (Dev-Tools)
export SURVEY_ID=""       # Umfrage-UUID, muss in der Data Table dieser Installation existieren
export API_URL=""         # Basis-URL inkl. Präfix, z. B. https://<app>.amplifyapp.com/api

for name in GENESYS_TOKEN SURVEY_ID API_URL; do
	if [ -z "${!name}" ]; then
		echo "Fehler: $name ist nicht gesetzt (in $0 eintragen)." >&2
		exit 1
	fi
done

exec python3 "$(dirname "$0")/api_tests.py" "$@"
