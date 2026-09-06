# Sicherheit

## Sicherheitslücken melden

Bitte veröffentliche mögliche Sicherheitslücken nicht in einem öffentlichen Issue.
Nutze stattdessen die private Sicherheitsmeldung des Projekts:

https://github.com/ThelGreenlMan/FokusDeck/security/advisories/new

Beschreibe möglichst genau, welche FokusDeck-Version betroffen ist, wie sich das
Problem nachvollziehen lässt und welche Auswirkungen du beobachtet hast. Teile
keine persönlichen Lerninhalte oder privaten Karteikartensammlungen.

## Unterstützte Versionen

Sicherheitskorrekturen werden für die jeweils neueste veröffentlichte
FokusDeck-Version bereitgestellt. Ältere Versionen sollten über die integrierte
Update-Funktion aktualisiert werden.

## Unterstützte Plattform

Offiziell veröffentlicht und sicherheitsseitig unterstützt wird derzeit der
Windows-x64-Installer (`x86_64-pc-windows-msvc`, NSIS). Pakete für Linux und macOS sind geplant, werden aber noch
nicht veröffentlicht oder als produktionsreif unterstützt.

## Nachverfolgte Linux-Abhängigkeit

Tauri 2 bindet unter Linux über GTK3 die Rust-Bibliothek `glib 0.18.5` ein.
Für diese Version ist die öffentliche Warnung
[`RUSTSEC-2024-0429`](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
bekannt. Diese Linux-spezifische Abhängigkeit wird beim unterstützten
Windows-Build nicht kompiliert; Windows verwendet stattdessen WebView2.

Die aktuelle stabile Tauri-2-Paketkette erlaubt kein kompatibles Einzelupdate
auf die korrigierte `glib`-Generation. Deshalb werden keine Linux-Pakete von
FokusDeck veröffentlicht, bis Tauri den offiziellen Wechsel auf GTK4 und
WebKitGTK 6 abgeschlossen hat. Der Upstream-Umstieg und die anschließende
Entfernung dieser Ausnahme werden in
[#13](https://github.com/ThelGreenlMan/FokusDeck/issues/13) nachverfolgt.

### Technische Absicherung der Veröffentlichungen

- Die Tauri-Konfiguration erzeugt standardmäßig ausschließlich NSIS-Pakete.
- Qualitäts- und Release-Workflow bauen explizit für `x86_64-pc-windows-msvc`.
  Vor dem Paketbau prüft `pnpm check:release-policy` den mit `--locked`
  aufgelösten Windows-Abhängigkeitsbaum einschließlich Build-Abhängigkeiten.
  GTK/glib/WebKitGTK-Pakete, ein fehlgeschlagener Cargo-Aufruf oder eine
  unlesbare Ausgabe stoppen den Vorgang. Es gibt keine pauschale
  RustSec-/Dependabot-Ausnahme im Prüfer.
- Vor der Veröffentlichung muss der Release-Entwurf exakt einen Windows-
  Installer, dessen gleichnamige `.exe.sig` und `latest.json` enthalten.
  Der Updater darf ausschließlich `windows-x86_64` und
  `windows-x86_64-nsis` anbieten. Zusätzliche Linux-/macOS-Dateien oder
  Plattformen verhindern die Freigabe des Entwurfs.

Der Prüfer erzwingt die überprüfte Windows-Konfiguration; er behebt die
Linux-Abhängigkeit im plattformübergreifenden Lockfile nicht und ersetzt
keinen vollständigen Schwachstellenscan. Lokale Experimente mit überschriebenen
Tauri-Konfigurationen oder abweichenden Build-Features sind keine unterstützten
Veröffentlichungen.

### Abnahme einer späteren Linux-Freigabe

Issue #13 bleibt offen, bis eine stabile, kompatible Upstream-Migration
vorliegt. Auch Wry 0.56.1 verwendet noch GTK3; die aktuelle Tauri-Runtime
benötigt zudem Wry `^0.55.0`. Ein isoliertes Erzwingen neuerer Wry- oder
glib-Versionen löst die Abhängigkeitskette daher nicht.

Aktuelle Upstream-Arbeit: [Tauri #14684](https://github.com/tauri-apps/tauri/pull/14684)
und [Wry #1767](https://github.com/tauri-apps/wry/pull/1767). Beide Umstellungen
enthalten inkompatible API-Änderungen und sind noch nicht als stabile Migration
verfügbar. Nach einer passenden Veröffentlichung müssen vor dem Entfernen
der Plattformbeschränkung mindestens folgende Schritte erfolgen:

1. Tauri, Runtime, WebView und betroffene Plugins gemeinsam kompatibel aktualisieren.
2. Mit `cargo tree --locked --manifest-path src-tauri/Cargo.toml --target all --invert glib`
   alle enthaltenen glib-Versionen prüfen; bei mehreren Versionen jede einzelne
   mit `--invert glib@VERSION` untersuchen. Keine betroffene Version darf verbleiben.
3. RustSec-/Dependabot-Prüfung wiederholen und die vorhandene Ausnahme neu bewerten.
4. Unter Linux App-Start, WebView, Dateidialoge, Timer und insbesondere das
   Always-on-top-Overlay testen; GTK4 kann bisherige Fensterfunktionen verändern.
5. Erst danach Release-Target, Paketformate, Updater-Allowlist und Tests gemeinsam
   erweitern und Issue #13 schließen.

Quellen zur Paketkette: [Tauri 2.11.5](https://docs.rs/crate/tauri/2.11.5/source/Cargo.toml),
[Runtime-Wry 2.11.4](https://docs.rs/crate/tauri-runtime-wry/2.11.4/source/Cargo.toml),
[Wry 0.56.1](https://docs.rs/crate/wry/0.56.1/source/Cargo.toml).

Zuletzt geprüft: 7. September 2026.
