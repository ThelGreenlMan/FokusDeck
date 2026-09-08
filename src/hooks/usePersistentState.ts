import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export function usePersistentState<T>(
  key: string,
  initialValue: T,
  normalize?: (value: unknown) => T,
) {
  const { t } = useI18n();
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
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  }, [key, value]);

  return [value, setValue, storageFailed ? t("app.storageFailed") : ""] as const;
}
