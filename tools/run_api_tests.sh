#!/usr/bin/env bash
# Wrapper für tools/api_tests.py: lädt die Variablen aus tools/run_api_tests.env und startet den E2E-Test.
# Weitere Optionen werden durchgereicht, z. B. ./tools/run_api_tests.sh -v --web-theme-write
#
# Einrichtung: cp tools/run_api_tests.env.sample tools/run_api_tests.env und Werte eintragen.
# Die .env-Datei steht in .gitignore, damit keine Tokens ins Repo gelangen.

dir="$(dirname "$0")"
env_file="$dir/run_api_tests.env"

if [ ! -f "$env_file" ]; then
	echo "Fehler: $env_file fehlt. Vorlage kopieren: cp $env_file.sample $env_file" >&2
	exit 1
fi

# shellcheck source=/dev/null
. "$env_file"

for name in GENESYS_TOKEN SURVEY_ID API_URL; do
	if [ -z "${!name}" ]; then
		echo "Fehler: $name ist nicht gesetzt (in $env_file eintragen)." >&2
		exit 1
	fi
done

exec python3 "$dir/api_tests.py" "$@"
