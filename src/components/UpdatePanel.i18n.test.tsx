// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { checkForAppUpdate, getCurrentAppVersion, installPendingAppUpdate } from "../lib/updater";
import { UpdatePanel } from "./UpdatePanel";

vi.mock("../lib/updater", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/updater")>();
  return { ...original, checkForAppUpdate: vi.fn(), getCurrentAppVersion: vi.fn(), installPendingAppUpdate: vi.fn() };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setLanguage("de", { persist: false });
  vi.mocked(getCurrentAppVersion).mockResolvedValue("0.4.0");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.resetAllMocks();
  setLanguage("de", { persist: false });
  vi.unstubAllGlobals();
});

describe("UpdatePanel localization", () => {
  it("retranslates existing update status while preserving versions and release-note content", async () => {
    vi.mocked(checkForAppUpdate).mockResolvedValue({
      version: "1.2.3", currentVersion: "0.4.0", notes: "Unveränderter Veröffentlichungstext",
    });
    await act(async () => root.render(<UpdatePanel isDesktop />));
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("Version 1.2.3 ist verfügbar.");
    await act(async () => setLanguage("en", { persist: false }));
    expect(container.textContent).toContain("Version 1.2.3 is available.");
    expect(container.textContent).toContain("Installed version: 0.4.0.");
    expect(container.textContent).toContain("Install version 1.2.3");
    expect(container.textContent).toContain("Unveränderter Veröffentlichungstext");
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
  });

  it("retranslates an already displayed error without retrying the update", async () => {
    vi.mocked(checkForAppUpdate).mockRejectedValue(new Error("network request failed"));
    await act(async () => root.render(<UpdatePanel isDesktop />));
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("Internetverbindung");
    await act(async () => setLanguage("en", { persist: false }));
    expect(container.textContent).toContain("Please check your internet connection.");
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps an in-flight download and progress intact when switching to English", async () => {
    let finishDownload!: () => void;
    let reportProgress!: Parameters<typeof installPendingAppUpdate>[0];
    const download = new Promise<void>((resolve) => { finishDownload = resolve; });
    vi.mocked(checkForAppUpdate).mockResolvedValue({ version: "1.2.3", currentVersion: "0.4.0" });
    vi.mocked(installPendingAppUpdate).mockImplementation((onProgress) => {
      reportProgress = onProgress;
      return download;
    });
    await act(async () => root.render(<UpdatePanel isDesktop />));
    await act(async () => container.querySelector("button")!.click());
    await act(async () => container.querySelector("button")!.click());
    await act(async () => reportProgress({ downloadedBytes: 42, totalBytes: 100, percent: 42, finished: false }));

    const progress = container.querySelector<HTMLElement>('[role="progressbar"]')!;
    const busyButton = container.querySelector("button")!;
    expect(container.textContent).toContain("Version 1.2.3 wird heruntergeladen …");
    expect(busyButton.textContent).toContain("Update wird installiert …");
    expect(busyButton.disabled).toBe(true);
    expect(progress.getAttribute("aria-valuenow")).toBe("42");

    await act(async () => setLanguage("en", { persist: false }));
    expect(container.textContent).toContain("Downloading version 1.2.3 …");
    expect(container.textContent).toContain("Installed version: 0.4.0.");
    expect(container.querySelector("button")).toBe(busyButton);
    expect(busyButton.textContent).toContain("Installing update …");
    expect(busyButton.disabled).toBe(true);
    expect(container.querySelector('[role="progressbar"]')).toBe(progress);
    expect(progress.getAttribute("aria-label")).toBe("Update progress");
    expect(progress.getAttribute("aria-valuenow")).toBe("42");
    expect(progress.querySelector("span")!.style.width).toBe("42%");
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
    expect(installPendingAppUpdate).toHaveBeenCalledTimes(1);

    await act(async () => reportProgress({ downloadedBytes: 70, totalBytes: 100, percent: 70, finished: false }));
    expect(progress.getAttribute("aria-valuenow")).toBe("70");
    expect(container.textContent).toContain("Downloading version 1.2.3 …");
    await act(async () => finishDownload());
    expect(container.textContent).toContain("Download complete. FokusDeck is updating and restarting …");
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
    expect(installPendingAppUpdate).toHaveBeenCalledTimes(1);
  });
});
