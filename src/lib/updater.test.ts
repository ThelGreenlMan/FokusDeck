import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "../i18n";
import { calculateUpdatePercent, checkForAppUpdate, formatUpdateError, installPendingAppUpdate } from "./updater";

afterEach(() => setLanguage("de", { persist: false }));

describe("app updater helpers", () => {
  it("calculates and clamps download progress", () => {
    expect(calculateUpdatePercent(25, 100)).toBe(25);
    expect(calculateUpdatePercent(250, 100)).toBe(100);
    expect(calculateUpdatePercent(-10, 100)).toBe(0);
    expect(calculateUpdatePercent(10)).toBeUndefined();
  });

  it("turns common updater failures into useful messages", () => {
    expect(formatUpdateError(new Error("HTTP 404 Not Found"))).toContain("noch nicht veröffentlicht");
    expect(formatUpdateError(new Error("network request failed"))).toContain("Internetverbindung");
    expect(formatUpdateError(new Error("Signatur ungültig"))).toContain("Signatur ungültig");
  });

  it("formats the same updater errors in the active language", () => {
    const networkError = new Error("network request failed");
    expect(formatUpdateError(networkError)).toContain("Internetverbindung");
    setLanguage("en", { persist: false });
    expect(formatUpdateError(networkError)).toContain("internet connection");
    expect(formatUpdateError(new Error("HTTP 404 Not Found"))).toContain("not been published");
    expect(formatUpdateError(new Error("Signatur ungültig"))).toContain("signature could not be verified");
    expect(formatUpdateError(undefined)).toBe("The update failed.");
    expect(formatUpdateError(new Error("OS code 123"))).toBe("The update failed: OS code 123");
  });

  it("keeps its own errors localizable after the language changes", async () => {
    const desktopError = await checkForAppUpdate().catch((error: unknown) => error);
    const selectionError = await installPendingAppUpdate(() => undefined).catch((error: unknown) => error);
    setLanguage("en", { persist: false });
    expect(formatUpdateError(desktopError)).toBe("Updates are only available in the installed desktop app.");
    expect(formatUpdateError(selectionError)).toBe("No update has been selected yet.");
  });
});
