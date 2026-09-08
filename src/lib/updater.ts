import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { t } from "../i18n";

export interface AppUpdateInfo {
  currentVersion: string;
  version: string;
  notes?: string;
  date?: string;
}

export interface AppUpdateProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
  finished: boolean;
}

let pendingUpdate: Update | null = null;

export function canUseAppUpdater() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export function calculateUpdatePercent(downloadedBytes: number, totalBytes?: number) {
  if (!totalBytes || totalBytes <= 0) return undefined;
  return Math.min(100, Math.max(0, Math.round((downloadedBytes / totalBytes) * 100)));
}

export function formatUpdateError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  if (rawMessage === "FOKUSDECK_UPDATER_DESKTOP_ONLY") return t("settings.update.desktopOnly");
  if (rawMessage === "FOKUSDECK_UPDATER_NO_SELECTION") return t("settings.update.noSelection");
  if (/404|not found/i.test(rawMessage)) {
    return t("settings.update.errorUnavailable");
  }
  if (/network|fetch|connect|dns|timed?\s*out|offline/i.test(rawMessage)) {
    return t("settings.update.errorNetwork");
  }
  if (/signature|signatur/i.test(rawMessage)) return t("settings.update.errorSignature");
  return rawMessage
    ? t("settings.update.errorDetail", { detail: rawMessage.slice(0, 220) })
    : t("settings.update.error");
}

export async function getCurrentAppVersion() {
  if (!canUseAppUpdater()) return undefined;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!canUseAppUpdater()) {
    throw new Error("FOKUSDECK_UPDATER_DESKTOP_ONLY");
  }

  if (pendingUpdate) {
    await pendingUpdate.close().catch(() => undefined);
    pendingUpdate = null;
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: 20_000 });
  if (!update) return null;

  pendingUpdate = update;
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    notes: update.body,
    date: update.date,
  };
}

export async function installPendingAppUpdate(
  onProgress: (progress: AppUpdateProgress) => void,
) {
  const update = pendingUpdate;
  if (!update) {
    throw new Error("FOKUSDECK_UPDATER_NO_SELECTION");
  }

  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  const reportProgress = (event: DownloadEvent) => {
    if (event.event === "Started") {
      totalBytes = event.data.contentLength;
      downloadedBytes = 0;
    } else if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
    }

    onProgress({
      downloadedBytes,
      totalBytes,
      percent: event.event === "Finished" ? 100 : calculateUpdatePercent(downloadedBytes, totalBytes),
      finished: event.event === "Finished",
    });
  };

  await update.downloadAndInstall(reportProgress, {
    timeout: 600_000,
    restartAfterInstall: true,
  });
  pendingUpdate = null;

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
