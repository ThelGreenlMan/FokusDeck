import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
  const [currentVersion, setCurrentVersion] = useState<string>();
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateError, setUpdateError] = useState<unknown>();
  const [downloadFinished, setDownloadFinished] = useState(false);
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
    setUpdateError(undefined);
    setAvailableUpdate(null);
    setProgress(undefined);
    try {
      const update = await checkForAppUpdate();
      if (!update) {
        setStatus("current");
        return;
      }
      setAvailableUpdate(update);
      setCurrentVersion(update.currentVersion);
      setStatus("available");
    } catch (error) {
      setStatus("error");
      setUpdateError(error);
    }
  };

  const installUpdate = async () => {
    if (!availableUpdate) return;
    setStatus("downloading");
    setDownloadFinished(false);
    setUpdateError(undefined);
    setProgress(undefined);
    try {
      await installPendingAppUpdate((download) => {
        setProgress(download.percent);
        setDownloadFinished(download.finished);
      });
      setStatus("restarting");
    } catch (error) {
      setStatus("error");
      setUpdateError(error);
    }
  };

  const isBusy = status === "checking" || status === "downloading" || status === "restarting";
  const message = status === "error"
    ? formatUpdateError(updateError)
    : t(`settings.update.${status === "downloading" && downloadFinished ? "restarting" : status}`, {
      version: availableUpdate?.version ?? "",
    });

  return (
    <section className="settings-card settings-card--update">
      <div className="update-layout">
        <span className="update-mark"><DownloadIcon /></span>
        <div className="update-copy">
          <p className="eyebrow">{t("settings.update.application")}</p>
          <h2>{t("settings.update.title")}</h2>
          <p>
            {currentVersion ? `${t("settings.update.installed", { version: currentVersion })} ` : ""}
            {t("settings.update.description")}
          </p>
        </div>
        <div className="update-actions">
          {status === "available" ? (
            <button type="button" className="primary-button" onClick={() => void installUpdate()}>
              <DownloadIcon /> {t("settings.update.install", { version: availableUpdate?.version ?? "" })}
            </button>
          ) : status === "downloading" || status === "restarting" ? (
            <button type="button" className="primary-button" disabled>
              <DownloadIcon /> {t("settings.update.installing")}
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void checkForUpdates()}
              disabled={!isDesktop || isBusy}
            >
              {status === "current" ? <CheckIcon /> : <RefreshIcon className={status === "checking" ? "is-spinning" : ""} />}
              {t(status === "checking" ? "settings.update.searching" : "settings.update.check")}
            </button>
          )}
        </div>
      </div>

      {!isDesktop ? (
        <p className="update-feedback is-neutral" role="status">
          {t("settings.update.desktopHint")}
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
          aria-label={t("settings.update.progressLabel")}
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
