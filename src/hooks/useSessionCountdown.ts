import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function normalizeDuration(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds)) return 0;
  return Math.max(0, Math.round(durationSeconds));
}

/**
 * A neutral countdown for time-boxed learning sessions.
 *
 * Changing the duration stops the current countdown and resets it to the new
 * value. A finished countdown must be reset before it can be started again.
 */
export function useSessionCountdown(durationSeconds: number) {
  const duration = useMemo(
    () => normalizeDuration(durationSeconds),
    [durationSeconds],
  );
  const [remainingSeconds, setRemainingSeconds] = useState(duration);
  const [isRunning, setIsRunning] = useState(false);
  const deadlineRef = useRef(0);

  useEffect(() => {
    deadlineRef.current = 0;
    setIsRunning(false);
    setRemainingSeconds(duration);
  }, [duration]);

  useEffect(() => {
    if (!isRunning || deadlineRef.current === 0) return;

    const tick = () => {
      const nextValue = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1_000),
      );
      setRemainingSeconds(nextValue);

      if (nextValue === 0) {
        deadlineRef.current = 0;
        setIsRunning(false);
      }
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [isRunning, duration]);

  const start = useCallback(() => {
    if (isRunning || remainingSeconds === 0) return;

    deadlineRef.current = Date.now() + remainingSeconds * 1_000;
    setIsRunning(true);
  }, [isRunning, remainingSeconds]);

  const pause = useCallback(() => {
    if (!isRunning) return;

    const nextValue = Math.max(
      0,
      Math.ceil((deadlineRef.current - Date.now()) / 1_000),
    );
    deadlineRef.current = 0;
    setRemainingSeconds(nextValue);
    setIsRunning(false);
  }, [isRunning]);

  const reset = useCallback(() => {
    deadlineRef.current = 0;
    setIsRunning(false);
    setRemainingSeconds(duration);
  }, [duration]);

  return {
    remainingSeconds,
    isRunning,
    isFinished: remainingSeconds === 0,
    start,
    pause,
    reset,
  };
}
