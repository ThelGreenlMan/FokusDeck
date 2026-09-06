// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageRecovery } from "../hooks/usePersistentState";
import { StorageRecoveryNotice } from "./StorageRecoveryNotice";

const mocks = vi.hoisted(() => ({ save: vi.fn(), invoke: vi.fn() }));
vi.mock("../lib/obsidian", () => ({ isTauriDesktop: () => true }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: mocks.save }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

let container: HTMLDivElement;
let root: Root;
const recoveryState = (changes: Partial<StorageRecovery> = {}): StorageRecovery => ({
  blocked: true,
  canRestoreBackup: true,
  canReset: true,
  originalData: '{"cards":',
  pendingData: null,
  hasError: () => true,
  retry: vi.fn(),
  restoreBackup: vi.fn(),
  reset: vi.fn(),
  ...changes,
});

function button(text: string) {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!found) throw new Error(`Button fehlt: ${text}`);
  return found;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.save.mockReset().mockResolvedValue("C:\\Backups\\Original.json");
  mocks.invoke.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(recovery = recoveryState(), error = "Die Daten konnten nicht geladen werden.") {
  await act(async () => root.render(<StorageRecoveryNotice title="Karteikarten" error={error} recovery={recovery} />));
}

describe("StorageRecoveryNotice", () => {
  it("shows nothing for healthy storage", async () => {
    await render(recoveryState({ blocked: false }), "");
    expect(container.textContent).toBe("");
  });

  it("requires confirmation before resetting and permits cancellation", async () => {
    const recovery = recoveryState();
    await render(recovery);
    await act(async () => button("Mit Standardwerten neu beginnen …").click());
    expect(recovery.reset).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Originaldaten werden vorher separat gesichert");
    await act(async () => button("Abbrechen").click());
    expect(recovery.reset).not.toHaveBeenCalled();
    await act(async () => button("Mit Standardwerten neu beginnen …").click());
    await act(async () => button("Zurücksetzen bestätigen").click());
    expect(recovery.reset).toHaveBeenCalledTimes(1);
  });

  it("offers retry and backup recovery as distinct actions", async () => {
    const recovery = recoveryState();
    await render(recovery);
    await act(async () => button("Erneut versuchen").click());
    await act(async () => button("Letzte Sicherung wiederherstellen").click());
    expect(recovery.retry).toHaveBeenCalledTimes(1);
    expect(recovery.restoreBackup).toHaveBeenCalledTimes(1);
    expect(recovery.reset).not.toHaveBeenCalled();
  });

  it("does not offer destructive recovery for a write failure", async () => {
    await render(recoveryState({ blocked: false, pendingData: "[1]" }));
    expect(container.textContent).not.toContain("neu beginnen");
    expect(container.textContent).not.toContain("Letzte Sicherung wiederherstellen");
    expect(button("Ungespeicherte Änderungen sichern")).toBeDefined();
  });

  it("exports original bytes and unsaved changes separately using the permitted file suffix", async () => {
    const originalData = '{"kaputt":';
    const pendingData = '[{"front":"Neue Karte"}]';
    await render(recoveryState({ blocked: false, originalData, pendingData }));
    await act(async () => button("Originaldaten exportieren").click());
    expect(mocks.invoke).toHaveBeenLastCalledWith("write_collection_file", {
      path: "C:\\Backups\\Original.fokusdeck.json", content: originalData,
    });
    await act(async () => button("Ungespeicherte Änderungen sichern").click());
    expect(mocks.invoke).toHaveBeenLastCalledWith("write_collection_file", {
      path: "C:\\Backups\\Original.fokusdeck.json", content: pendingData,
    });
    expect(mocks.save.mock.calls[0][0].defaultPath).toContain("FokusDeck-Original-");
    expect(mocks.save.mock.calls[1][0].defaultPath).toContain("FokusDeck-Ungespeichert-");
    expect(container.textContent).toContain("keine importierbare Kartensammlung");
  });

  it("leaves storage unchanged when the save dialog is cancelled", async () => {
    mocks.save.mockResolvedValue(null);
    const recovery = recoveryState();
    await render(recovery);
    await act(async () => button("Originaldaten exportieren").click());
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(recovery.reset).not.toHaveBeenCalled();
    expect(recovery.restoreBackup).not.toHaveBeenCalled();
  });
});
