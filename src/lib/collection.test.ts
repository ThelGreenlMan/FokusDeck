import { describe, expect, it } from "vitest";
import type { Flashcard } from "../types";
import {
  createCollectionDocument,
  mergeCollection,
  parseCollection,
  serializeCollection,
} from "./collection";

const cards: Flashcard[] = [
  {
    id: "one",
    front: "Was ist Active Recall?",
    back: "Aktives Abrufen von Wissen.",
    deck: "Lernmethoden",
    mastered: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: {
      type: "obsidian",
      vaultName: "Wissen",
      vaultPath: "C:/Wissen",
      relativePath: "Lernen.md",
      modifiedAt: 1,
    },
  },
];

describe("FokusDeck collections", () => {
  it("creates a portable document without local source paths", () => {
    const raw = serializeCollection(cards, "Prüfung");
    const parsed = parseCollection(raw);

    expect(parsed.name).toBe("Prüfung");
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0]).not.toHaveProperty("source");
    expect(parsed.cards[0].mastered).toBe(true);
  });

  it("rejects malformed and unsupported files", () => {
    expect(() => parseCollection("not json")).toThrow("gültiges JSON");
    expect(() => parseCollection('{"format":"other","version":1,"cards":[]}')).toThrow(
      "nicht unterstützt",
    );
    expect(() =>
      parseCollection(
        JSON.stringify({
          format: "fokusdeck.collection",
          version: 1,
          cards: [{ front: "", back: "Antwort", deck: "Test" }],
        }),
      ),
    ).toThrow("Frage von Karte 1");
  });

  it("does not export cards that cannot be imported again", () => {
    expect(() =>
      serializeCollection([{ ...cards[0], front: "x".repeat(1_001) }]),
    ).toThrow("länger als 1000 Zeichen");
  });

  it("merges new cards and skips content duplicates", () => {
    const collection = createCollectionDocument(
      [
        cards[0],
        {
          ...cards[0],
          id: "two",
          front: "Was ist Spaced Repetition?",
          back: "Verteiltes Wiederholen.",
        },
      ],
      "Lernen",
    );
    const result = mergeCollection(cards, collection);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.cards).toHaveLength(2);
  });

  it("creates a fresh id when different cards share an id", () => {
    const collection = createCollectionDocument(
      [{ ...cards[0], front: "Andere Frage", back: "Andere Antwort" }],
      "Kollision",
    );
    const result = mergeCollection(cards, collection);

    expect(result.imported).toBe(1);
    expect(result.cards[1].id).not.toBe("one");
  });
});
