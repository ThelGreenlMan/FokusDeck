import type { TimerSettings } from "../types";
import { formatTime } from "../hooks/useStudyTimer";
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
  settings: TimerSettings;
  compact?: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSkip: () => void;
  onSettingsChange?: (settings: TimerSettings) => void;
}

export function TimerCard({
  mode,
  remainingSeconds,
  totalSeconds,
  isRunning,
  settings,
  compact = false,
  onStart,
  onPause,
  onReset,
  onSkip,
  onSettingsChange,
}: TimerCardProps) {
  const elapsed = totalSeconds - remainingSeconds;
  const progress = Math.max(0, Math.min(1, elapsed / totalSeconds));
  const progressDegrees = Math.round(progress * 360);
  const modeLabel = mode === "focus" ? "Fokuszeit" : "Erholungspause";

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
                    disabled={isRunning}
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
                    disabled={isRunning}
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
