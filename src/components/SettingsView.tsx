import type { ObsidianConnection, TimerSettings } from "../types";
import {
  CheckIcon,
  FolderIcon,
  LinkIcon,
  RefreshIcon,
} from "./Icons";
import { UpdatePanel } from "./UpdatePanel";

interface SettingsViewProps {
  timerSettings: TimerSettings;
  connection: ObsidianConnection | null;
  isDesktop: boolean;
  isSyncing: boolean;
  syncMessage: string;
  syncError: string;
  onTimerSettingsChange: (settings: TimerSettings) => void;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}

function formatSyncTime(timestamp: number) {
  if (!timestamp) return "Noch nicht synchronisiert";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function SettingsView({
  timerSettings,
  connection,
  isDesktop,
  isSyncing,
  syncMessage,
  syncError,
  onTimerSettingsChange,
  onConnect,
  onSync,
  onDisconnect,
}: SettingsViewProps) {
  const updateMinutes = (key: keyof TimerSettings, rawValue: string) => {
    const value = Math.max(1, Math.min(180, Number(rawValue) || 1));
    onTimerSettingsChange({ ...timerSettings, [key]: value });
  };

  return (
    <main className="page-content settings-page">
      <header className="page-intro page-intro--settings">
        <div>
          <p className="eyebrow">FokusDeck anpassen</p>
          <h1>Einstellungen</h1>
          <p>
            Verbinde deinen Wissensspeicher und lege einen Lernrhythmus fest,
            der zu dir passt.
          </p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="settings-card settings-card--obsidian">
          <div className="settings-card__heading">
            <span className="obsidian-mark" aria-hidden="true">◇</span>
            <div>
              <p className="eyebrow">Integration</p>
              <h2>Obsidian-Vault</h2>
            </div>
            {connection && (
              <span className="connection-pill">
                <CheckIcon /> Verbunden
              </span>
            )}
          </div>

          {!isDesktop && (
            <div className="desktop-required">
              Die Vault-Auswahl wird in der Tauri-Desktop-App aktiv. Die
              Browser-Vorschau kann aus Sicherheitsgründen keine lokalen
              Ordner lesen.
            </div>
          )}

          {connection ? (
            <>
              <div className="vault-summary">
                <span className="vault-summary__icon"><FolderIcon /></span>
                <div>
                  <strong>{connection.vaultName}</strong>
                  <span title={connection.vaultPath}>{connection.vaultPath}</span>
                </div>
              </div>

              <div className="vault-stats">
                <div>
                  <strong>{connection.importedCards}</strong>
                  <span>importierte Karten</span>
                </div>
                <div>
                  <strong>{connection.scannedMarkdownFiles}</strong>
                  <span>Markdown-Dateien geprüft</span>
                </div>
                <div>
                  <strong>{formatSyncTime(connection.lastSyncAt)}</strong>
                  <span>letzte Synchronisierung</span>
                </div>
              </div>

              <div className="settings-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onSync}
                  disabled={isSyncing || !isDesktop}
                >
                  <RefreshIcon className={isSyncing ? "is-spinning" : ""} />
                  {isSyncing ? "Synchronisiere …" : "Jetzt synchronisieren"}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={onConnect}
                  disabled={!isDesktop}
                >
                  Anderen Vault wählen
                </button>
                <button
                  type="button"
                  className="danger-text-button"
                  onClick={onDisconnect}
                >
                  Verbindung trennen
                </button>
              </div>
            </>
          ) : (
            <div className="connect-empty-state">
              <span><LinkIcon /></span>
              <div>
                <strong>Obsidian mit FokusDeck verbinden</strong>
                <p>
                  FokusDeck liest ausschließlich markierte Markdown-Dateien.
                  Bestehende Vault-Dateien werden nicht verändert.
                </p>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={onConnect}
                disabled={!isDesktop || isSyncing}
              >
                <FolderIcon /> Vault auswählen
              </button>
            </div>
          )}

          {(syncMessage || syncError) && (
            <p className={`sync-feedback ${syncError ? "is-error" : "is-success"}`} role="status">
              {syncError || syncMessage}
            </p>
          )}
        </section>

        <section className="settings-card">
          <div className="settings-card__heading">
            <div>
              <p className="eyebrow">Lernrhythmus</p>
              <h2>Timer-Vorgaben</h2>
            </div>
          </div>
          <div className="settings-fields">
            <label>
              <span>Lerndauer</span>
              <span className="settings-number-input">
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={timerSettings.focusMinutes}
                  onChange={(event) => updateMinutes("focusMinutes", event.target.value)}
                />
                Minuten
              </span>
            </label>
            <label>
              <span>Pausendauer</span>
              <span className="settings-number-input">
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={timerSettings.breakMinutes}
                  onChange={(event) => updateMinutes("breakMinutes", event.target.value)}
                />
                Minuten
              </span>
            </label>
          </div>
          <p className="settings-note">
            Änderungen werden lokal gespeichert und beim nächsten Start wieder
            verwendet.
          </p>
        </section>

        <section className="settings-card settings-card--format">
          <div className="settings-card__heading">
            <div>
              <p className="eyebrow">Kartenformat</p>
              <h2>Eine Obsidian-Notiz markieren</h2>
            </div>
          </div>
          <p>
            Ergänze am Anfang einer Notiz die Eigenschaft
            <code>fokusdeck: true</code>. Die erste Überschrift wird zur Frage,
            der restliche Text zur Antwort.
          </p>
          <pre><code>{`---
fokusdeck: true
deck: Biologie
---
# Was ist Photosynthese?

Pflanzen wandeln Lichtenergie
in chemische Energie um.`}</code></pre>
          <p className="format-hint">
            Alternativ kannst du <code>question:</code> und <code>answer:</code>
            direkt in den Eigenschaften angeben.
          </p>
        </section>

        <UpdatePanel isDesktop={isDesktop} />
      </div>
    </main>
  );
}
