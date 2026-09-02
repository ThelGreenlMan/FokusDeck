import { useId } from "react";
import type { TimerSettings } from "../types";
import { formatTime } from "../hooks/useStudyTimer";
import {
  normalizeTimerGoal,
  TIMER_GOAL_MAX_LENGTH,
} from "../lib/timerGoal";
import {
  PauseIcon,
  PlayIcon,
  ResetIcon,
  SkipIcon,
} from "./Icons";

interface TimerCardProps {
  mode: "focus" | "break";
  remainingSeconds: number;
  totalSeconds: number;
  isRunning: boolean;
  phaseStarted: boolean;
  settings: TimerSettings;
  focusGoal: string;
  focusGoalLocked?: boolean;
  compact?: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSkip: () => void;
  onSettingsChange?: (settings: TimerSettings) => void;
  onFocusGoalChange?: (goal: string) => void;
}

export function TimerCard({
  mode,
  remainingSeconds,
  totalSeconds,
  isRunning,
  phaseStarted,
  settings,
  focusGoal,
  focusGoalLocked,
  compact = false,
  onStart,
  onPause,
  onReset,
  onSkip,
  onSettingsChange,
  onFocusGoalChange,
}: TimerCardProps) {
  const goalInputId = useId();
  const goalHintId = useId();
  const elapsed = totalSeconds - remainingSeconds;
  const progress = Math.max(0, Math.min(1, elapsed / totalSeconds));
  const progressDegrees = Math.round(progress * 360);
  const modeLabel = mode === "focus" ? "Fokuszeit" : "Erholungspause";
  const visibleFocusGoal = focusGoal.trim();
  const isGoalReadOnly = focusGoalLocked ?? isRunning;

  const updateMinutes = (key: keyof TimerSettings, rawValue: string) => {
    if (!onSettingsChange) return;
    const value = Math.max(1, Math.min(180, Number(rawValue) || 1));
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <section className={`timer-card ${compact ? "timer-card--compact" : ""}`}>
      {!compact && (
        <div className="section-heading">
          <div>
            <p className="eyebrow">Lern-Timer</p>
            <h2>Deine nächste Fokusphase</h2>
          </div>
          <span className={`mode-pill mode-pill--${mode}`}>
            <span />
            {modeLabel}
          </span>
        </div>
      )}

      <div className="timer-card__body">
        <div
          className="timer-ring"
          style={{ "--progress": `${progressDegrees}deg` } as React.CSSProperties}
          aria-label={`${modeLabel}: ${formatTime(remainingSeconds)} verbleibend`}
        >
          <div className="timer-ring__inner">
            <span>{mode === "focus" ? "FOKUS" : "PAUSE"}</span>
            <strong>{formatTime(remainingSeconds)}</strong>
            {!compact && (
              <small>{isRunning ? "Bleib bei einer Sache" : "Bereit, wenn du es bist"}</small>
            )}
          </div>
        </div>

        <div className="timer-controls">
          {!compact && onFocusGoalChange && !isGoalReadOnly && (
            <label className="focus-goal-field" htmlFor={goalInputId}>
              <span>Ziel für diese Fokuszeit</span>
              <input
                id={goalInputId}
                type="text"
                value={focusGoal}
                maxLength={TIMER_GOAL_MAX_LENGTH}
                aria-describedby={goalHintId}
                placeholder="z. B. Kapitel 3 zusammenfassen"
                onChange={(event) =>
                  onFocusGoalChange(normalizeTimerGoal(event.target.value))
                }
              />
              <small id={goalHintId}>
                Bleibt während des Timers und im Overlay sichtbar.
              </small>
            </label>
          )}

          {!compact && isGoalReadOnly && (
            <div className="focus-goal-field focus-goal-field--locked">
              <span>Ziel dieser Fokusphase</span>
              <strong className="focus-goal-field__value">
                {visibleFocusGoal || "Kein Ziel festgelegt"}
              </strong>
              <small>
                {mode === "break"
                  ? "Bleibt bis zur nächsten Fokusphase sichtbar."
                  : "Bleibt bis zum Zurücksetzen unverändert."}
              </small>
            </div>
          )}

          {compact && visibleFocusGoal && (
            <div className="focus-goal-display">
              <span>Ziel der Fokusphase</span>
              <strong title={visibleFocusGoal}>{visibleFocusGoal}</strong>
            </div>
          )}

          <div className="timer-controls__buttons">
            <button
              type="button"
              className="icon-button"
              onClick={onReset}
              aria-label="Timer zurücksetzen"
              title="Zurücksetzen"
            >
              <ResetIcon />
            </button>
            <button
              type="button"
              className="primary-timer-button"
              onClick={isRunning ? onPause : onStart}
            >
              {isRunning ? <PauseIcon /> : <PlayIcon />}
              {isRunning ? "Pausieren" : "Starten"}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onSkip}
              aria-label="Phase überspringen"
              title="Überspringen"
            >
              <SkipIcon />
            </button>
          </div>

          {!compact && onSettingsChange && (
            <div className="duration-settings">
              <label>
                <span>Lerndauer</span>
                <span className="number-input">
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={settings.focusMinutes}
                    disabled={phaseStarted}
                    onChange={(event) =>
                      updateMinutes("focusMinutes", event.target.value)
                    }
                  />
                  <small>min</small>
                </span>
              </label>
              <span className="duration-settings__divider" />
              <label>
                <span>Pausendauer</span>
                <span className="number-input">
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={settings.breakMinutes}
                    disabled={phaseStarted}
                    onChange={(event) =>
                      updateMinutes("breakMinutes", event.target.value)
                    }
                  />
                  <small>min</small>
                </span>
              </label>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
