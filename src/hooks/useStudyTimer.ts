import { useCallback, useEffect, useRef, useState } from "react";
import type { TimerMode, TimerSettings } from "../types";

function playCompletionTone() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.16);
    gain.gain.setValueAtTime(0.12, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.45);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.45);
  } catch {
    // Audio feedback is optional and may be blocked by the operating system.
  }
}

function secondsFor(mode: TimerMode, settings: TimerSettings) {
  const minutes = mode === "focus" ? settings.focusMinutes : settings.breakMinutes;
  return Math.max(1, Math.round(minutes * 60));
}

export function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useStudyTimer(settings: TimerSettings) {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    secondsFor("focus", settings),
  );
  const [totalSeconds, setTotalSeconds] = useState(() =>
    secondsFor("focus", settings),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [phaseStarted, setPhaseStarted] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const deadlineRef = useRef(0);

  useEffect(() => {
    if (phaseStarted) return;

    const nextTotalSeconds = secondsFor(mode, settings);
    setTotalSeconds(nextTotalSeconds);
    setRemainingSeconds(nextTotalSeconds);
  }, [settings, mode, phaseStarted]);

  const moveToNextPhase = useCallback(
    (countSession: boolean) => {
      const nextMode: TimerMode = mode === "focus" ? "break" : "focus";
      if (countSession && mode === "focus") {
        setCompletedSessions((current) => current + 1);
      }
      const nextTotalSeconds = secondsFor(nextMode, settings);
      setMode(nextMode);
      setTotalSeconds(nextTotalSeconds);
      setRemainingSeconds(nextTotalSeconds);
      setIsRunning(false);
      setPhaseStarted(false);
    },
    [mode, settings],
  );

  useEffect(() => {
    if (!isRunning) return;

    let completed = false;
    const tick = () => {
      const nextValue = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      );
      setRemainingSeconds(nextValue);

      if (nextValue === 0 && !completed) {
        completed = true;
        playCompletionTone();
        moveToNextPhase(true);
      }
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [isRunning, moveToNextPhase]);

  useEffect(() => {
    document.title = `${formatTime(remainingSeconds)} · ${mode === "focus" ? "Fokus" : "Pause"} · FokusDeck`;
    return () => {
      document.title = "FokusDeck";
    };
  }, [remainingSeconds, mode]);

  const start = useCallback(() => {
    deadlineRef.current = Date.now() + remainingSeconds * 1000;
    setPhaseStarted(true);
    setIsRunning(true);
  }, [remainingSeconds]);

  const pause = useCallback(() => {
    const nextValue = Math.max(
      0,
      Math.ceil((deadlineRef.current - Date.now()) / 1000),
    );
    setRemainingSeconds(nextValue);
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    const nextTotalSeconds = secondsFor(mode, settings);
    setIsRunning(false);
    setPhaseStarted(false);
    setTotalSeconds(nextTotalSeconds);
    setRemainingSeconds(nextTotalSeconds);
  }, [mode, settings]);

  const skip = useCallback(() => {
    moveToNextPhase(false);
  }, [moveToNextPhase]);

  return {
    mode,
    remainingSeconds,
    totalSeconds,
    isRunning,
    phaseStarted,
    completedSessions,
    start,
    pause,
    reset,
    skip,
  };
}
