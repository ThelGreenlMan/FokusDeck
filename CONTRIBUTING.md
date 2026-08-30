# Zu FokusDeck beitragen

Danke für dein Interesse an FokusDeck.

## Lokale Entwicklung

1. Abhängigkeiten mit `pnpm install` installieren.
2. Die Web-Oberfläche mit `pnpm dev` starten.
3. Die vollständige Desktop-App mit `pnpm tauri dev` starten.
4. Vor einem Pull Request `pnpm build` und `cargo fmt --manifest-path src-tauri/Cargo.toml --check` ausführen.

## Pull Requests

- Änderungen klein und thematisch zusammenhängend halten.
- Neue UI-Zustände auch für Tastaturbedienung und kleine Fenster prüfen.
- Für Änderungen am Timer Hintergrund- und Pausenverhalten mitprüfen.
- Keine personenbezogenen Lerndaten oder lokale Konfigurationsdateien einchecken.
