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
- Praktisches Limit: String-Variablen in Architect sind offiziell auf 32.000 Zeichen begrenzt. Obwohl eine Zelle mehr speichern könnte, kann der Flow längere Inhalte nicht verarbeiten. Polly prüft daher das übersetzte Flow-JSON beim Deploy gegen dieses Limit (Editor warnt ab 75 %).
- Community-Diskussion: https://community.genesys.com/discussion/data-table-character-limit-on-cells
- Genesys-FAQ (32.000 Zeichen): https://help.genesys.cloud/faqs/character-limit-string-variables-architect-flows/

## Text-to-Speech (TTS)

- Max. 3.000 Zeichen pro TTS-Anfrage, gilt laut Genesys für alle TTS-Engines und -Integrationen (auch Amazon Polly).
- Im Bot Flow betrifft das jeden `MakeCommunication(ToCommunication(...))`-Aufruf mit Umfragetext: Begrüßung, Fragetitel (prompt) und Reprompt. Ein längerer Text lässt den Flow erst beim Vorlesen abstürzen (getestet: Reprompt mit 20.000 Zeichen – Flow startet, stürzt beim Reprompt ab).
- Polly validiert diese Felder (plus Verabschiedung) daher hart auf 3.000 Zeichen.
- SSML wird in Call-, Secure-Call- und In-Queue-Flows nicht unterstützt, nur in Bot Flows mit Drittanbieter-TTS (z. B. Amazon Polly).
- Dokumentation: https://help.genesys.cloud/articles/about-text-to-speech-tts-engines/

## Data Actions

- Teste Daten Updates (z. B. Counter der Bewertungen hochzählen)
- Ablauf: Data Action -> Setup -> Test

## Integrations

- Apps konfigurieren
