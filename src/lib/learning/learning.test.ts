import { describe, expect, it } from "vitest";
import type { Flashcard } from "../../types";
import {
  canAdvanceFeynman,
  canAdvanceFreeRecall,
  canAdvanceSq3r,
  createFeynmanSession,
  createFreeRecallSession,
  createSq3rSession,
  dueLearningCards,
  errorLearningCards,
  interleaveDecks,
  normalizeLearningCard,
  normalizeLearningProgress,
  reduceFeynmanSession,
  reduceFreeRecallSession,
  reduceSq3rSession,
  reviewLearningCard,
  reviewProgress,
  scoreExam,
  summarizeLearning,
} from ".";

const NOW = "2026-09-02T10:00:00.000Z";

function flashcard(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: "card-1",
    front: "Frage",
    back: "Antwort",
    deck: "Biologie",
    mastered: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("learning schedule", () => {
  it("normalizes a legacy card without changing the original card", () => {
    const legacy = flashcard();
    const normalized = normalizeLearningCard(legacy, NOW);

    expect(normalized).not.toBe(legacy);
    expect(legacy).not.toHaveProperty("learning");
    expect(normalized.learning).toEqual({
      version: 1,
      dueAt: NOW,
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lapses: 0,
      lastReviewedAt: null,
      lastRating: null,
      stats: {
        reviews: 0,
        correct: 0,
        errors: 0,
        uncertain: 0,
        currentStreak: 0,
        longestStreak: 0,
      },
    });
  });

  it("keeps a legacy mastered card scheduled instead of treating it as new", () => {
    const normalized = normalizeLearningCard(flashcard({ mastered: true }), NOW);

    expect(normalized.learning).toMatchObject({
      dueAt: "2026-09-05T10:00:00.000Z",
      intervalDays: 3,
      repetitions: 1,
      stats: { reviews: 1, correct: 1 },
    });
  });

  it("repairs incomplete or invalid persisted progress deterministically", () => {
    const progress = normalizeLearningProgress(
      {
        version: 99,
        dueAt: "not-a-date",
        intervalDays: -3,
        easeFactor: 99,
        repetitions: 2.9,
        stats: { reviews: 2, correct: 8, errors: -1 },
      },
      NOW,
    );

    expect(progress.version).toBe(1);
    expect(progress.dueAt).toBe(NOW);
    expect(progress.intervalDays).toBe(0);
    expect(progress.easeFactor).toBe(4);
    expect(progress.repetitions).toBe(2);
    expect(progress.stats).toMatchObject({ reviews: 2, correct: 2, errors: 0 });
  });

  it("caps extreme imported intervals before the next review calculation", () => {
    const progress = normalizeLearningProgress(
      { intervalDays: Number.MAX_VALUE, easeFactor: 4, repetitions: 3 },
      NOW,
    );
    const reviewed = reviewProgress(progress, "easy", NOW);

    expect(progress.intervalDays).toBe(36_500);
    expect(reviewed.intervalDays).toBe(36_500);
    expect(reviewed.dueAt).toBe("2126-08-09T10:00:00.000Z");
    expect(Number.isFinite(new Date(reviewed.dueAt).getTime())).toBe(true);
  });

  it.each([
    ["again", "2026-09-02T10:10:00.000Z", 0.006944],
    ["hard", "2026-09-02T22:00:00.000Z", 0.5],
    ["good", "2026-09-03T10:00:00.000Z", 1],
    ["easy", "2026-09-06T10:00:00.000Z", 4],
  ] as const)("gives a new card a fixed %s interval", (rating, expectedDueAt, intervalDays) => {
    const reviewed = reviewLearningCard(flashcard(), rating, NOW);

    expect(reviewed.learning.dueAt).toBe(expectedDueAt);
    expect(reviewed.learning.intervalDays).toBe(intervalDays);
    expect(reviewed.learning.lastRating).toBe(rating);
    expect(reviewed.mastered).toBe(rating === "good" || rating === "easy");
  });

  it("increases good intervals without random scheduling jitter", () => {
    const first = reviewProgress(undefined, "good", "2026-09-01T10:00:00.000Z");
    const second = reviewProgress(first, "good", first.dueAt);
    const third = reviewProgress(second, "good", second.dueAt);

    expect([first.intervalDays, second.intervalDays, third.intervalDays]).toEqual([1, 3, 7.5]);
    expect(third.dueAt).toBe("2026-09-12T22:00:00.000Z");
    expect(reviewProgress(second, "good", second.dueAt)).toEqual(third);
  });

  it("records errors, uncertainty and streaks separately", () => {
    const good = reviewProgress(undefined, "good", NOW);
    const hard = reviewProgress(good, "hard", good.dueAt);
    const again = reviewProgress(hard, "again", hard.dueAt);

    expect(hard.stats).toEqual({
      reviews: 2,
      correct: 2,
      errors: 0,
      uncertain: 1,
      currentStreak: 2,
      longestStreak: 2,
    });
    expect(again.stats).toEqual({
      reviews: 3,
      correct: 2,
      errors: 1,
      uncertain: 1,
      currentStreak: 0,
      longestStreak: 2,
    });
    expect(again.lapses).toBe(1);
    expect(again.repetitions).toBe(0);
  });

  it("keeps only unresolved again and hard cards in the error collection", () => {
    const failed = reviewLearningCard(flashcard({ id: "failed" }), "again", NOW);
    const uncertain = reviewLearningCard(flashcard({ id: "uncertain" }), "hard", NOW);
    const resolved = reviewLearningCard(failed, "good", failed.learning.dueAt);
    const resolvedUncertainty = reviewLearningCard(
      uncertain,
      "easy",
      uncertain.learning.dueAt,
    );

    expect(failed.mastered).toBe(false);
    expect(uncertain.mastered).toBe(false);
    expect(resolved.mastered).toBe(true);
    expect(errorLearningCards([failed, uncertain], NOW).map((card) => card.id)).toEqual([
      "failed",
      "uncertain",
    ]);
    expect(errorLearningCards([resolved, resolvedUncertainty], NOW)).toEqual([]);
  });

  it("selects due cards and summarizes the learning state", () => {
    const legacy = flashcard({ id: "legacy" });
    const reviewed = reviewLearningCard(flashcard({ id: "reviewed" }), "good", NOW);
    const summary = summarizeLearning([legacy, reviewed], NOW);

    expect(dueLearningCards([legacy, reviewed], NOW).map((card) => card.id)).toEqual([
      "legacy",
    ]);
    expect(summary).toMatchObject({
      cards: 2,
      dueNow: 1,
      scheduled: 1,
      newCards: 1,
      reviews: 1,
      correct: 1,
      errors: 0,
      uncertain: 0,
      accuracyPercent: 100,
    });
  });
});

describe("interleaving and exam mode", () => {
  it("interleaves decks reproducibly and keeps each round mixed", () => {
    const cards = [
      { id: "bio-1", deck: "Biologie" },
      { id: "math-1", deck: "Mathematik" },
      { id: "history-1", deck: "Geschichte" },
      { id: "bio-2", deck: "Biologie" },
      { id: "math-2", deck: "Mathematik" },
      { id: "history-2", deck: "Geschichte" },
    ];
    const first = interleaveDecks(cards, "session-2026");
    const second = interleaveDecks([...cards].reverse(), "session-2026");

    expect(first.map((card) => card.id)).toEqual(second.map((card) => card.id));
    expect(new Set(first.slice(0, 3).map((card) => card.deck)).size).toBe(3);
    expect(new Set(first.slice(3, 6).map((card) => card.deck)).size).toBe(3);
    expect(interleaveDecks(cards, "session-2026", 2)).toEqual(first.slice(0, 2));
  });

  it("scores weighted exam answers including partial credit", () => {
    const result = scoreExam(
      [
        { cardId: "one", judgement: "correct", maxPoints: 2 },
        { cardId: "two", judgement: "partial", maxPoints: 2 },
        { cardId: "three", judgement: "incorrect" },
        { cardId: "four", judgement: "unanswered" },
      ],
      { passingPercentage: 50 },
    );

    expect(result).toEqual({
      answers: 4,
      correct: 1,
      partial: 1,
      incorrect: 1,
      unanswered: 1,
      earnedPoints: 3,
      maximumPoints: 6,
      percentage: 50,
      passed: true,
      performance: "needs-practice",
    });
  });

  it("rejects ambiguous duplicate exam answers", () => {
    expect(() =>
      scoreExam([
        { cardId: "same", judgement: "correct" },
        { cardId: "same", judgement: "incorrect" },
      ]),
    ).toThrow("eindeutige Karten-ID");
  });
});

describe("structured learning method sessions", () => {
  it("guides a Feynman session through explanation, gaps and simplification", () => {
    let session = createFeynmanSession(" Zellteilung ", NOW);
    expect(canAdvanceFeynman(session)).toBe(false);
    expect(reduceFeynmanSession(session, { type: "next" }, NOW)).toBe(session);

    session = reduceFeynmanSession(
      session,
      { type: "set-explanation", value: "Eine Zelle teilt sich." },
      NOW,
    );
    session = reduceFeynmanSession(session, { type: "next" }, NOW);
    session = reduceFeynmanSession(
      session,
      { type: "set-gaps", values: ["Mitose", "", "Mitose", "Chromosomen"] },
      NOW,
    );
    expect(session.gaps).toEqual(["Mitose", "Chromosomen"]);

    session = reduceFeynmanSession(session, { type: "next" }, NOW);
    session = reduceFeynmanSession(
      session,
      { type: "set-simplified-explanation", value: "Eine Zelle wird zu zwei Zellen." },
      NOW,
    );
    session = reduceFeynmanSession(session, { type: "next" }, NOW);
    expect(session.phase).toBe("complete");
  });

  it("keeps recall hidden from the reference until comparison", () => {
    let session = createFreeRecallSession("Photosynthese", NOW);
    expect(canAdvanceFreeRecall(session)).toBe(false);
    session = reduceFreeRecallSession(
      session,
      { type: "set-recall", value: "Pflanzen erzeugen Zucker." },
      NOW,
    );
    session = reduceFreeRecallSession(session, { type: "next" }, NOW);
    expect(session.phase).toBe("compare");

    session = reduceFreeRecallSession(
      session,
      { type: "set-reference", value: "Licht, Wasser und CO2 werden benötigt." },
      NOW,
    );
    session = reduceFreeRecallSession(
      session,
      { type: "set-comparison", remembered: ["Zucker"], missing: ["Licht", "CO2"] },
      NOW,
    );
    session = reduceFreeRecallSession(session, { type: "next" }, NOW);
    expect(session.phase).toBe("complete");
    expect(session.missingPoints).toEqual(["Licht", "CO2"]);
  });

  it("requires content for every SQ3R stage", () => {
    let session = createSq3rSession("Kapitel 1", NOW);
    expect(canAdvanceSq3r(session)).toBe(false);

    const actions = [
      { type: "set-survey", value: "Überschriften angesehen" },
      { type: "next" },
      { type: "set-questions", values: ["Was ist der Kernpunkt?"] },
      { type: "next" },
      { type: "set-reading-notes", value: "Wichtige Details" },
      { type: "next" },
      { type: "set-recitation", value: "Aus dem Gedächtnis erklärt" },
      { type: "next" },
      { type: "set-review-notes", value: "Frage beantwortet" },
      { type: "next" },
    ] as const;

    for (const action of actions) {
      session = reduceSq3rSession(session, action, NOW);
    }
    expect(session.stage).toBe("complete");
  });
});
