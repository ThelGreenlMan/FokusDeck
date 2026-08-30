# FokusDeck

FokusDeck ist eine lokale Desktop-App für konzentriertes Lernen. Sie kombiniert einen frei konfigurierbaren Lern- und Pausentimer mit digitalen Karteikarten und einer kompakten Always-on-top-Ansicht.

## Funktionen im MVP

- Lern- und Pausendauer frei einstellen
- Timer starten, pausieren, zurücksetzen und Phasen überspringen
- Akustisches Signal beim Phasenwechsel
- Karteikarten in eigenen Stapeln erstellen und löschen
- Karten als „gewusst“ oder „noch einmal“ markieren
- Lokale Speicherung aller Einstellungen und Karten
- Kompaktes Always-on-top-Overlay für das Lernen in anderen Programmen
- Responsive Oberfläche und verständliche Tastatur-Fokuszustände

## Warum diese Technik?

Die UI entsteht mit **TypeScript und React**. Das macht Zustände wie Timer, Kartenstapel und Lernfortschritt übersichtlich und gut testbar. **Tauri 2** stellt die native Desktop-Hülle bereit; der kleine Rust-Kern erlaubt ein echtes Always-on-top-Fenster und später native Benachrichtigungen oder globale Tastenkürzel. Im Vergleich zu einer reinen Browser-App kann das Overlay dadurch zuverlässig über anderen Programmen bleiben.

## Voraussetzungen

- Node.js 22 LTS oder neuer
- pnpm 10
- Rust mit dem stabilen MSVC-Toolchain
- Unter Windows: Microsoft C++ Build Tools und WebView2

Die aktuellen plattformspezifischen Voraussetzungen stehen in der [offiziellen Tauri-Dokumentation](https://v2.tauri.app/start/prerequisites/).

## Starten

```powershell
pnpm install
pnpm tauri dev
```

Nur die Web-Oberfläche im Browser starten:

```powershell
pnpm dev
```

Produktions-Build erstellen:

```powershell
pnpm tauri build
```

## Projektstruktur

```text
src/                     React-/TypeScript-Oberfläche
  components/            Timer, Dashboard und Karteikarten
  hooks/                 Timerlogik und lokale Speicherung
src-tauri/               Native Tauri-/Rust-Hülle
  capabilities/          Eng begrenzte Fensterberechtigungen
.github/workflows/       Automatische Qualitätsprüfungen
```

## Geplante nächste Schritte

- Mehrere Lernprofile und Tagesziele
- Import und Export von Karten als CSV
- Spaced-Repetition-Algorithmus
- Systembenachrichtigungen und globale Tastenkürzel
- Installationspakete für Windows, macOS und Linux

## Datenschutz

Im aktuellen MVP bleiben Timer-Einstellungen und Karteikarten lokal auf dem Gerät. Es gibt kein Benutzerkonto und keine Cloud-Synchronisation.

## Lizenz

[MIT](LICENSE)
