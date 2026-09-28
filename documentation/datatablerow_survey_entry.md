# Survey-Zeile
Jede Umfrage wird in einer Zeile der Data Table gespeichert.
Die Zeile hat mehrere Felder: Prod/Draft/Backup/Stage.

* Prod: Das flow-optimierte, verkettete JSON (siehe @survey_translator_for_flow.md), das aktiv vom Call Flow genutzt wird.
* Draft: Das baumförmige Editor-Format (siehe @survey_definition.md), das man im Editor sieht und bearbeitet.
* Backup: 1:1-Sicherheitskopie des vorherigen Prod-Inhalts (ebenfalls flow-optimiertes JSON); wird bei jedem Prod-Deploy mit dem bisherigen Prod-Inhalt überschrieben, bevor der neue Draft nach Prod übersetzt wird. Über einen Rollback kann dieser Backup-Inhalt wieder nach Prod zurückgespielt werden.
* Stage: Ebenfalls flow-optimiertes JSON (Übersetzung des aktuellen Drafts); wird vom Flow benutzt, wenn mit der Test-Rufnummer angerufen wird.

## Spezielle Felder
* key: Eindeutiger Identifikator der Zeile. Setzt sich aus dem Prefix "survey_" und der Umfrage-UUID zusammen (z. B. "survey_e3b0c442-989b-464c-811c-2834b6b10011").
* lock: Informationen, wer die Umfrage gerade bearbeitet - soll verhindern, dass eine im Editor geöffnete Umfrage parallel von einem zweiten User bearbeitet wird. Das Lock wird nicht schon beim reinen Öffnen/Ansehen gesetzt, sondern erst bei der ersten Änderung im Editor: Dann wird der aktuelle Zeitpunkt in das Feld "locked_since" und der Username in das Feld "locked_by" geschrieben. Beim Speichern der Umfrage sowie beim Verlassen des Editors (auch ohne zu speichern) wird das Lock wieder freigegeben (locked_by/locked_since werden geleert). Ist das Lock älter als 60 Minuten, gilt es als abgelaufen und wird bei der nächsten Prüfung ignoriert (es wird dabei nicht aktiv gelöscht, sondern erst beim nächsten Setzen oder Speichern überschrieben).

Beim Öffnen einer Umfrage wird ein Konflikt-Check durchgeführt: Falls die Umfrage bereits (nicht abgelaufen) gesperrt ist, wird ein Dialog angezeigt mit der Info, dass die Umfrage seit dem Datum in locked_since von locked_by bearbeitet wird. Der User kann sich nun entscheiden, ob er trotzdem bearbeiten (Lock ignorieren) oder abbrechen möchte (→ zurück zur Umfragen-Übersichtsliste).

## Leeres Beispiel JSON

{
    "Prod": "{}",
    "Draft": "{}",
    "Backup": "{}",
    "Stage": "{}",
    "lock": "{\"locked_by\": \"\", \"locked_since\": \"\"}",
    "key": "survey_e3b0c442-989b-464c-811c-2834b6b10011"
}
