import { useId } from "react";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
  const goalInputId = useId();
  const goalHintId = useId();
  const elapsed = totalSeconds - remainingSeconds;
  const progress = Math.max(0, Math.min(1, elapsed / totalSeconds));
  const progressDegrees = Math.round(progress * 360);
  const modeLabel = t(mode === "focus" ? "timer.focusMode" : "timer.breakMode");
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
            <p className="eyebrow">{t("timer.eyebrow")}</p>
            <h2>{t("timer.heading")}</h2>
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
          aria-label={t("timer.remaining", { mode: modeLabel, time: formatTime(remainingSeconds) })}
        >
          <div className="timer-ring__inner">
            <span>{t(mode === "focus" ? "timer.focus" : "timer.break").toLocaleUpperCase()}</span>
            <strong>{formatTime(remainingSeconds)}</strong>
            {!compact && (
              <small>{t(isRunning ? "timer.runningHint" : "timer.readyHint")}</small>
            )}
          </div>
        </div>

        <div className="timer-controls">
          {!compact && onFocusGoalChange && !isGoalReadOnly && (
            <label className="focus-goal-field" htmlFor={goalInputId}>
              <span>{t("timer.goalLabel")}</span>
              <input
                id={goalInputId}
                type="text"
                value={focusGoal}
                maxLength={TIMER_GOAL_MAX_LENGTH}
                aria-describedby={goalHintId}
                placeholder={t("timer.goalPlaceholder")}
                onChange={(event) =>
                  onFocusGoalChange(normalizeTimerGoal(event.target.value))
                }
              />
              <small id={goalHintId}>
                {t("timer.goalHint")}
              </small>
            </label>
          )}

          {!compact && isGoalReadOnly && (
            <div className="focus-goal-field focus-goal-field--locked">
              <span>{t("timer.lockedGoalLabel")}</span>
              <strong className="focus-goal-field__value">
                {visibleFocusGoal || t("timer.noGoal")}
              </strong>
              <small>
                {t(mode === "break" ? "timer.goalBreakHint" : "timer.goalLockedHint")}
              </small>
            </div>
          )}

          {compact && visibleFocusGoal && (
            <div className="focus-goal-display">
              <span>{t("timer.overlayGoalLabel")}</span>
              <strong title={visibleFocusGoal}>{visibleFocusGoal}</strong>
            </div>
          )}

          <div className="timer-controls__buttons">
            <button
              type="button"
              className="icon-button"
              onClick={onReset}
              aria-label={t("timer.resetLabel")}
              title={t("timer.reset")}
            >
              <ResetIcon />
            </button>
            <button
              type="button"
              className="primary-timer-button"
              onClick={isRunning ? onPause : onStart}
            >
              {isRunning ? <PauseIcon /> : <PlayIcon />}
              {t(isRunning ? "timer.pause" : "timer.start")}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onSkip}
              aria-label={t("timer.skipLabel")}
              title={t("timer.skip")}
            >
              <SkipIcon />
            </button>
          </div>

          {!compact && onSettingsChange && (
            <div className="duration-settings">
              <label>
                <span>{t("timer.focusDuration")}</span>
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
                  <small>{t("timer.minutesShort")}</small>
                </span>
              </label>
              <span className="duration-settings__divider" />
              <label>
                <span>{t("timer.breakDuration")}</span>
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
                  <small>{t("timer.minutesShort")}</small>
                </span>
              </label>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
