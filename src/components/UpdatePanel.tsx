import { useEffect, useState } from "react";
import {
  checkForAppUpdate,
  formatUpdateError,
  getCurrentAppVersion,
  installPendingAppUpdate,
  type AppUpdateInfo,
} from "../lib/updater";
import { CheckIcon, DownloadIcon, RefreshIcon } from "./Icons";

type UpdateStatus = "idle" | "checking" | "current" | "available" | "downloading" | "restarting" | "error";

interface UpdatePanelProps {
  isDesktop: boolean;
}

export function UpdatePanel({ isDesktop }: UpdatePanelProps) {
  const [currentVersion, setCurrentVersion] = useState<string>();
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [message, setMessage] = useState("Updates werden nur auf Knopfdruck gesucht.");
  const [progress, setProgress] = useState<number>();

  useEffect(() => {
    let active = true;
    void getCurrentAppVersion()
      .then((version) => {
        if (active) setCurrentVersion(version);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const checkForUpdates = async () => {
    setStatus("checking");
    setMessage("FokusDeck sucht nach einer neuen Version …");
    setAvailableUpdate(null);
    setProgress(undefined);
    try {
      const update = await checkForAppUpdate();
      if (!update) {
        setStatus("current");
        setMessage("Du verwendest bereits die neueste Version.");
        return;
      }
      setAvailableUpdate(update);
      setCurrentVersion(update.currentVersion);
      setStatus("available");
      setMessage(`Version ${update.version} ist verfügbar.`);
    } catch (error) {
      setStatus("error");
      setMessage(formatUpdateError(error));
    }
  };

  const installUpdate = async () => {
    if (!availableUpdate) return;
    setStatus("downloading");
    setMessage(`Version ${availableUpdate.version} wird heruntergeladen …`);
    setProgress(undefined);
    try {
      await installPendingAppUpdate((download) => {
        setProgress(download.percent);
        setMessage(
          download.finished
            ? "Download abgeschlossen. FokusDeck wird aktualisiert und neu gestartet …"
            : `Version ${availableUpdate.version} wird heruntergeladen …`,
        );
      });
      setStatus("restarting");
    } catch (error) {
      setStatus("error");
      setMessage(formatUpdateError(error));
    }
  };

  const isBusy = status === "checking" || status === "downloading" || status === "restarting";

  return (
    <section className="settings-card settings-card--update">
      <div className="update-layout">
        <span className="update-mark"><DownloadIcon /></span>
        <div className="update-copy">
          <p className="eyebrow">Anwendung</p>
          <h2>FokusDeck aktualisieren</h2>
          <p>
            {currentVersion ? `Installierte Version: ${currentVersion}. ` : ""}
            Neue Versionen werden sicher geprüft und direkt in der App installiert.
          </p>
        </div>
        <div className="update-actions">
          {status === "available" ? (
            <button type="button" className="primary-button" onClick={() => void installUpdate()}>
              <DownloadIcon /> Version {availableUpdate?.version} installieren
            </button>
          ) : status === "downloading" || status === "restarting" ? (
            <button type="button" className="primary-button" disabled>
              <DownloadIcon /> Update wird installiert …
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void checkForUpdates()}
              disabled={!isDesktop || isBusy}
            >
              {status === "current" ? <CheckIcon /> : <RefreshIcon className={status === "checking" ? "is-spinning" : ""} />}
              {status === "checking" ? "Suche …" : "Nach Updates suchen"}
            </button>
          )}
        </div>
      </div>

      {!isDesktop ? (
        <p className="update-feedback is-neutral" role="status">
          Die Update-Funktion ist in der installierten Desktop-App verfügbar.
        </p>
      ) : (
        <p className={`update-feedback ${status === "error" ? "is-error" : status === "current" ? "is-success" : "is-neutral"}`} role="status" aria-live="polite">
          {message}
        </p>
      )}

      {status === "downloading" && (
        <div
          className="update-progress"
          role="progressbar"
          aria-label="Update-Fortschritt"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span
            className={progress === undefined ? "is-indeterminate" : undefined}
            style={progress === undefined ? undefined : { width: `${progress}%` }}
          />
        </div>
      )}

      {availableUpdate?.notes && status === "available" && (
        <p className="update-notes">{availableUpdate.notes.slice(0, 500)}</p>
      )}
    </section>
  );
}
