import { describe, expect, it } from "vitest";
import { calculateUpdatePercent, formatUpdateError } from "./updater";

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
});
