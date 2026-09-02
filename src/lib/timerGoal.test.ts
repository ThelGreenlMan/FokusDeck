import { describe, expect, it } from "vitest";
import {
  displayedTimerGoal,
  normalizeTimerGoal,
  TIMER_GOAL_MAX_LENGTH,
} from "./timerGoal";

describe("normalizeTimerGoal", () => {
  it("accepts a short goal", () => {
    expect(normalizeTimerGoal("Kapitel 3 zusammenfassen")).toBe(
      "Kapitel 3 zusammenfassen",
    );
  });

  it("normalizes line breaks and limits stored values", () => {
    const value = `${"a".repeat(TIMER_GOAL_MAX_LENGTH)}\nzu lang`;
    expect(normalizeTimerGoal(value)).toBe("a".repeat(TIMER_GOAL_MAX_LENGTH));
  });

  it("rejects non-string values", () => {
    expect(normalizeTimerGoal({ goal: "unerwartet" })).toBe("");
  });
});

describe("displayedTimerGoal", () => {
  it("locks the snapshot throughout a started or paused focus phase", () => {
    expect(
      displayedTimerGoal({
        mode: "focus",
        phaseStarted: true,
        draftGoal: "Späteres Ziel",
        activeFocusGoal: "Aktuelles Ziel",
      }),
    ).toEqual({ goal: "Aktuelles Ziel", locked: true });
  });

  it("keeps the completed focus goal visible in the following break", () => {
    expect(
      displayedTimerGoal({
        mode: "break",
        phaseStarted: false,
        draftGoal: "Nächstes Ziel",
        activeFocusGoal: "Vorheriges Ziel",
      }),
    ).toEqual({ goal: "Vorheriges Ziel", locked: true });
  });

  it("returns to the editable draft for a fresh focus phase", () => {
    expect(
      displayedTimerGoal({
        mode: "focus",
        phaseStarted: false,
        draftGoal: "Nächstes Ziel",
        activeFocusGoal: "Vorheriges Ziel",
      }),
    ).toEqual({ goal: "Nächstes Ziel", locked: false });
  });
});
