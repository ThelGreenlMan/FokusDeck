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
Windows-Installer. Pakete für Linux und macOS sind geplant, werden aber noch
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

Zuletzt geprüft: 2. September 2026.
