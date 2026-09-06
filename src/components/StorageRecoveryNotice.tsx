import { useId, useState } from "react";
import type { StorageRecovery } from "../hooks/usePersistentState";
import { isTauriDesktop } from "../lib/obsidian";

export interface StorageIssue {
  title: string;
  error: string;
  recovery: StorageRecovery;
}

async function exportData(title: string, data: string, pending: boolean) {
  const fileName = `FokusDeck-${pending ? "Ungespeichert" : "Original"}-${title.replace(/[^a-z0-9äöüß-]/gi, "-")}-${Date.now()}.fokusdeck.json`;
  if (isTauriDesktop()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      title: pending ? "Ungespeicherte Änderungen sichern" : "Originaldaten zur Wiederherstellung sichern",
      defaultPath: fileName,
      filters: [{ name: "FokusDeck-Originaldaten", extensions: ["json"] }],
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
  const titleId = useId();
  const [confirmReset, setConfirmReset] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  if (!error) return null;

  const saveData = async (pending: boolean) => {
    const data = pending ? recovery.pendingData : recovery.originalData;
    if (data === null) return;
    setExporting(true);
    setExportMessage("");
    try {
      if (await exportData(title, data, pending)) {
        setExportMessage(`${pending ? "Ungespeicherte Änderungen" : "Originaldaten"} gesichert. Diese Datei dient der Reparatur und ist keine importierbare Kartensammlung.`);
      }
    } catch (exportError) {
      setExportMessage(`Export fehlgeschlagen: ${exportError instanceof Error ? exportError.message : String(exportError)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="storage-recovery" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <p role="alert">{error}</p>
      {recovery.blocked && (
        <p>Dieser Bereich ist vorübergehend gesperrt. Bearbeite ihn nach der Wiederherstellung weiter.</p>
      )}
      {recovery.pendingData !== null && (
        <p>Deine ungespeicherten Änderungen sind noch in dieser Sitzung vorhanden. Sichere sie vor dem erneuten Laden, Wiederherstellen oder Zurücksetzen.</p>
      )}
      <div className="storage-recovery__actions">
        <button type="button" onClick={recovery.retry}>Erneut versuchen</button>
        {recovery.blocked && recovery.canRestoreBackup && (
          <button type="button" onClick={recovery.restoreBackup}>Letzte Sicherung wiederherstellen</button>
        )}
        {recovery.originalData !== null && (
          <button type="button" disabled={exporting} onClick={() => void saveData(false)}>
            Originaldaten exportieren
          </button>
        )}
        {recovery.pendingData !== null && (
          <button type="button" disabled={exporting} onClick={() => void saveData(true)}>
            Ungespeicherte Änderungen sichern
          </button>
        )}
        {recovery.blocked && recovery.canReset && !confirmReset && (
          <button type="button" onClick={() => setConfirmReset(true)}>Mit Standardwerten neu beginnen …</button>
        )}
      </div>
      {recovery.blocked && recovery.canReset && confirmReset && (
        <div className="storage-recovery__confirmation">
          <p>„{title}“ auf die Standardwerte zurücksetzen? Die bisherigen Originaldaten werden vorher separat gesichert.</p>
          <div className="storage-recovery__actions">
            <button type="button" onClick={() => { recovery.reset(); setConfirmReset(false); }}>Zurücksetzen bestätigen</button>
            <button type="button" onClick={() => setConfirmReset(false)}>Abbrechen</button>
          </div>
        </div>
      )}
      {exportMessage && <p role="status">{exportMessage}</p>}
    </section>
  );
}
