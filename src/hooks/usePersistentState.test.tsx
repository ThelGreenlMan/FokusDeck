// @vitest-environment jsdom

import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePersistentState } from "./usePersistentState";

type SavedState = { count: number; label: string };
type HookResult = ReturnType<typeof usePersistentState<SavedState>>;

const key = "fokusdeck:persistence-test";
const backupKey = `${key}:backup-v1`;
const initialValue: SavedState = { count: 0, label: "Standarddaten" };
const savedValue: SavedState = { count: 7, label: "Meine Karten" };
const savedRaw = JSON.stringify(savedValue);
const roots = new Set<Root>();

function normalize(value: unknown): SavedState {
  if (
    typeof value !== "object" ||
    value === null ||
    !("count" in value) ||
    typeof value.count !== "number" ||
    !("label" in value) ||
    typeof value.label !== "string"
  ) {
    throw new Error("Ungültige Lerndaten");
  }
  return { count: value.count, label: value.label };
}

function mount(options: {
  strict?: boolean;
  normalize?: (value: unknown) => SavedState;
  updateOnMount?: boolean;
} = {}) {
  let latest: HookResult | undefined;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);

  function Consumer() {
    latest = usePersistentState(key, initialValue, options.normalize);
    const setValue = latest[1];
    useEffect(() => {
      if (options.updateOnMount) {
        setValue((current) => ({ ...current, count: current.count + 1 }));
      }
    }, [setValue]);
    return <span>{latest[0].label}</span>;
  }

  act(() => {
    root.render(options.strict ? <StrictMode><Consumer /></StrictMode> : <Consumer />);
  });

  return {
    get current(): HookResult {
      if (!latest) throw new Error("Hook was not rendered");
      return latest;
    },
    unmount() {
      act(() => root.unmount());
      roots.delete(root);
      container.remove();
    },
  };
}

function archivedValues() {
  const entries: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const entryKey = localStorage.key(index);
    if (entryKey?.startsWith(`${key}:recovery-v1:`)) {
      entries.push(localStorage.getItem(entryKey)!);
    }
  }
  return entries;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
});

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount();
  });
  roots.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

