# Genesys Cloud Notizen

## Data Tables

- Max. 200 Tabellen pro Organisation möglich
- Max. 50 Spalten pro Tabelle
- Max. 5000 Zeilen pro Tabelle
- Tabellenname und Reference Key (Primärschlüssel) dürfen maximal 256 Zeichen lang sein
- Anwendungsfall: Speichern von Fragen und Daten dazu (z. B. max_value oder enabled)
- Dokumentation: https://help.genesys.cloud/articles/work-with-data-tables/

### Zelleninhalte - theoretisches vs. praktisches Limit

- Theoretisches Limit: Kein offiziell dokumentiertes Limit. Laut Community-Diskussion maximal 256 KB (262.144 Byte). Bei Single-Byte-Encoding also 262.144 Zeichen.
- Praktisches Limit (Problem): Architect Flows limitieren die String-Größe auf 32.000 Zeichen. Obwohl eine Zelle mehr speichern könnte, wird das System beim Versuch, mehr als 32.000 Zeichen im Flow zu lesen, vermutlich crashen oder Fehler werfen.
- Community-Diskussion: https://community.genesys.com/discussion/data-table-character-limit-on-cells

## Data Actions

- Teste Daten Updates (z. B. Counter der Bewertungen hochzählen)
- Ablauf: Data Action -> Setup -> Test

## Integrations

- Apps konfigurieren
