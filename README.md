# FokusDeck

FokusDeck ist eine derzeit für Windows veröffentlichte, lokale Desktop-App für konzentriertes Lernen. Sie kombiniert einen frei konfigurierbaren Lern- und Pausentimer mit digitalen Karteikarten und einer kompakten Always-on-top-Ansicht.

## Funktionen in Version 0.4.0

- Lern- und Pausendauer frei einstellen
- Ein konkretes Lernziel je Fokusphase festlegen und im Overlay anzeigen
- Timer starten, pausieren, zurücksetzen und Phasen überspringen
- Akustisches Signal beim Phasenwechsel
- Karteikarten in eigenen Stapeln erstellen und löschen
- Geführter Bereich **Heute lernen** mit intelligentem Wiederholungsplan
- Acht Lernmethoden von Active Recall bis SQ3R
- Karten mit **Nochmal**, **Schwer**, **Gut** oder **Leicht** selbst bewerten
- Prüfungen mit Zeitlimit, Ergebnis und Fehlerauswertung durchführen
- Ganze Karteikartensammlungen als `.fokusdeck.json` laden und speichern
- Karteikarten aus CSV-Dateien von Excel, LibreOffice und anderen Lernprogrammen importieren
- Lokale Speicherung von Einstellungen, Karten, Wiederholungsständen und Lernentwürfen
- Kompaktes Always-on-top-Overlay für das Lernen in anderen Programmen
- Signierte In-App-Updates direkt aus den Einstellungen
- Schreibgeschützte Obsidian-Anbindung mit automatischer Synchronisierung
- Obsidian-Karten direkt aus FokusDeck in der Ursprungsnotiz öffnen
- Responsive Oberfläche und verständliche Tastatur-Fokuszustände

## Warum diese Technik?

Die UI entsteht mit **TypeScript und React**. Das macht Zustände wie Timer, Kartenstapel und Lernfortschritt übersichtlich und gut testbar. **Tauri 2** stellt die native Desktop-Hülle bereit; der kleine Rust-Kern erlaubt ein echtes Always-on-top-Fenster und später native Benachrichtigungen oder globale Tastenkürzel. Im Vergleich zu einer reinen Browser-App kann das Overlay dadurch zuverlässig über anderen Programmen bleiben.

## Voraussetzungen

- Node.js 22 LTS oder neuer
- pnpm 11
- Rust mit dem stabilen MSVC-Toolchain
- Unter Windows: Microsoft C++ Build Tools und WebView2

