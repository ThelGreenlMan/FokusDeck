# Zu FokusDeck beitragen

Danke für dein Interesse an FokusDeck.

## Lokale Entwicklung

1. Abhängigkeiten mit `pnpm install` installieren.
2. Die Web-Oberfläche mit `pnpm dev` starten.
3. Die vollständige Desktop-App mit `pnpm tauri dev` starten.
4. Vor einem Pull Request `pnpm check:translations`, `pnpm test`, `pnpm build` und `cargo fmt --manifest-path src-tauri/Cargo.toml --check` ausführen.
5. Vor Änderungen am Windows-Paketbau außerdem `pnpm check:release-policy` ausführen.
   Der Prüfer benötigt Cargo und testet den festgelegten Windows-x64-Abhängigkeitsbaum.

Veröffentlichungen sind derzeit auf Windows x64/NSIS beschränkt. Die Release-Policy
und ihre Tests müssen bei einer zukünftigen Plattformfreigabe bewusst zusammen
angepasst werden; die Bedingungen für Linux stehen in [SECURITY.md](SECURITY.md).

## Pull Requests

- Änderungen klein und thematisch zusammenhängend halten.
- Neue UI-Zustände auch für Tastaturbedienung und kleine Fenster prüfen.
- Für Änderungen am Timer Hintergrund- und Pausenverhalten mitprüfen.
- Keine personenbezogenen Lerndaten oder lokale Konfigurationsdateien einchecken.
- Neue Oberflächentexte auf Deutsch und Englisch ergänzen. Mit `pnpm translations:template`
  die Übersetzungsvorlage aktualisieren; beim Sprachwechsel dürfen Timer, Antworten
  und Entwürfe nicht zurückgesetzt werden.

## Weitere Sprachen / Additional languages

Die [Übersetzungsanleitung](translations/README.md) enthält eine vollständige
Vorlage und beschreibt, wie zusätzliche Sprachen ohne Änderungen an der
Programmlogik ergänzt und geprüft werden können.