describe("usePersistentState data protection", () => {
  it("uses defaults on first start and persists the first real change", () => {
    const hook = mount({ strict: true });

    expect(hook.current[0]).toEqual(initialValue);
    expect(hook.current[2]).toBeFalsy();
    expect(hook.current[3].blocked).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();

    act(() => hook.current[1]({ count: 1, label: "Erste Karte" }));

    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ count: 1, label: "Erste Karte" });
    expect(localStorage.getItem(backupKey)).toBeNull();
  });

  it("preserves valid source bytes on mount and backs them up before a change", () => {
    const originalRaw = '{ "count": 7, "label": "Meine Karten" }';
    localStorage.setItem(key, originalRaw);
    const hook = mount({ strict: true, normalize });

    expect(hook.current[0]).toEqual(savedValue);
    expect(localStorage.getItem(key)).toBe(originalRaw);
    expect(localStorage.getItem(backupKey)).toBeNull();

    act(() => hook.current[1]((current) => ({ ...current, count: 8 })));

    expect(localStorage.getItem(backupKey)).toBe(originalRaw);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ ...savedValue, count: 8 });
    expect(hook.current[2]).toBeFalsy();
  });

  it.each(["{broken json", ""])(
    "keeps unreadable JSON %j intact across effects, StrictMode, setters and remounts",
    (originalRaw) => {
      localStorage.setItem(key, originalRaw);
      const hook = mount({ strict: true, updateOnMount: true });

      expect(hook.current[2]).toBeTruthy();
      expect(hook.current[3].blocked).toBe(true);
      expect(hook.current[3].originalData).toBe(originalRaw);
      expect(hook.current[3].pendingData).toBeNull();
      expect(hook.current[0]).toEqual(initialValue);
      act(() => hook.current[1](savedValue));
      expect(hook.current[0]).toEqual(initialValue);
      expect(localStorage.getItem(key)).toBe(originalRaw);
      expect(localStorage.getItem(backupKey)).toBeNull();

      hook.unmount();
      const reopened = mount({ strict: true, updateOnMount: true });
      expect(reopened.current[3].blocked).toBe(true);
      expect(localStorage.getItem(key)).toBe(originalRaw);
    },
  );

  it("blocks on storage read errors and reloads successfully when retried", () => {
    localStorage.setItem(key, savedRaw);
    const originalGetItem = Storage.prototype.getItem;
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
      if (name === key) throw new DOMException("Storage denied", "SecurityError");
      return originalGetItem.call(this, name);
    });
    const hook = mount({ strict: true });

    expect(hook.current[2]).toBeTruthy();
    expect(hook.current[3].blocked).toBe(true);
    expect(hook.current[3].canReset).toBe(false);
    act(() => hook.current[1](initialValue));
    expect(originalGetItem.call(localStorage, key)).toBe(savedRaw);

    read.mockRestore();
    act(() => hook.current[3].retry());

    expect(hook.current[0]).toEqual(savedValue);
    expect(hook.current[2]).toBeFalsy();
    expect(hook.current[3].blocked).toBe(false);
    expect(localStorage.getItem(key)).toBe(savedRaw);
  });

  it("preserves valid JSON that fails schema normalization", () => {
    const originalRaw = '{"count":"seven","label":"Unersetzliche Karten"}';
    localStorage.setItem(key, originalRaw);
    const hook = mount({ strict: true, normalize, updateOnMount: true });

    expect(hook.current[3].blocked).toBe(true);
    expect(hook.current[2]).toBeTruthy();
    expect(localStorage.getItem(key)).toBe(originalRaw);
    expect(localStorage.getItem(backupKey)).toBeNull();

    localStorage.setItem(key, savedRaw);
    act(() => hook.current[3].retry());

    expect(hook.current[0]).toEqual(savedValue);
    expect(hook.current[3].blocked).toBe(false);
    expect(hook.current[2]).toBeFalsy();
  });

  it("keeps unsaved changes in memory after a primary write failure and retries them", () => {
    localStorage.setItem(key, savedRaw);
    const originalSetItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
      if (name === key) throw new DOMException("Quota exceeded", "QuotaExceededError");
      originalSetItem.call(this, name, value);
    });
    const hook = mount();
    const updated = { ...savedValue, count: 8 };

    act(() => hook.current[1](updated));

    expect(hook.current[0]).toEqual(updated);
    expect(hook.current[2]).toBeTruthy();
    expect(hook.current[3].pendingData).toBe(JSON.stringify(updated));
    expect(localStorage.getItem(key)).toBe(savedRaw);
    expect(localStorage.getItem(backupKey)).toBe(savedRaw);

    write.mockRestore();
    act(() => hook.current[3].retry());

    expect(hook.current[0]).toEqual(updated);
    expect(hook.current[2]).toBeFalsy();
    expect(hook.current[3].pendingData).toBeNull();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(updated);
    expect(localStorage.getItem(backupKey)).toBe(savedRaw);
  });

  it("retries a transient read failure before saving without discarding the pending edit", () => {
    localStorage.setItem(key, savedRaw);
    const hook = mount();
    const originalGetItem = Storage.prototype.getItem;
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
      if (name === key) throw new DOMException("Storage denied", "SecurityError");
      return originalGetItem.call(this, name);
    });
    const updated = { ...savedValue, count: 8 };

    act(() => hook.current[1](updated));

    expect(hook.current[0]).toEqual(updated);
    expect(hook.current[2]).toBeTruthy();
    expect(hook.current[3].blocked).toBe(true);
    expect(hook.current[3].pendingData).toBe(JSON.stringify(updated));
    expect(originalGetItem.call(localStorage, key)).toBe(savedRaw);

    read.mockRestore();
    act(() => hook.current[3].retry());

    expect(hook.current[0]).toEqual(updated);
    expect(hook.current[2]).toBeFalsy();
    expect(hook.current[3].blocked).toBe(false);
    expect(hook.current[3].pendingData).toBeNull();
    expect(localStorage.getItem(key)).toBe(JSON.stringify(updated));
    expect(localStorage.getItem(backupKey)).toBe(savedRaw);
  });

  it("detects external changes when retrying an edit after a transient read failure", () => {
    localStorage.setItem(key, savedRaw);
    const hook = mount();
    const originalGetItem = Storage.prototype.getItem;
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
      if (name === key) throw new DOMException("Storage denied", "SecurityError");
      return originalGetItem.call(this, name);
    });
    const updated = { ...savedValue, count: 8 };
    act(() => hook.current[1](updated));
    const externalValue = { count: 99, label: "Zwischenzeitlich geändert" };
    const externalRaw = JSON.stringify(externalValue);
    localStorage.setItem(key, externalRaw);
    read.mockRestore();

    act(() => hook.current[3].retry());

    expect(hook.current[3].blocked).toBe(true);
    expect(hook.current[2]).toBeTruthy();
    expect(hook.current[3].pendingData).toBe(JSON.stringify(updated));
    expect(localStorage.getItem(key)).toBe(externalRaw);
    expect(localStorage.getItem(backupKey)).toBeNull();

    act(() => hook.current[3].retry());

    expect(hook.current[0]).toEqual(externalValue);
    expect(hook.current[2]).toBeFalsy();
    expect(hook.current[3].pendingData).toBeNull();
    expect(localStorage.getItem(key)).toBe(externalRaw);
  });

  it("does not change the primary data when creating its backup fails", () => {
    localStorage.setItem(key, savedRaw);
    const originalSetItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
      if (name === backupKey) throw new DOMException("Quota exceeded", "QuotaExceededError");
      originalSetItem.call(this, name, value);
    });
    const hook = mount();
    const updated = { ...savedValue, count: 8 };

    act(() => hook.current[1](updated));

    expect(hook.current[2]).toBeTruthy();
    expect(localStorage.getItem(key)).toBe(savedRaw);
    expect(write.mock.calls.some(([name]) => name === key)).toBe(false);

    write.mockRestore();
    act(() => hook.current[3].retry());

    expect(hook.current[2]).toBeFalsy();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(updated);
    expect(localStorage.getItem(backupKey)).toBe(savedRaw);
  });

  it("restores a valid backup only on request and archives the damaged original", () => {
    const originalRaw = "[damaged collection";
    localStorage.setItem(key, originalRaw);
    localStorage.setItem(backupKey, savedRaw);
    const hook = mount({ normalize });

    expect(hook.current[3].canRestoreBackup).toBe(true);
    expect(localStorage.getItem(key)).toBe(originalRaw);
    expect(archivedValues()).toEqual([]);

    act(() => hook.current[3].restoreBackup());

    expect(hook.current[0]).toEqual(savedValue);
    expect(hook.current[2]).toBeFalsy();
    expect(hook.current[3].blocked).toBe(false);
    expect(archivedValues()).toContain(originalRaw);
    expect(localStorage.getItem(backupKey)).toBe(savedRaw);
    hook.unmount();
    const reopened = mount({ normalize });
    expect(reopened.current[0]).toEqual(savedValue);
    expect(reopened.current[3].blocked).toBe(false);
  });

  it.each(["{invalid backup", '{"count":"invalid","label":"Backup"}'])(
    "refuses recovery from an invalid backup %j",
    (backupRaw) => {
      const originalRaw = "{damaged original";
      localStorage.setItem(key, originalRaw);
      localStorage.setItem(backupKey, backupRaw);
      const hook = mount({ normalize });

      expect(hook.current[3].canRestoreBackup).toBe(false);
      act(() => hook.current[3].restoreBackup());

      expect(hook.current[3].blocked).toBe(true);
      expect(localStorage.getItem(key)).toBe(originalRaw);
      expect(localStorage.getItem(backupKey)).toBe(backupRaw);
    },
  );

  it("archives an original before an explicit reset, which survives a restart", () => {
    const originalRaw = "{damaged original";
    localStorage.setItem(key, originalRaw);
    const hook = mount();

    expect(hook.current[3].canReset).toBe(true);
    act(() => hook.current[3].reset());

    expect(hook.current[0]).toEqual(initialValue);
    expect(hook.current[3].blocked).toBe(false);
    expect(hook.current[2]).toBeFalsy();
    expect(archivedValues()).toContain(originalRaw);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(initialValue);

    hook.unmount();
    const reopened = mount();
    expect(reopened.current[0]).toEqual(initialValue);
    expect(reopened.current[2]).toBeFalsy();
  });

  it.each(["restoreBackup", "reset"] as const)(
    "refuses %s if the original cannot be archived",
    (action) => {
      const originalRaw = "{damaged original";
      localStorage.setItem(key, originalRaw);
      localStorage.setItem(backupKey, savedRaw);
      const originalSetItem = Storage.prototype.setItem;
      const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
        if (name.startsWith(`${key}:recovery-v1:`)) {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        originalSetItem.call(this, name, value);
      });
      const hook = mount();

      act(() => hook.current[3][action]());

      expect(hook.current[3].blocked).toBe(true);
      expect(hook.current[2]).toBeTruthy();
      expect(localStorage.getItem(key)).toBe(originalRaw);
      expect(localStorage.getItem(backupKey)).toBe(savedRaw);
      expect(write.mock.calls.some(([name]) => name === key)).toBe(false);
    },
  );

  it("never overwrites previous recovery archives even within the same millisecond", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234567890);
    localStorage.setItem(key, "{first damaged original");
    const first = mount();
    act(() => first.current[3].reset());
    first.unmount();

    localStorage.setItem(key, "{second damaged original");
    const second = mount();
    act(() => second.current[3].reset());

    expect(archivedValues().sort()).toEqual([
      "{first damaged original",
      "{second damaged original",
    ]);
  });

  it.each(["restoreBackup", "reset"] as const)(
    "preserves the original and backup if the primary write fails during %s",
    (action) => {
      const originalRaw = "{damaged original";
      localStorage.setItem(key, originalRaw);
      localStorage.setItem(backupKey, savedRaw);
      const hook = mount();
      const originalSetItem = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
        if (name === key) throw new DOMException("Quota exceeded", "QuotaExceededError");
        originalSetItem.call(this, name, value);
      });

      act(() => hook.current[3][action]());

      expect(hook.current[3].blocked).toBe(true);
      expect(hook.current[2]).toBeTruthy();
      expect(localStorage.getItem(key)).toBe(originalRaw);
      expect(localStorage.getItem(backupKey)).toBe(savedRaw);
      expect(archivedValues()).toContain(originalRaw);
    },
  );

  it.each(["restoreBackup", "reset"] as const)(
    "does not replace data changed since the %s recovery notice was shown",
    (action) => {
      localStorage.setItem(key, "{damaged original");
      localStorage.setItem(backupKey, savedRaw);
      const hook = mount();
      const externalValue = { count: 99, label: "Zwischenzeitlich wiederhergestellt" };
      const externalRaw = JSON.stringify(externalValue);
      localStorage.setItem(key, externalRaw);

      act(() => hook.current[3][action]());

      expect(hook.current[3].blocked).toBe(true);
      expect(localStorage.getItem(key)).toBe(externalRaw);
      expect(archivedValues()).toEqual([]);
      act(() => hook.current[3].retry());
      expect(hook.current[0]).toEqual(externalValue);
      expect(hook.current[2]).toBeFalsy();
    },
  );

  it("reuses the original archive across failed recovery writes and a successful retry", () => {
    const originalRaw = "{damaged original";
    localStorage.setItem(key, originalRaw);
    localStorage.setItem(backupKey, savedRaw);
    const hook = mount();
    const originalSetItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
      if (name === key) throw new DOMException("Quota exceeded", "QuotaExceededError");
      originalSetItem.call(this, name, value);
    });

    act(() => hook.current[3].restoreBackup());
    act(() => hook.current[3].restoreBackup());

    expect(hook.current[3].blocked).toBe(true);
    expect(hook.current[2]).toBeTruthy();
    expect(localStorage.getItem(key)).toBe(originalRaw);
    expect(archivedValues()).toEqual([originalRaw]);

    write.mockRestore();
    act(() => hook.current[3].restoreBackup());

    expect(hook.current[0]).toEqual(savedValue);
    expect(hook.current[3].blocked).toBe(false);
    expect(hook.current[2]).toBeFalsy();
    expect(localStorage.getItem(key)).toBe(savedRaw);
    expect(archivedValues()).toEqual([originalRaw]);
  });

  it("blocks writing over externally changed data until it is reloaded", () => {
    localStorage.setItem(key, savedRaw);
    const hook = mount();
    const externalValue = { count: 99, label: "Änderung aus anderem Fenster" };
    const externalRaw = JSON.stringify(externalValue);
    localStorage.setItem(key, externalRaw);

    act(() => hook.current[1]((current) => ({ ...current, count: 8 })));

    expect(hook.current[3].blocked).toBe(true);
    expect(hook.current[2]).toBeTruthy();
    expect(localStorage.getItem(key)).toBe(externalRaw);
    expect(localStorage.getItem(backupKey)).toBeNull();

    act(() => hook.current[3].retry());

    expect(hook.current[0]).toEqual(externalValue);
    expect(hook.current[2]).toBeFalsy();
    expect(hook.current[3].blocked).toBe(false);
    act(() => hook.current[1]((current) => ({ ...current, count: 100 })));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ ...externalValue, count: 100 });
    expect(localStorage.getItem(backupKey)).toBe(externalRaw);
  });

  it("applies consecutive functional updates exactly once in StrictMode", () => {
    localStorage.setItem(key, JSON.stringify(initialValue));
    const hook = mount({ strict: true });

    act(() => {
      hook.current[1]((current) => ({ ...current, count: current.count + 1 }));
      hook.current[1]((current) => ({ ...current, count: current.count + 1 }));
    });

    expect(hook.current[0].count).toBe(2);
    expect(JSON.parse(localStorage.getItem(key)!).count).toBe(2);
    expect(JSON.parse(localStorage.getItem(backupKey)!).count).toBe(1);
    hook.unmount();
    expect(mount({ strict: true }).current[0].count).toBe(2);
  });

  it("does not rotate a useful backup for an equivalent startup normalization", () => {
    localStorage.setItem(key, savedRaw);
    const olderRaw = JSON.stringify({ ...savedValue, count: 6 });
    localStorage.setItem(backupKey, olderRaw);
    const hook = mount({ strict: true });

    act(() => hook.current[1]((current) => ({ ...current })));

    expect(localStorage.getItem(key)).toBe(savedRaw);
    expect(localStorage.getItem(backupKey)).toBe(olderRaw);
    expect(hook.current[2]).toBeFalsy();
  });
});
