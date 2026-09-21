import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { setLanguage } from "../i18n";
import type { Flashcard } from "../types";
import { loadCsvFile, parseCsvCollection } from "./csv";
import { createCollectionDocument, loadCollectionFile, mergeCollection, parseCollection, saveCollectionFile, serializeCollection } from "./collection";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./obsidian", () => ({ isTauriDesktop: () => true }));

const card: Flashcard = {
  id: "original-id", front: "Was ist Wärme?", back: "Meine Antwort", deck: "Allgemein",
  mastered: false, createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  setLanguage("de", { persist: false });
});
afterEach(() => setLanguage("de", { persist: false }));

describe("localized collection and CSV messages", () => {
  it("accepts both German and English CSV aliases in the English UI without changing user data", () => {
    setLanguage("en", { persist: false });
    const german = parseCsvCollection("Frage;Antwort;Stapel;Gemeistert\nWas ist Wärme?;Meine Antwort;Allgemein;ja\n", "Meine Sammlung");
    const english = parseCsvCollection("question,answer,deck,mastered\nWas ist Wärme?,Meine Antwort,Allgemein,yes\n", "Meine Sammlung");

    for (const collection of [german, english]) {
      expect(collection.name).toBe("Meine Sammlung");
      expect(collection.cards[0]).toMatchObject({ front: card.front, back: card.back, deck: card.deck, mastered: true });
      expect(collection.format).toBe("fokusdeck.collection");
      expect(collection.version).toBe(1);
    }
    const generated = parseCsvCollection("question,answer\nQ,A\n");
    expect(generated.name).toBe("CSV-Import");
    expect(generated.cards[0].deck).toBe("Allgemein");
  });

  it.each([
    "Frage;Antwort\nMeine Frage;Meine Antwort\n",
    "Frage;Antwort;Stapel\nMeine Frage;Meine Antwort;\n",
    "question,answer,deck\nMeine Frage,Meine Antwort,   \n",
  ])("recognizes the same CSV as a duplicate after a DE-to-EN language switch: %s", (csv) => {
    const original = mergeCollection([], parseCsvCollection(csv)).cards;
    setLanguage("en", { persist: false });
    const importedAgain = mergeCollection(original, parseCsvCollection(csv));

    expect(importedAgain).toMatchObject({ imported: 0, updated: 0, skipped: 1 });
    expect(importedAgain.cards).toEqual(original);
    expect(importedAgain.cards[0].deck).toBe("Allgemein");
    expect(importedAgain.cards[0].id).toBe(original[0].id);
  });

  it("keeps generated collection names stable when the UI language changes", () => {
    const namelessDocument = '{"format":"fokusdeck.collection","version":1,"cards":[]}';
    const defaultName = createCollectionDocument([card]).name;
    const importedName = parseCollection(namelessDocument).name;
    setLanguage("en", { persist: false });
    expect(createCollectionDocument([card]).name).toBe(defaultName);
    expect(createCollectionDocument([card], "   ").name).toBe(defaultName);
    expect(parseCollection(namelessDocument).name).toBe(importedName);
  });

  it("keeps serialized schema keys, existing names and card IDs independent of language", () => {
    setLanguage("en", { persist: false });
    const serialized = serializeCollection([card], "Meine Sammlung");
    expect(serialized.endsWith("\n")).toBe(true);
    expect(Object.keys(JSON.parse(serialized))).toEqual(["format", "version", "name", "exportedAt", "cards"]);
    const english = parseCollection(serialized);
    setLanguage("de", { persist: false });
    const german = parseCollection(serialized);
    expect(english).toEqual(german);
    expect(english.cards[0]).toEqual(card);
    expect(english.name).toBe("Meine Sammlung");
  });

  it.each([
    ["Title,Text\nQ,A", "Question and Answer columns"],
    ['question,answer\n"Q,A', "unclosed quotation mark"],
    ["question,answer\n", "does not contain any flashcards"],
    ["question,answer,mastered\nQ,A,maybe", "yes/no or true/false"],
    ["question,answer\nQ,", "Answer in CSV row 2 is missing"],
  ])("reports English CSV validation for %s", (csv, expected) => {
    setLanguage("en", { persist: false });
    expect(() => parseCsvCollection(csv)).toThrow(expected);
  });

  it("updates an existing CSV validation error, including its field label, after a language switch", () => {
    let error: Error | undefined;
    try { parseCsvCollection("Frage;Antwort\n;A"); } catch (caught) { error = caught as Error; }
    expect(error?.message).toBe("Frage in CSV-Zeile 2 fehlt.");
    setLanguage("en", { persist: false });
    expect(error?.message).toBe("Question in CSV row 2 is missing.");
  });

  it("updates an existing collection validation error and formats its limit for the active locale", () => {
    let error: Error | undefined;
    try { serializeCollection([{ ...card, front: "x".repeat(1_001) }]); } catch (caught) { error = caught as Error; }
    expect(error?.message).toBe("Frage von Karte 1 ist länger als 1.000 Zeichen.");
    setLanguage("en", { persist: false });
    expect(error?.message).toBe("Question on card 1 is longer than 1,000 characters.");
    expect(() => parseCollection("not JSON")).toThrow("does not contain valid JSON");
    expect(() => parseCollection('{"format":"other","version":1,"cards":[]}')).toThrow("format is not supported");
  });

  it("localizes save dialogs while preserving file extensions and the portable content", async () => {
    setLanguage("en", { persist: false });
    vi.mocked(save).mockResolvedValue("C:/export/Meine Sammlung.json");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await saveCollectionFile([card], "Meine Sammlung");
    expect(save).toHaveBeenCalledWith({
      title: "Save FokusDeck collection", defaultPath: "Meine Sammlung.fokusdeck.json",
      filters: [{ name: "FokusDeck collection", extensions: ["json"] }],
    });
    expect(invoke).toHaveBeenCalledWith("write_collection_file", {
      path: "C:/export/Meine Sammlung.fokusdeck.json", content: expect.any(String),
    });
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: string };
    expect(parseCollection(content.content).cards[0]).toEqual(card);
  });

  it("localizes load dialogs without changing filenames, native commands or CSV aliases", async () => {
    setLanguage("en", { persist: false });
    vi.mocked(open).mockResolvedValueOnce("C:/import/Meine Karten.fokusdeck.json");
    vi.mocked(invoke).mockResolvedValueOnce(serializeCollection([card], "Meine Karten"));
    expect((await loadCollectionFile())?.name).toBe("Meine Karten");
    expect(open).toHaveBeenNthCalledWith(1, {
      title: "Load FokusDeck collection", directory: false, multiple: false,
      filters: [{ name: "FokusDeck collection", extensions: ["json"] }],
    });

    vi.mocked(open).mockResolvedValueOnce("C:/import/Deutsche Fragen.csv");
    vi.mocked(invoke).mockResolvedValueOnce("Frage;Antwort\nMeine Frage;Meine Antwort");
    expect((await loadCsvFile())?.name).toBe("Deutsche Fragen");
    expect(open).toHaveBeenNthCalledWith(2, {
      title: "Import flashcards from CSV", directory: false, multiple: false,
      filters: [{ name: "CSV file", extensions: ["csv"] }],
    });
    expect(invoke).toHaveBeenLastCalledWith("read_csv_file", { path: "C:/import/Deutsche Fragen.csv" });
  });
});
