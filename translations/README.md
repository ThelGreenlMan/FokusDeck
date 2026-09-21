# Translating FokusDeck

FokusDeck bundles its translations locally. No translation service receives study
content, and no network connection is required to change the interface language.
German (`de`) is the default; English (`en`, British date/number conventions) is
also available under **Einstellungen / Settings → Sprache / Language**. The choice
applies immediately and is saved separately from study data for the next launch.
Cards, goals, deck names, notes and existing saved drafts are **not translated**.

## Add a language

1. Copy the complete [`template`](template/) folder to
   `src/i18n/locales/<language-code>/`, for example `src/i18n/locales/fr/`.
   The template contains every message with English reference text.
2. Edit `_meta.json`. Set `name` to the native language name (for example
   `Français`), `locale` to a supported BCP 47 tag such as `fr-FR`, and
   `direction` to `ltr` (or `rtl` for a right-to-left language).
3. Translate the **values**, not the keys, in every other JSON file. Keep valid
   UTF-8 JSON. Files are grouped into common UI, study management, learning methods
   and settings. Do not edit `translations/template/` as your contribution: that
   folder is generated and will be overwritten when the reference is refreshed.
4. Run `pnpm check:translations`, `pnpm test`, and `pnpm build`.
5. Restart the development app after adding a folder. It will discover the new
   language and add it to the selector automatically; no React or registry edits
   are needed. Check all screens, the compact overlay, error messages and narrow
   windows, including keyboard navigation. Right-to-left languages also require
   visual layout review; setting metadata alone does not guarantee full RTL layout.
6. Submit a pull request with the translated folder and your test results.

## Placeholders and plural forms

Keep placeholders such as `{count}`, `{name}`, `{path}` and `{time}` **exactly** as
written. You can move them within the sentence. The app inserts user content as
plain text, not HTML, and formats numeric parameters according to the locale.
Strings are never recursively translated or evaluated.

```json
{
  "app.synced": {
    "one": "Synced {count} card from {vault}.",
    "other": "Synced {count} cards from {vault}."
  }
}
```

Plural messages use `Intl.PluralRules`. Keep the object format and its required
`other` fallback. Add `zero`, `one`, `two`, `few`, or `many` as needed by the
language. Each form must preserve the reference placeholders, including `{count}`
where present. Do not change ordinary strings into plural objects or vice versa.

Keep schema/property names and extensions such as `fokusdeck: true`, `deck:`,
`question:`, `answer:`, `.obsidian`, `.csv` and `.fokusdeck.json` unchanged. In the
Obsidian example you may translate the example content, not those property names.
Unknown system error details and user file paths intentionally remain verbatim.

## Maintain translations when changing code

- Add meaningful stable keys to both built-in languages. Render them with
  `useI18n().t(key, parameters)` in components, or `t` from `src/i18n` in helpers.
- Store message keys/parameters or raw errors, not already translated feedback.
  Include `language` in memo dependencies when caching translated display values.
- Do not change stable IDs, stored content or running sessions when changing the
  interface language. Prefer translated labels over localized state sentinels.
- Run `pnpm translations:template` to regenerate the complete translator template
  from English after changing messages, and commit its generated JSON files.
- `pnpm check:translations` verifies metadata, matching keys, duplicate keys across
  files, string/plural shape, non-empty text, placeholders and template freshness.
  It runs in CI. Tests also cover state preservation on a live language switch.

German is the runtime fallback for an unknown language or a missing message; an
unknown key is shown literally as a diagnostic. Complete catalogs are required by
CI, so fallback is a safety net, not a substitute for finishing a translation.
If saving the language preference fails, the app still switches for the current
session and displays a warning. It never overwrites a damaged/unknown preference
automatically at startup.
