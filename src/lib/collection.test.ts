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

  it("restores a newer learning state onto a content duplicate", () => {
    const backedUpCard: Flashcard = {
      ...cards[0],
      mastered: false,
      learning: {
        version: 1,
        dueAt: "2026-10-01T10:00:00.000Z",
        intervalDays: 12,
        easeFactor: 2.5,
        repetitions: 3,
        lapses: 1,
        lastReviewedAt: "2026-09-20T10:00:00.000Z",
        lastRating: "good",
        stats: {
          reviews: 4,
          correct: 3,
          errors: 1,
          uncertain: 0,
          currentStreak: 2,
          longestStreak: 2,
        },
      },
    };
    const collection = createCollectionDocument([backedUpCard], "Sicherung");
    const result = mergeCollection([{ ...cards[0], learning: undefined }], collection);

    expect(result).toMatchObject({ imported: 0, updated: 1, skipped: 0 });
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].learning).toEqual(backedUpCard.learning);
  });

  it("round-trips portable learning progress without exporting its source", () => {
    const cardWithProgress: Flashcard = {
      ...cards[0],
      learning: {
        version: 1,
        dueAt: "2026-02-15T12:00:00.000Z",
        intervalDays: 12.5,
        easeFactor: 2.65,
        repetitions: 4,
        lapses: 1,
        lastReviewedAt: "2026-02-03T12:00:00.000Z",
        lastRating: "good",
        stats: {
          reviews: 7,
          correct: 6,
          errors: 1,
          uncertain: 2,
          currentStreak: 3,
          longestStreak: 4,
        },
      },
    };

    const parsed = parseCollection(serializeCollection([cardWithProgress], "Lernstand"));

    expect(parsed.version).toBe(1);
    expect(parsed.cards[0].learning).toEqual(cardWithProgress.learning);
    expect(parsed.cards[0]).not.toHaveProperty("source");
    expect(JSON.stringify(parsed)).not.toContain("C:/Wissen");
  });

  it("keeps old version 1 collections without learning progress compatible", () => {
    const parsed = parseCollection(
      JSON.stringify({
        format: "fokusdeck.collection",
        version: 1,
        name: "Alte Sammlung",
        exportedAt: "2026-01-01T00:00:00.000Z",
        cards: [
          {
            id: "legacy",
            front: "Alte Frage",
            back: "Alte Antwort",
            deck: "Archiv",
            mastered: false,
            createdAt: "2025-12-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0]).not.toHaveProperty("learning");
    expect(mergeCollection([], parsed).cards[0]).toMatchObject({
      id: "legacy",
      front: "Alte Frage",
      mastered: false,
    });
  });

  it("repairs invalid imported learning values defensively", () => {
    const parsed = parseCollection(
      JSON.stringify({
        format: "fokusdeck.collection",
        version: 1,
        cards: [
          {
            id: "repaired",
            front: "Frage",
            back: "Antwort",
            deck: "Test",
            mastered: true,
            createdAt: "2026-04-01T10:00:00.000Z",
            learning: {
              version: 99,
              dueAt: "kein Datum",
              intervalDays: -4,
              easeFactor: 99,
              repetitions: -3,
              lapses: 2.8,
              lastReviewedAt: "unbekannt",
              lastRating: "perfekt",
              stats: {
                reviews: 2.8,
                correct: 20,
                errors: -1,
                uncertain: "drei",
                currentStreak: 9,
                longestStreak: -5,
              },
            },
          },
        ],
      }),
    );

    expect(parsed.cards[0].learning).toEqual({
      version: 1,
      dueAt: "2026-04-01T10:00:00.000Z",
      intervalDays: 0,
      easeFactor: 4,
      repetitions: 0,
      lapses: 2,
      lastReviewedAt: null,
      lastRating: null,
      stats: {
        reviews: 2,
        correct: 2,
        errors: 0,
        uncertain: 0,
        currentStreak: 2,
        longestStreak: 2,
      },
    });
  });
});
