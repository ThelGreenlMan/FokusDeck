import { catalogs, DEFAULT_LANGUAGE, type LanguageCatalog, type Message } from "./catalog";

export type MessageParams = Record<string, string | number>;
export const LANGUAGE_STORAGE_KEY = "fokusdeck:language-v1";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
export interface LanguageSnapshot {
  language: string;
  languageStorageError: boolean;
}

export function createTranslator(language: string, source = catalogs) {
  const catalog = Object.hasOwn(source, language) ? source[language] : source[DEFAULT_LANGUAGE];
  return (key: string, values: MessageParams = {}): string => {
    const messageCatalog = catalog && Object.hasOwn(catalog.messages, key) ? catalog : source[DEFAULT_LANGUAGE];
    const message: Message | undefined = messageCatalog && Object.hasOwn(messageCatalog.messages, key) ? messageCatalog.messages[key] : undefined;
    if (message === undefined) return key;
    let text: string;
    if (typeof message === "string") text = message;
    else {
      const count = typeof values.count === "number" ? values.count : 0;
      text = message[new Intl.PluralRules(messageCatalog.locale).select(count)] ?? message.other;
    }
    return text.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name: string) => {
      const value = values[name];
      if (value === undefined) return placeholder;
      return typeof value === "number" ? new Intl.NumberFormat(catalog.locale).format(value) : value;
    });
  };
}

export function createLanguageStore(
  storage: () => PreferenceStorage | undefined,
  available: Record<string, LanguageCatalog> = catalogs,
) {
  const valid = (value: unknown): value is string =>
    typeof value === "string" && Object.hasOwn(available, value);
  let state: LanguageSnapshot = { language: DEFAULT_LANGUAGE, languageStorageError: false };
  // A missing, unknown or damaged preference never causes an automatic write.
  try {
    const raw = storage()?.getItem(LANGUAGE_STORAGE_KEY);
    const stored: unknown = raw ? JSON.parse(raw) : undefined;
    if (valid(stored)) state = { ...state, language: stored };
  } catch {
    // German remains available even when browser storage is inaccessible.
  }
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setLanguage: (language: string, options: { persist?: boolean } = {}) => {
      if (!valid(language)) return false;
      let languageStorageError = false;
      if (options.persist !== false) {
        try {
          const target = storage();
          if (!target) throw new Error("Preference storage unavailable");
          target.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify(language));
        } catch {
          languageStorageError = true;
        }
      }
      state = { language, languageStorageError };
      listeners.forEach((listener) => listener());
      return !languageStorageError;
    },
  };
}