Die aktuellen plattformspezifischen Voraussetzungen stehen in der [offiziellen Tauri-Dokumentation](https://v2.tauri.app/start/prerequisites/).

Unter Windows können die wichtigsten Werkzeuge so installiert werden:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools
```

Im Visual-Studio-Installer anschließend die Workload **Desktopentwicklung mit C++** auswählen. Danach PowerShell neu öffnen und prüfen:

```powershell
node --version
cargo --version
```

## Starten

```powershell
pnpm install
pnpm tauri dev
```

Nur die Web-Oberfläche im Browser starten:

```powershell
pnpm dev
```

Parser-Tests und Frontend-Build prüfen:

```powershell
pnpm test
pnpm build
```

Produktions-Build erstellen:

```powershell
pnpm tauri build
```

Der Windows-Installer erkennt eine vorhandene gleiche oder ältere FokusDeck-Version und ersetzt sie automatisch. Eine vorherige Deinstallation ist nicht nötig; lokale Karten, Sammlungen und Einstellungen bleiben erhalten. Ein Downgrade über eine neuere Version wird weiterhin nicht automatisch durchgeführt.

In der installierten App kann unter **Einstellungen → FokusDeck aktualisieren** nach neuen Versionen gesucht werden. Ein verfügbares Update wird signaturgeprüft, heruntergeladen und mit einer kleinen Fortschrittsanzeige installiert; anschließend startet FokusDeck neu.

## Lernmethoden

Der Bereich **Heute lernen** verbindet vier Methoden zu einer geführten Tagesrunde:

1. **Verteiltes Wiederholen (Spaced Repetition):** FokusDeck zeigt Karten dann wieder, wenn sie fällig sind. Deine Bewertung mit **Nochmal**, **Schwer**, **Gut** oder **Leicht** bestimmt automatisch den nächsten Wiederholungszeitpunkt.
2. **Active Recall:** Die Lösung bleibt zunächst verdeckt. Du rufst die Antwort im Kopf ab oder schreibst sie optional auf und vergleichst sie erst danach mit der hinterlegten Lösung.
3. **Fehlerkartei:** Mit **Nochmal** oder **Schwer** bewertete Karten werden automatisch gesammelt und können direkt erneut gelernt werden. Es entstehen keine doppelten Karten; die Karte bleibt in ihrem ursprünglichen Stapel.
4. **Interleaving:** Fällige Karten aus unterschiedlichen Stapeln werden abwechselnd gemischt. Dadurch übst du, zwischen Themen und Lösungswegen umzuschalten.

Daneben stehen vier eigenständige Lernmodi zur Verfügung:

5. **Prüfungsmodus:** Wähle Stapel, Kartenanzahl und Zeitlimit. Die Fragen erscheinen in zufälliger Reihenfolge; am Ende erhältst du ein Ergebnis und kannst falsche oder unsichere Antworten gezielt nachlernen.
6. **Feynman-Methode:** Erkläre ein Thema in einfachen eigenen Worten und halte anschließend eine konkrete Wissenslücke fest. Aus dieser Lücke kannst du direkt eine normale Karteikarte erstellen.
7. **Freies Erinnern:** Schreibe innerhalb von 3, 5 oder 10 Minuten alles auf, was du über einen Stapel oder eine Obsidian-Notiz weißt. Erst danach vergleichst du deinen Text mit den vorhandenen Inhalten.
8. **SQ3R:** Arbeite einen Text in den fünf Schritten **Überblick**, **Fragen**, **Lesen**, **Wiedergeben** und **Wiederholen** durch. Du kannst eine verbundene Obsidian-Notiz auswählen oder jederzeit eigenen Text einfügen. Obsidian-Inhalte werden dabei ausschließlich gelesen und niemals verändert.

### Selbstbewertung

FokusDeck bewertet frei formulierte Antworten nicht automatisch. Nach dem Aufdecken beziehungsweise Vergleichen entscheidest du selbst, wie sicher deine Antwort war. So werden sinngleiche Formulierungen nicht fälschlich als Fehler behandelt. Im Prüfungsmodus markierst du Antworten entsprechend selbst als richtig, teilweise richtig oder falsch.

Zwischenstände und Ergebnisse werden lokal gespeichert. Eine begonnene Tagesrunde oder ein gespeicherter SQ3R-Entwurf kann nach einem Neustart fortgesetzt werden; abgeschlossene Bewertungen bleiben im Wiederholungsplan erhalten.

## Obsidian verbinden

1. In FokusDeck **Einstellungen** öffnen und **Vault auswählen** anklicken.
2. Den Hauptordner des Obsidian-Vaults auswählen. Er muss den Ordner `.obsidian` enthalten.
3. Lernnotizen am Dateianfang mit YAML-Eigenschaften markieren:

```markdown
---
fokusdeck: true
deck: Biologie
---
# Was ist Photosynthese?

Pflanzen wandeln Lichtenergie in chemische Energie um.
```

Die erste Überschrift wird zur Frage, der übrige Text zur Antwort. Alternativ können `question:` und `answer:` direkt in den Eigenschaften stehen. FokusDeck liest nur markierte Markdown-Dateien, verändert den Vault nicht und synchronisiert beim App-Start, beim Fensterfokus und einmal pro Minute.

## Karteikartensammlungen

In der Karteikartenansicht stehen **Sammlung laden** und **Sammlung speichern** zur Verfügung. Ist ein einzelner Stapel ausgewählt, wird nur dieser Stapel gespeichert; bei **Alle Karten** wird die gesamte Sammlung exportiert.

Gespeicherte Dateien enden auf `.fokusdeck.json` und enthalten Fragen, Antworten, Stapel sowie den Lern- und Wiederholungsstand. Ältere FokusDeck-Sammlungen ohne Wiederholungsplan bleiben kompatibel. Lokale Obsidian-Pfade werden nicht exportiert. Beim Laden ergänzt FokusDeck nur neue Karten und überspringt inhaltliche Dubletten, ohne vorhandene Karten zu löschen.

## CSV-Import

Über **CSV importieren** können vorhandene Karteikarten ergänzt werden. Die erste Zeile muss mindestens die Spalten **Frage** und **Antwort** enthalten. Optional sind **Stapel** und **Gemeistert**. Englische Bezeichnungen wie `question`, `answer`, `deck` und `mastered` werden ebenfalls erkannt.

```csv
Frage;Antwort;Stapel;Gemeistert
Was ist Active Recall?;Aktives Abrufen von Wissen;Lernmethoden;ja
Was ist Spaced Repetition?;Verteiltes Wiederholen;Lernmethoden;nein
```

FokusDeck erkennt Semikolon, Komma und Tabulator als Trennzeichen sowie UTF-8- und Windows-1252-Dateien. Anführungszeichen, Kommas und Zeilenumbrüche innerhalb von Feldern werden unterstützt. Bereits vorhandene inhaltliche Dubletten werden übersprungen.

## Projektstruktur

```text
src/                     React-/TypeScript-Oberfläche
  components/            Timer, Dashboard, Karteikarten und Lernmodi
  hooks/                 Timerlogik und lokale Speicherung
  lib/                   Lernplanung, Parser und native Anbindung
src-tauri/               Native Tauri-/Rust-Hülle
  capabilities/          Eng begrenzte Fensterberechtigungen
  nsis/                  Angepasster Windows-Upgrade-Installer
.github/workflows/       Automatische Qualitätsprüfungen
                         und signierte Windows-Releases
```

## Geplante nächste Schritte

- Mehrere Lernprofile und Tagesziele
- Erweiterte Obsidian-Kartenformate mit mehreren Karten pro Notiz
- Export von Karten als CSV
- Systembenachrichtigungen und globale Tastenkürzel
- Installationspakete für Windows, macOS und Linux

## Datenschutz

Timer-Einstellungen, Fokusziele, Karteikarten, Wiederholungsdaten, Prüfungsergebnisse und gespeicherte Lernentwürfe bleiben lokal auf dem Gerät. Es gibt kein Benutzerkonto und keine Cloud-Synchronisation. Frei formulierte Antworten werden nicht an einen externen Dienst gesendet. Bei einer verbundenen Obsidian-Bibliothek liest FokusDeck ausschließlich lokal markierte Markdown-Dateien; die Dateien werden nicht verändert.

## Lizenz

[MIT](LICENSE)
