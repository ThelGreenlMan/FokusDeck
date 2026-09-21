import { useSyncExternalStore } from "react";
import { catalogs, DEFAULT_LANGUAGE, languages } from "./catalog";
import { createLanguageStore, createTranslator, type MessageParams } from "./core";

export { catalogs, languages } from "./catalog";
export { createTranslator, createLanguageStore, LANGUAGE_STORAGE_KEY } from "./core";
export type { MessageParams } from "./core";

const store = createLanguageStore(() => typeof window === "undefined" ? undefined : window.localStorage);
export const getLanguage = () => store.getSnapshot().language;
export const getLocale = () => (catalogs[getLanguage()] ?? catalogs[DEFAULT_LANGUAGE]).locale;
export const setLanguage = store.setLanguage;
export const t = (key: string, values?: MessageParams) => createTranslator(getLanguage())(key, values);
export const translate = t;
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(getLocale(), options).format(value);
export function formatDate(value: Date | string | number, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(getLocale(), options).format(date)
    : t("common.unknownDate");
}

export function useI18n() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...state, locale: getLocale(), languages, setLanguage, t, formatNumber, formatDate };
}

let initialized = false;
export function initializeI18n() {
  if (initialized || typeof document === "undefined") return;
  initialized = true;
  const updateDocument = () => {
    const catalog = catalogs[getLanguage()];
    document.documentElement.lang = catalog.locale;
    document.documentElement.dir = catalog.direction ?? "ltr";
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("app.description"));
  };
  updateDocument();
  store.subscribe(updateDocument);
}
