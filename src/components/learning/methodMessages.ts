import { t } from "../../i18n";

/** Keep message keys, not translated text, so an open status switches language. */
export interface MethodMessage {
  key: string;
  params?: Record<string, string | number>;
  translatedParams?: Record<string, string>;
}

export function renderMethodMessage(message: MethodMessage | null) {
  if (!message) return "";
  const translated = Object.fromEntries(
    Object.entries(message.translatedParams ?? {}).map(([name, key]) => [name, t(key)]),
  );
  return t(message.key, { ...message.params, ...translated });
}
