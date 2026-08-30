# FokusDeck

FokusDeck ist eine lokale Desktop-App für konzentriertes Lernen. Sie kombiniert einen frei konfigurierbaren Lern- und Pausentimer mit digitalen Karteikarten und einer kompakten Always-on-top-Ansicht.

## Funktionen im MVP

- Lern- und Pausendauer frei einstellen
- Timer starten, pausieren, zurücksetzen und Phasen überspringen
- Akustisches Signal beim Phasenwechsel
- Karteikarten in eigenen Stapeln erstellen und löschen
- Karten als „gewusst“ oder „noch einmal“ markieren
- Ganze Karteikartensammlungen als `.fokusdeck.json` laden und speichern
- Lokale Speicherung aller Einstellungen und Karten
- Kompaktes Always-on-top-Overlay für das Lernen in anderen Programmen
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

Gespeicherte Dateien enden auf `.fokusdeck.json` und enthalten Fragen, Antworten, Stapel sowie den Lernfortschritt. Lokale Obsidian-Pfade werden nicht exportiert. Beim Laden ergänzt FokusDeck nur neue Karten und überspringt inhaltliche Dubletten, ohne vorhandene Karten zu löschen.

## Projektstruktur

```text
src/                     React-/TypeScript-Oberfläche
  components/            Timer, Dashboard und Karteikarten
  hooks/                 Timerlogik und lokale Speicherung
  lib/                   Obsidian-Parser und native Anbindung
src-tauri/               Native Tauri-/Rust-Hülle
  capabilities/          Eng begrenzte Fensterberechtigungen
.github/workflows/       Automatische Qualitätsprüfungen
```

## Geplante nächste Schritte

- Mehrere Lernprofile und Tagesziele
- Spaced-Repetition-Algorithmus
- Erweiterte Obsidian-Kartenformate mit mehreren Karten pro Notiz
- Import und Export von Karten als CSV
- Systembenachrichtigungen und globale Tastenkürzel
- Installationspakete für Windows, macOS und Linux

## Datenschutz

Timer-Einstellungen und Karteikarten bleiben lokal auf dem Gerät. Es gibt kein Benutzerkonto und keine Cloud-Synchronisation. Bei einer verbundenen Obsidian-Bibliothek liest FokusDeck ausschließlich lokal markierte Markdown-Dateien; die Dateien werden nicht verändert.

## Lizenz

[MIT](LICENSE)
