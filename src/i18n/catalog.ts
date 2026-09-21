export type Message = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);
export type Messages = Record<string, Message>;
export interface LanguageMetadata {
  name: string;
  locale: string;
  direction?: "ltr" | "rtl";
}
export interface LanguageCatalog extends LanguageMetadata {
  code: string;
  messages: Messages;
}

// Every language is bundled locally. Adding a locale folder requires no UI changes
// and never downloads translations or sends learning content to a service.
const files = import.meta.glob<Messages | LanguageMetadata>("./locales/*/*.json", {
  eager: true,
  import: "default",
});

export const catalogs: Record<string, LanguageCatalog> = {};
for (const [path, metadata] of Object.entries(files)) {
  const match = /^\.\/locales\/([^/]+)\/_meta\.json$/.exec(path);
  if (!match) continue;
  const code = match[1];
  const messages: Messages = {};
  for (const [messagePath, content] of Object.entries(files)) {
    if (messagePath.startsWith(`./locales/${code}/`) && messagePath !== path) {
      Object.assign(messages, content);
    }
  }
  catalogs[code] = { ...(metadata as LanguageMetadata), code, messages };
}

export const DEFAULT_LANGUAGE = "de";
export const languages = Object.values(catalogs).map(({ code, name, locale }) => ({ code, name, locale }));
