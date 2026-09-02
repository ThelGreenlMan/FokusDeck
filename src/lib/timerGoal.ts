import type { TimerMode } from "../types";

export const TIMER_GOAL_MAX_LENGTH = 160;

export function normalizeTimerGoal(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]+/g, " ").slice(0, TIMER_GOAL_MAX_LENGTH);
}

interface DisplayedTimerGoalOptions {
  mode: TimerMode;
  phaseStarted: boolean;
  draftGoal: string;
  activeFocusGoal: string | null;
}

export function displayedTimerGoal({
  mode,
  phaseStarted,
  draftGoal,
  activeFocusGoal,
}: DisplayedTimerGoalOptions) {
  const locked =
    (mode === "focus" && phaseStarted) ||
    (mode === "break" && activeFocusGoal !== null);

  return {
    goal: locked ? (activeFocusGoal ?? "") : draftGoal,
    locked,
  };
}
