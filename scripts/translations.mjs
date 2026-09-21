import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localeRoot = join(projectRoot, "src/i18n/locales");
const templateRoot = join(projectRoot, "translations/template");
const pluralCategories = new Set(["zero", "one", "two", "few", "many", "other"]);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const placeholders = (text) => [...new Set([...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((match) => match[1]))].sort().join(",");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));

export function readCatalogs(root = localeRoot) {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => [entry.name, Object.fromEntries(readdirSync(join(root, entry.name))
      .filter((file) => file.endsWith(".json"))
      .map((file) => [file, readJson(join(root, entry.name, file))]))]));
}

export function validateCatalogs(catalogs) {
  const errors = [];
  const merged = {};
  for (const [code, files] of Object.entries(catalogs)) {
    const metadata = files["_meta.json"];
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code)) errors.push(`${code}: invalid language folder`);
    if (!record(metadata) || typeof metadata.name !== "string" || !metadata.name.trim()) errors.push(`${code}: missing native language name`);
    try {
      if (typeof metadata?.locale !== "string" || !Intl.DateTimeFormat.supportedLocalesOf([metadata.locale]).length) throw new Error();
      new Intl.Locale(metadata.locale);
    } catch { errors.push(`${code}: invalid or unsupported locale`); }
    if (metadata?.direction !== undefined && !["ltr", "rtl"].includes(metadata.direction)) errors.push(`${code}: invalid direction`);
    const messages = {};
    for (const [file, content] of Object.entries(files)) {
      if (file === "_meta.json") continue;
      if (!record(content)) { errors.push(`${code}/${file}: expected a message object`); continue; }
      for (const [key, value] of Object.entries(content)) {
        if (Object.hasOwn(messages, key)) errors.push(`${code}: duplicate key ${key}`);
        if (!/^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/.test(key)) errors.push(`${code}: invalid key ${key}`);
        messages[key] = value;
        const forms = typeof value === "string" ? [value] : record(value) ? Object.values(value) : [];
        if (typeof value !== "string" && (!record(value) || !Object.hasOwn(value, "other") || Object.keys(value).some((category) => !pluralCategories.has(category)))) {
          errors.push(`${code}/${key}: plural messages need 'other' and valid plural categories`);
        }
        if (!forms.length || forms.some((form) => typeof form !== "string" || !form.trim())) errors.push(`${code}/${key}: translations must be non-empty strings`);
      }
    }
    merged[code] = messages;
  }
  if (!merged.de || !merged.en) errors.push("German and English catalogs are required");
  const reference = merged.en ?? {};
  for (const [code, messages] of Object.entries(merged)) {
    for (const key of Object.keys(reference)) {
      if (!Object.hasOwn(messages, key)) { errors.push(`${code}: missing key ${key}`); continue; }
      const value = messages[key];
      const original = reference[key];
      if ((typeof value === "string") !== (typeof original === "string")) errors.push(`${code}/${key}: string/plural type differs from English`);
      const referenceForm = typeof original === "string" ? original : original?.other;
      if (typeof referenceForm !== "string") continue;
      const forms = typeof value === "string" ? [value] : record(value) ? Object.values(value) : [];
      for (const form of forms) {
        if (typeof form === "string" && placeholders(form) !== placeholders(referenceForm)) errors.push(`${code}/${key}: placeholders must match {${placeholders(referenceForm)}}`);
      }
    }
    for (const key of Object.keys(messages)) if (!Object.hasOwn(reference, key)) errors.push(`${code}: extra key ${key}`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return { languages: Object.keys(merged).length, messages: Object.keys(reference).length };
}

export function templateFiles(catalogs) {
  validateCatalogs(catalogs);
  return Object.fromEntries(Object.entries(catalogs.en).map(([file, value]) => [
    file,
    `${JSON.stringify(file === "_meta.json" ? { name: "CHANGE ME: native language name", locale: "en-GB", direction: "ltr" } : value, null, 2)}\n`,
  ]));
}

function main() {
  const command = process.argv[2] ?? "check";
  const catalogs = readCatalogs();
  const result = validateCatalogs(catalogs);
  const templates = templateFiles(catalogs);
  if (command === "template") {
    // The only writable destination is the generated reference template, never a locale.
    mkdirSync(templateRoot, { recursive: true });
    for (const [file, contents] of Object.entries(templates)) writeFileSync(join(templateRoot, file), contents, "utf8");
    console.log("Updated translations/template from the English catalog. No app translations changed.");
  } else if (command === "check") {
    for (const [file, contents] of Object.entries(templates)) {
      let existing;
      try { existing = readFileSync(join(templateRoot, file), "utf8").replace(/\r\n/g, "\n"); } catch { /* Report the regeneration command below. */ }
      if (existing !== contents) throw new Error(`Translator template is stale: ${file}. Run pnpm translations:template.`);
    }
    console.log(`Translations valid: ${result.languages} languages, ${result.messages} messages each; template is up to date.`);
  } else throw new Error("Usage: node scripts/translations.mjs [check|template]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
