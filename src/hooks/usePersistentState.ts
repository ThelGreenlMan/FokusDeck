import { useEffect, useState } from "react";

export function usePersistentState<T>(
  key: string,
  initialValue: T,
  normalize?: (value: unknown) => T,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const storedValue = localStorage.getItem(key);
      if (!storedValue) return initialValue;
      const parsedValue: unknown = JSON.parse(storedValue);
      return normalize ? normalize(parsedValue) : (parsedValue as T);
    } catch {
      return initialValue;
    }
  });
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setStorageError("");
    } catch {
      setStorageError(
        "Die lokale Speicherung ist voll oder nicht verfügbar. Bitte sichere deine Sammlungen, bevor du die App schließt.",
      );
    }
  }, [key, value]);

  return [value, setValue, storageError] as const;
}
