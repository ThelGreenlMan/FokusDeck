import type { SetStateAction } from "react";

export interface PersistentSnapshot<T> {
  value: T;
  error: string;
  blocked: boolean;
  canRestoreBackup: boolean;
  canReset: boolean;
  originalData: string | null;
  pendingData: string | null;
}

type StorageAccess = Pick<Storage, "getItem" | "setItem">;
const readError = "Die gespeicherten Daten konnten nicht geladen werden. Automatisches Speichern ist für diesen Bereich gesperrt. Die Originaldaten bleiben erhalten.";
const writeError = "Die Änderungen sind noch nicht gespeichert. Der lokale Speicher ist voll oder nicht verfügbar. Bitte erneut versuchen oder die Daten als Datei sichern, bevor du die App schließt.";
const changedError = "Die gespeicherten Daten wurden inzwischen geändert. Bitte erneut laden. Noch nicht gespeicherte Änderungen in diesem Bereich werden dabei verworfen.";
let archiveSequence = 0;

/** Owns one storage key. Construction and reads never modify stored data. */
export function createPersistentStore<T>(
  key: string,
  initialValue: T,
  normalize?: (value: unknown) => T,
  access: () => StorageAccess = () => localStorage,
) {
  const backupKey = `${key}:backup-v1`;
  const listeners = new Set<() => void>();
  let knownRaw: string | null = null;
  let pending = false;
  let retryPendingRead = false;
  let lastArchive: { key: string; raw: string } | null = null;
  let snapshot: PersistentSnapshot<T> = {
    value: initialValue, error: "", blocked: false,
    canRestoreBackup: false, canReset: false, originalData: null, pendingData: null,
  };

  const decode = (raw: string): T => {
    const parsed: unknown = JSON.parse(raw);
    return normalize ? normalize(parsed) : parsed as T;
  };
  const encode = (value: T) => {
    const raw = JSON.stringify(value);
    if (typeof raw !== "string") throw new Error("Nicht speicherbarer Wert");
    return raw;
  };
  const hasBackup = () => {
    try {
      const raw = access().getItem(backupKey);
      if (raw === null) return false;
      decode(raw);
      return true;
    } catch {
      return false;
    }
  };
  const publish = (next: PersistentSnapshot<T>) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const success = (value: T, raw: string | null) => {
    knownRaw = raw;
    pending = false;
    retryPendingRead = false;
    publish({ value, error: "", blocked: false, canRestoreBackup: false, canReset: false, originalData: null, pendingData: null });
  };
  const block = (raw: string | null, readable: boolean, error = readError) => {
    publish({
      ...snapshot, error, blocked: true, originalData: raw,
      canRestoreBackup: readable && hasBackup(), canReset: readable,
    });
  };
  const load = () => {
    retryPendingRead = false;
    let raw: string | null;
    try {
      raw = access().getItem(key);
    } catch {
      block(null, false);
      return;
    }
    knownRaw = raw;
    try {
      success(raw === null ? initialValue : decode(raw), raw);
    } catch {
      block(raw, true);
    }
  };

  const persist = () => {
    if (snapshot.blocked || !pending) return;
    let currentRaw: string | null;
    try {
      currentRaw = access().getItem(key);
    } catch {
      retryPendingRead = true;
      block(null, false, "Die Änderungen sind noch nicht gespeichert, weil der Speicher nicht gelesen werden konnte. Bitte erneut versuchen. Deine Änderungen bleiben bis dahin in dieser geöffneten App erhalten.");
      return;
    }
    if (currentRaw !== knownRaw) {
      knownRaw = currentRaw;
      block(currentRaw, true, changedError);
      return;
    }
    try {
      const storage = access();
      const nextRaw = encode(snapshot.value);
      if (currentRaw !== nextRaw) {
        // The last readable version must be secured before replacing it.
        if (currentRaw !== null) storage.setItem(backupKey, currentRaw);
        storage.setItem(key, nextRaw);
      }
      success(snapshot.value, nextRaw);
    } catch {
      publish({ ...snapshot, error: writeError, originalData: knownRaw });
    }
  };

  const setValue = (action: SetStateAction<T>) => {
    if (snapshot.blocked) return;
    const value = typeof action === "function"
      ? (action as (previous: T) => T)(snapshot.value)
      : action;
    if (Object.is(value, snapshot.value)) return;
    // Ignore startup normalization effects which do not change the value.
    // They must not turn a read into a write or rotate a recovery backup.
    try {
      if (encode(value) === encode(snapshot.value)) return;
    } catch {
      // persist reports serialization failures just like other write errors.
    }
    let pendingData: string | null = null;
    try { pendingData = encode(value); } catch { /* The write error explains serialization failures. */ }
    snapshot = { ...snapshot, value, pendingData };
    pending = true;
    persist();
  };

  const recover = (fromBackup: boolean) => {
    if (!snapshot.blocked || !snapshot.canReset) return;
    try {
      const storage = access();
      const raw = storage.getItem(key);
      // Never replace data that changed after the recovery notice was shown.
      if (raw !== knownRaw) {
        knownRaw = raw;
        block(raw, true, changedError);
        return;
      }
      let value = initialValue;
      if (fromBackup) {
        const backup = storage.getItem(backupKey);
        if (backup === null) throw new Error("Keine Sicherung vorhanden");
        value = decode(backup);
      }
      const nextRaw = encode(value);
      if (raw !== null && !(lastArchive?.raw === raw && storage.getItem(lastArchive.key) === raw)) {
        // Unique archives survive subsequent recoveries; nothing is deleted.
        let archiveKey: string;
        do {
          archiveKey = `${key}:recovery-v1:${Date.now()}:${++archiveSequence}`;
        } while (storage.getItem(archiveKey) !== null);
        storage.setItem(archiveKey, raw);
        lastArchive = { key: archiveKey, raw };
      }
      // Keep the last valid backup untouched during recovery.
      storage.setItem(key, nextRaw);
      success(value, nextRaw);
    } catch {
      publish({
        ...snapshot,
        error: "Die Wiederherstellung konnte nicht sicher gespeichert werden. Bitte prüfe den freien Speicher und versuche es erneut. Die Originaldaten wurden nicht ersetzt.",
        canRestoreBackup: hasBackup(),
      });
    }
  };

  load();
  return {
    getSnapshot: () => snapshot,
    hasError: () => Boolean(snapshot.error),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setValue,
    retry: () => {
      if (pending && (!snapshot.blocked || retryPendingRead)) {
        retryPendingRead = false;
        snapshot = { ...snapshot, blocked: false };
        persist();
      } else load();
    },
    restoreBackup: () => recover(true),
    reset: () => recover(false),
  };
}
