import type { ObsidianConnection, TimerSettings } from "../types";
import { formatDate, formatNumber, useI18n } from "../i18n";
import {
  CheckIcon,
  FolderIcon,
  LinkIcon,
  RefreshIcon,
} from "./Icons";
import { UpdatePanel } from "./UpdatePanel";

interface SettingsViewProps {
  timerSettings: TimerSettings;
  timerSettingsLocked: boolean;
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

export function SettingsView({
  timerSettings,
  timerSettingsLocked,
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
  const { t, language, languages, setLanguage, languageStorageError } = useI18n();
  const updateMinutes = (key: keyof TimerSettings, rawValue: string) => {
    const value = Math.max(1, Math.min(180, Number(rawValue) || 1));
    onTimerSettingsChange({ ...timerSettings, [key]: value });
  };

  return (
    <main className="page-content settings-page">
      <header className="page-intro page-intro--settings">
        <div>
          <p className="eyebrow">{t("settings.eyebrow")}</p>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.intro")}</p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="settings-card settings-card--language">
          <div className="settings-card__heading">
            <h2>{t("settings.languageTitle")}</h2>
          </div>
          <div className="settings-fields">
            <label>
              <span>{t("settings.languageLabel")}</span>
              <select
                className="settings-language-select"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {languages.map((option) => (
                  <option key={option.code} value={option.code} lang={option.code}>{option.name}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="settings-note">{t("settings.languageHint")}</p>
          {languageStorageError && (
            <p className="sync-feedback is-error" role="status">{t("settings.languageUnsaved")}</p>
          )}
        </section>

        <section className="settings-card settings-card--obsidian">
          <div className="settings-card__heading">
            <span className="obsidian-mark" aria-hidden="true">◇</span>
            <div>
              <p className="eyebrow">{t("settings.integration")}</p>
              <h2>{t("settings.obsidianTitle")}</h2>
            </div>
            {connection && (
              <span className="connection-pill">
                <CheckIcon /> {t("settings.connected")}
              </span>
            )}
          </div>

          {!isDesktop && (
            <div className="desktop-required">
              {t("settings.desktopRequired")}
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
                  <strong>{formatNumber(connection.importedCards)}</strong>
                  <span>{t("settings.importedCards", { count: connection.importedCards })}</span>
                </div>
                <div>
                  <strong>{formatNumber(connection.scannedMarkdownFiles)}</strong>
                  <span>{t("settings.scannedFiles", { count: connection.scannedMarkdownFiles })}</span>
                </div>
                <div>
                  <strong>{connection.lastSyncAt
                    ? formatDate(new Date(connection.lastSyncAt), { dateStyle: "short", timeStyle: "short" })
                    : t("settings.neverSynced")}</strong>
                  <span>{t("settings.lastSync")}</span>
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
                  {t(isSyncing ? "settings.syncing" : "settings.syncNow")}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={onConnect}
                  disabled={!isDesktop}
                >
                  {t("settings.chooseAnotherVault")}
                </button>
                <button
                  type="button"
                  className="danger-text-button"
                  onClick={onDisconnect}
                >
                  {t("settings.disconnect")}
                </button>
              </div>
            </>
          ) : (
            <div className="connect-empty-state">
              <span><LinkIcon /></span>
              <div>
                <strong>{t("settings.connectTitle")}</strong>
                <p>{t("settings.connectHint")}</p>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={onConnect}
                disabled={!isDesktop || isSyncing}
              >
                <FolderIcon /> {t("settings.chooseVault")}
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
              <p className="eyebrow">{t("settings.rhythm")}</p>
              <h2>{t("settings.timerDefaults")}</h2>
            </div>
          </div>
          <div className="settings-fields">
            <label>
              <span>{t("settings.focusDuration")}</span>
              <span className="settings-number-input">
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={timerSettings.focusMinutes}
                  disabled={timerSettingsLocked}
                  onChange={(event) => updateMinutes("focusMinutes", event.target.value)}
                />
                {t("settings.minutes")}
              </span>
            </label>
            <label>
              <span>{t("settings.breakDuration")}</span>
              <span className="settings-number-input">
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={timerSettings.breakMinutes}
                  disabled={timerSettingsLocked}
                  onChange={(event) => updateMinutes("breakMinutes", event.target.value)}
                />
                {t("settings.minutes")}
              </span>
            </label>
          </div>
          <p className="settings-note">
            {t(timerSettingsLocked ? "settings.timerLocked" : "settings.timerSaved")}
          </p>
        </section>

        <section className="settings-card settings-card--format">
          <div className="settings-card__heading">
            <div>
              <p className="eyebrow">{t("settings.cardFormat")}</p>
              <h2>{t("settings.markNote")}</h2>
            </div>
          </div>
          <p>
            {t("settings.formatBefore")} <code>fokusdeck: true</code>{t("settings.formatAfter")}
          </p>
          <pre><code>{t("settings.formatExample")}</code></pre>
          <p className="format-hint">
            {t("settings.formatAlternativeBefore")} <code>question:</code> {t("settings.formatAlternativeAnd")} <code>answer:</code> {t("settings.formatAlternativeAfter")}
          </p>
        </section>

        <UpdatePanel isDesktop={isDesktop} />
      </div>
    </main>
  );
}
