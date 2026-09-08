import { describe, expect, it } from "vitest";
import { readCatalogs, templateFiles, validateCatalogs } from "./translations.mjs";

const fixture = () => Object.fromEntries(["de", "en"].map((code) => [code, {
  "_meta.json": { name: code === "de" ? "Deutsch" : "English", locale: code, direction: "ltr" },
  "common.json": { "app.title": "FokusDeck", "app.cards": { one: "{count} card", other: "{count} cards" } },
}]));

describe("translation contribution checks", () => {
  it("validates every bundled language", () => {
    expect(validateCatalogs(readCatalogs()).languages).toBeGreaterThanOrEqual(2);
  });
  it("accepts a new locale without a code registry change, including its extra plural categories", () => {
    const catalogs = fixture();
    catalogs.fr = structuredClone(catalogs.en);
    catalogs.fr["_meta.json"] = { name: "Français", locale: "fr-FR" };
    catalogs.fr["common.json"]["app.cards"].many = "{count} cartes";
    expect(validateCatalogs(catalogs)).toEqual({ languages: 3, messages: 2 });
  });
  it("rejects missing, extra and duplicate keys", () => {
    const catalogs = fixture();
    delete catalogs.de["common.json"]["app.title"];
    catalogs.de["common.json"]["app.extra"] = "Extra";
    catalogs.de["duplicate.json"] = { "app.cards": "Duplicate" };
    expect(() => validateCatalogs(catalogs)).toThrow(/duplicate key app.cards[\s\S]*missing key app.title[\s\S]*extra key app.extra/);
  });
  it("rejects missing placeholders, missing other, blank text and malformed metadata", () => {
    const catalogs = fixture();
    catalogs.de["_meta.json"] = { name: "", locale: "bad_locale", direction: "up" };
    catalogs.de["common.json"]["app.cards"] = { one: "One card" };
    catalogs.de["common.json"]["app.title"] = " ";
    expect(() => validateCatalogs(catalogs)).toThrow(/native language name/);
    expect(() => validateCatalogs(catalogs)).toThrow(/invalid or unsupported locale/);
    expect(() => validateCatalogs(catalogs)).toThrow(/invalid direction/);
    expect(() => validateCatalogs(catalogs)).toThrow(/need 'other'/);
    expect(() => validateCatalogs(catalogs)).toThrow(/non-empty strings/);
    expect(() => validateCatalogs(catalogs)).toThrow(/placeholders must match/);
  });
  it("generates complete English reference files without mutating the source", () => {
    const catalogs = fixture();
    const original = structuredClone(catalogs);
    const files = templateFiles(catalogs);
    expect(JSON.parse(files["common.json"])).toEqual(catalogs.en["common.json"]);
    expect(JSON.parse(files["_meta.json"]).name).toContain("CHANGE ME");
    expect(catalogs).toEqual(original);
  });
});
