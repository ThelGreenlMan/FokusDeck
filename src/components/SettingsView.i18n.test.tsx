// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_STORAGE_KEY, setLanguage } from "../i18n";
import { SettingsView } from "./SettingsView";

const props = {
  timerSettings: { focusMinutes: 25, breakMinutes: 5 },
  timerSettingsLocked: false,
  connection: null,
  isDesktop: false,
  isSyncing: false,
  syncMessage: "",
  syncError: "",
  onTimerSettingsChange: vi.fn(),
  onConnect: vi.fn(),
  onSync: vi.fn(),
  onDisconnect: vi.fn(),
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  setLanguage("de", { persist: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  setLanguage("de", { persist: false });
  vi.unstubAllGlobals();
});

describe("SettingsView language selection", () => {
  it("switches the mounted settings and updater immediately and saves only the preference", async () => {
    localStorage.setItem("fokusdeck:cards-v1", "existing cards stay untouched");
    await act(async () => root.render(<SettingsView {...props} />));
    const selector = container.querySelector("select")!;
    expect(selector.closest("label")?.textContent).toContain("Anzeigesprache");
    expect([...selector.options].map((option) => option.text)).toEqual(expect.arrayContaining(["Deutsch", "English"]));
    expect(container.textContent).toContain("Einstellungen");
    expect(container.textContent).toContain("Sprache / Language");

    await act(async () => {
      selector.value = "en";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("h1")?.textContent).toBe("Settings");
    expect(container.textContent).toContain("Update FokusDeck");
    expect(container.textContent).toContain("Check for updates");
    expect(container.textContent).toContain("Study duration");
    expect(container.querySelector("pre")?.textContent).toContain("fokusdeck: true\ndeck: Biology");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('"en"');
    expect(localStorage.getItem("fokusdeck:cards-v1")).toBe("existing cards stay untouched");

    await act(async () => setLanguage("de", { persist: false }));
    expect(container.querySelector("h1")?.textContent).toBe("Einstellungen");
    expect(container.textContent).toContain("Timer-Vorgaben");
  });

  it("explains an unsaved language preference while keeping the selected language usable", async () => {
    await act(async () => root.render(<SettingsView {...props} />));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    await act(async () => setLanguage("en"));
    expect(container.querySelector("h1")?.textContent).toBe("Settings");
    expect(container.textContent).toContain("Your language preference could not be saved locally.");
  });

  it("formats connection counts for the selected language without altering user names or paths", async () => {
    const connection = {
      vaultName: "Meine Prüfung",
      vaultPath: "C:\\Notizen\\Meine Prüfung",
      lastSyncAt: 0,
      importedCards: 1,
      scannedMarkdownFiles: 1234,
    };
    await act(async () => {
      setLanguage("en", { persist: false });
      root.render(<SettingsView {...props} connection={connection} />);
    });
    expect(container.textContent).toContain("1imported card");
    expect(container.textContent).toContain("1,234Markdown files checked");
    expect(container.textContent).toContain("Not synchronized yet");
    expect(container.textContent).toContain(connection.vaultPath);
    expect(container.textContent).toContain(connection.vaultName);
  });
});
