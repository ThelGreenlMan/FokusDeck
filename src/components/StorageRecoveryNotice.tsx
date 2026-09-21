import { useId, useState } from "react";
import type { StorageRecovery } from "../hooks/usePersistentState";
import { isTauriDesktop } from "../lib/obsidian";
import { t, useI18n } from "../i18n";

export interface StorageIssue {
  id?: string;
  title: string;
  error: string;
  recovery: StorageRecovery;
}

async function exportData(title: string, data: string, pending: boolean) {
  const fileName = `FokusDeck-${t(pending ? "storage.pendingFile" : "storage.originalFile")}-${title.replace(/[^a-z0-9äöüß-]/gi, "-")}-${Date.now()}.fokusdeck.json`;
  if (isTauriDesktop()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      title: t(pending ? "storage.exportPending" : "storage.exportOriginalTitle"),
      defaultPath: fileName,
      filters: [{ name: t("storage.fileFilter"), extensions: ["json"] }],
    });
    if (!path) return false;
    const target = path.toLowerCase().endsWith(".fokusdeck.json")
      ? path
      : `${path.replace(/\.json$/i, "")}.fokusdeck.json`;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_collection_file", { path: target, content: data });
  } else {
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return true;
}

export function StorageRecoveryNotice({ title, error, recovery }: StorageIssue) {
  const { t } = useI18n();
  const titleId = useId();
  const [confirmReset, setConfirmReset] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ pending?: boolean; error?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  if (!error) return null;

  const saveData = async (pending: boolean) => {
    const data = pending ? recovery.pendingData : recovery.originalData;
    if (data === null) return;
    setExporting(true);
    setExportMessage(null);
    try {
      if (await exportData(title, data, pending)) {
        setExportMessage({ pending });
      }
    } catch (exportError) {
      setExportMessage({ error: exportError instanceof Error ? exportError.message : String(exportError) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="storage-recovery" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <p role="alert">{error}</p>
      {recovery.blocked && (
        <p>{t("storage.blocked")}</p>
      )}
      {recovery.pendingData !== null && (
        <p>{t("storage.pendingWarning")}</p>
      )}
      <div className="storage-recovery__actions">
        <button type="button" onClick={recovery.retry}>{t("storage.retry")}</button>
        {recovery.blocked && recovery.canRestoreBackup && (
          <button type="button" onClick={recovery.restoreBackup}>{t("storage.restore")}</button>
        )}
        {recovery.originalData !== null && (
          <button type="button" disabled={exporting} onClick={() => void saveData(false)}>
            {t("storage.exportOriginal")}
          </button>
        )}
        {recovery.pendingData !== null && (
          <button type="button" disabled={exporting} onClick={() => void saveData(true)}>
            {t("storage.exportPending")}
          </button>
        )}
        {recovery.blocked && recovery.canReset && !confirmReset && (
          <button type="button" onClick={() => setConfirmReset(true)}>{t("storage.reset")}</button>
        )}
      </div>
      {recovery.blocked && recovery.canReset && confirmReset && (
        <div className="storage-recovery__confirmation">
          <p>{t("storage.confirmReset", { title })}</p>
          <div className="storage-recovery__actions">
            <button type="button" onClick={() => { recovery.reset(); setConfirmReset(false); }}>{t("storage.confirm")}</button>
            <button type="button" onClick={() => setConfirmReset(false)}>{t("storage.cancel")}</button>
          </div>
        </div>
      )}
      {exportMessage && <p role="status">{exportMessage.error !== undefined
        ? t("storage.exportFailed", { error: exportMessage.error })
        : t("storage.exported", { data: t(exportMessage.pending ? "storage.pendingLabel" : "storage.originalLabel") })}</p>}
    </section>
  );
}
