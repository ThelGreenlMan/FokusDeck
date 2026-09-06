import { useMemo, useSyncExternalStore } from "react";
import { createPersistentStore } from "../lib/persistentStorage";

export interface StorageRecovery {
  blocked: boolean;
  canRestoreBackup: boolean;
  canReset: boolean;
  originalData: string | null;
  pendingData: string | null;
  hasError: () => boolean;
  retry: () => void;
  restoreBackup: () => void;
  reset: () => void;
}

export function usePersistentState<T>(
  key: string,
  initialValue: T,
  normalize?: (value: unknown) => T,
) {
  // Like useState, initialValue/normalize apply when this key is first opened.
  // Store construction is read-only, including React StrictMode's double mount.
  const store = useMemo(
    () => createPersistentStore(key, initialValue, normalize),
    [key],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const recovery: StorageRecovery = useMemo(() => ({
    blocked: snapshot.blocked,
    canRestoreBackup: snapshot.canRestoreBackup,
    canReset: snapshot.canReset,
    originalData: snapshot.originalData,
    pendingData: snapshot.pendingData,
    hasError: store.hasError,
    retry: store.retry,
    restoreBackup: store.restoreBackup,
    reset: store.reset,
  }), [snapshot, store]);

  return [snapshot.value, store.setValue, snapshot.error, recovery] as const;
}
