# survey zeile
jede umfrage wird in einer zeile der data table gespeichert.
die zeile hat mehrere felder: Prod/Draft/Backup/Stage

* Prod: das was aktiv von dem call flow genutzt wird
* Draft: das was man im editor sieht und bearbeiten kann
* Backup: Sicherheitskopie der letzten Prod Version, wird überschrieben bei jedem Prod Deploy
* Stage: wird vom Flow benutzt wenn mit der Test Rufnummer angerufen wird

## Spezielle Felder
* key: Eindeutiger Identifikator der Zeile. Setzt sich aus dem Prefix "survey_" und der Umfrage UUID zusammen (z.B. "survey_e3b0c442-989b-464c-811c-2834b6b10011")
* lock: Informationen wer die Umfrage gerade bearbeitet - soll verhindern dass eine im Editor geöffnete Umfrage parallel von einem zweiten User bearbeite wird. sobald eine umfrage im editor bearbeitet wird wird ein timestamp in das Feld geschrieben und in das Feld 'locked_by' geschrieben. der user, der die umfrage gerade bearbeitet wird in dem Feld 'locked_by' geschrieben, bei speichern wird das lock wieder freigegeben. ist das lock älter als X Minuten alt wird es ignoriert bzw, gelöscht

## leeres beispiel json

{
    "Prod": "{}",
    "Draft": "{}",
    "Backup": "{}",
    "Stage": "{}",
    "lock": "{\"locked_by\": \"\", \"locked_since\": \"\"}",
    "key": "survey_e3b0c442-989b-464c-811c-2834b6b10011"
}
