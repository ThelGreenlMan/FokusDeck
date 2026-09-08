import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogs, createLanguageStore, createTranslator, formatDate, formatNumber, getLanguage, getLocale, LANGUAGE_STORAGE_KEY, setLanguage, t } from ".";
import type { LanguageCatalog } from "./catalog";

afterEach(() => { setLanguage("de", { persist: false }); });

describe("local translation engine", () => {
  it("switches labels, plural forms, dates and numbers without translating user text", () => {
    expect(t("app.nav.settings")).toBe("Einstellungen");
    setLanguage("en", { persist: false });
    expect(getLanguage()).toBe("en");
    expect(getLocale()).toBe("en-GB");
    expect(t("app.nav.settings")).toBe("Settings");
    expect(t("app.synced", { count: 1, vault: "Meine Notizen <b>{count}</b>" })).toBe("Synced 1 card from Meine Notizen <b>{count}</b>.");
    expect(t("dashboard.cardsNow", { count: 2 })).toBe("2 cards are due now");
    expect(t("dashboard.cardsNow", { count: 0 })).toBe("0 cards are due now");
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatDate("2026-09-08T12:00:00Z", { dateStyle: "short", timeZone: "UTC" })).toBe("08/09/2026");
    expect(formatDate("invalid")).toBe("Unknown date");
    setLanguage("de", { persist: false });
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(formatDate("2026-09-08T12:00:00Z", { dateStyle: "short", timeZone: "UTC" })).toBe("08.09.26");
  });
  it("uses German for an unsupported language or missing translation, then the key", () => {
    const source: Record<string, LanguageCatalog> = {
      de: { code: "de", name: "Deutsch", locale: "de-DE", messages: { "test.fallback": { one: "{count} Karte", other: "{count} Karten" } } },
      fr: { code: "fr", name: "Français", locale: "fr-FR", messages: {} },
    };
    expect(createTranslator("unknown")("app.nav.settings")).toBe("Einstellungen");
    expect(createTranslator("constructor")("app.nav.settings")).toBe("Einstellungen");
    expect(createTranslator("fr", source)("test.fallback", { count: 0 })).toBe("0 Karten");
    expect(createTranslator("en")("missing.message")).toBe("missing.message");
    expect(createTranslator("en")("constructor")).toBe("constructor");
    expect(createTranslator("en")("app.synced", { count: 1 })).toContain("{vault}");
  });
  it("loads complete bundled languages without modifying the catalogs", () => {
    const before = JSON.stringify(catalogs);
    const keys = Object.keys(catalogs.de.messages).sort();
    expect(Object.keys(catalogs.en.messages).sort()).toEqual(keys);
    for (const code of Object.keys(catalogs)) {
      const translate = createTranslator(code);
      for (const key of keys) expect(translate(key, { count: 3 })).not.toBe(key);
    }
    expect(JSON.stringify(catalogs)).toBe(before);
  });
});

describe("language preference is separate from learning data", () => {
  const storage = (raw: string | null = null) => ({ getItem: vi.fn(() => raw), setItem: vi.fn() });
  it("restores a supported saved preference without an initial write", () => {
    const target = storage('"en"');
    const store = createLanguageStore(() => target);
    expect(store.getSnapshot()).toEqual({ language: "en", languageStorageError: false });
    expect(target.getItem).toHaveBeenCalledExactlyOnceWith(LANGUAGE_STORAGE_KEY);
    expect(target.setItem).not.toHaveBeenCalled();
  });
  it.each([null, "{broken", '"fr"', '"constructor"', '"__proto__"', "42", '{"language":"en"}'])("preserves unknown or damaged preference %s on startup", (raw) => {
    const target = storage(raw);
    expect(createLanguageStore(() => target).getSnapshot().language).toBe("de");
    expect(target.setItem).not.toHaveBeenCalled();
  });
  it("survives a blocked storage getter without writing", () => {
    const store = createLanguageStore(() => { throw new Error("SecurityError"); });
    expect(store.getSnapshot().language).toBe("de");
    expect(store.setLanguage("en")).toBe(false);
    expect(store.getSnapshot()).toEqual({ language: "en", languageStorageError: true });
  });
  it("writes only the language preference; existing study content is byte-identical", () => {
    const entries = new Map([["fokusdeck:flashcards", '[{"front":"Frage","back":"Antwort"}]'], ["fokusdeck:timer-goal-v1", '"Kapitel 3"']]);
    const before = [...entries];
    const target = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
    const store = createLanguageStore(() => target);
    const changed = vi.fn();
    const unsubscribe = store.subscribe(changed);
    expect(store.setLanguage("en")).toBe(true);
    expect(entries.get(LANGUAGE_STORAGE_KEY)).toBe('"en"');
    for (const [key, value] of before) expect(entries.get(key)).toBe(value);
    expect(changed).toHaveBeenCalledOnce();
    expect(createLanguageStore(() => target).getSnapshot().language).toBe("en");
    unsubscribe();
    expect(store.setLanguage("fr")).toBe(false);
    expect(store.getSnapshot().language).toBe("en");
    store.setLanguage("de", { persist: false });
    expect(changed).toHaveBeenCalledOnce();
    expect(entries.get(LANGUAGE_STORAGE_KEY)).toBe('"en"');
  });
  it("keeps the chosen language in memory after write failure and clears the warning after retry", () => {
    const target = storage();
    target.setItem.mockImplementationOnce(() => { throw new Error("Quota exceeded"); });
    const store = createLanguageStore(() => target);
    expect(store.setLanguage("en")).toBe(false);
    expect(store.getSnapshot()).toEqual({ language: "en", languageStorageError: true });
    expect(store.setLanguage("en")).toBe(true);
    expect(store.getSnapshot()).toEqual({ language: "en", languageStorageError: false });
  });
});
