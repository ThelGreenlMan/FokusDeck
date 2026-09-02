import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TimerCard } from "./TimerCard";

const defaultProps = {
  mode: "focus" as const,
  remainingSeconds: 1_500,
  totalSeconds: 1_500,
  isRunning: false,
  phaseStarted: false,
  settings: { focusMinutes: 25, breakMinutes: 5 },
  focusGoal: "Kapitel 3 zusammenfassen",
  onStart: () => undefined,
  onPause: () => undefined,
  onReset: () => undefined,
  onSkip: () => undefined,
};

describe("TimerCard focus goal", () => {
  it("shows an editable, labelled goal in the full timer", () => {
    const html = renderToStaticMarkup(
      <TimerCard {...defaultProps} onFocusGoalChange={() => undefined} />,
    );

    expect(html).toContain("Ziel für diese Fokuszeit");
    expect(html).toContain('value="Kapitel 3 zusammenfassen"');
    expect(html).toContain("Bleibt während des Timers und im Overlay sichtbar.");
  });

  it("keeps the goal visible as fixed text while running", () => {
    const html = renderToStaticMarkup(
      <TimerCard
        {...defaultProps}
        isRunning
        onFocusGoalChange={() => undefined}
      />,
    );

    expect(html).not.toContain('value="Kapitel 3 zusammenfassen"');
    expect(html).toContain("Ziel dieser Fokusphase");
    expect(html).toContain("Bleibt bis zum Zurücksetzen unverändert.");
  });

  it("keeps a paused focus goal read-only until reset", () => {
    const html = renderToStaticMarkup(
      <TimerCard
        {...defaultProps}
        remainingSeconds={1_200}
        phaseStarted
        focusGoalLocked
        onFocusGoalChange={() => undefined}
      />,
    );

    expect(html).toContain("Ziel dieser Fokusphase");
    expect(html).toContain("Kapitel 3 zusammenfassen");
  });

  it("shows the same goal without an input in the compact overlay", () => {
    const html = renderToStaticMarkup(<TimerCard {...defaultProps} compact />);

    expect(html).toContain("Ziel der Fokusphase");
    expect(html).toContain("Kapitel 3 zusammenfassen");
    expect(html).not.toContain("<input");
  });

  it("describes how long the previous goal remains visible during a break", () => {
    const html = renderToStaticMarkup(
      <TimerCard
        {...defaultProps}
        mode="break"
        remainingSeconds={300}
        totalSeconds={300}
        focusGoalLocked
        onFocusGoalChange={() => undefined}
      />,
    );

    expect(html).toContain("Bleibt bis zur nächsten Fokusphase sichtbar.");
  });

  it("omits the compact goal area when no goal was entered", () => {
    const html = renderToStaticMarkup(
      <TimerCard {...defaultProps} compact focusGoal="   " />,
    );

    expect(html).not.toContain("focus-goal-display");
  });

  it("limits goal input to the persisted maximum length", () => {
    const html = renderToStaticMarkup(
      <TimerCard {...defaultProps} onFocusGoalChange={() => undefined} />,
    );

    expect(html).toContain('maxLength="160"');
  });

  it("locks duration fields throughout a started phase", () => {
    const html = renderToStaticMarkup(
      <TimerCard
        {...defaultProps}
        phaseStarted
        onSettingsChange={() => undefined}
      />,
    );

    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("uses unique input ids for multiple full timer cards", () => {
    const html = renderToStaticMarkup(
      <>
        <TimerCard {...defaultProps} onFocusGoalChange={() => undefined} />
        <TimerCard {...defaultProps} onFocusGoalChange={() => undefined} />
      </>,
    );
    const inputIds = [...html.matchAll(/<input id="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(inputIds).toHaveLength(2);
    expect(new Set(inputIds).size).toBe(2);
  });
});
