import type { Flashcard } from "../../types";
import {
  LEARNING_PROGRESS_VERSION,
  type DateInput,
  type LearningCard,
  type LearningProgress,
  type LearningSummary,
  type ReviewRating,
  type ReviewStats,
} from "./model";
import { DAY_IN_MS, isValidDateString, toIsoTimestamp, toTimestamp } from "./time";

const MINIMUM_EASE = 1.3;
const MAXIMUM_EASE = 4;
const MAXIMUM_INTERVAL_DAYS = 36_500;
const AGAIN_INTERVAL_DAYS = 10 / (24 * 60);

const RATINGS: ReadonlySet<ReviewRating> = new Set([
  "again",
  "hard",
  "good",
  "easy",
]);

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegativeInteger(value: unknown, fallback = 0) {
  return Math.max(0, Math.floor(finiteNumber(value, fallback)));
}

function roundInterval(value: number) {
  const finiteValue = Number.isFinite(value) ? value : MAXIMUM_INTERVAL_DAYS;
  return (
    Math.round(clamp(finiteValue, 0, MAXIMUM_INTERVAL_DAYS) * 1_000_000) /
    1_000_000
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeStats(value: unknown): ReviewStats {
  const stats = asObject(value);
  const reviews = nonNegativeInteger(stats.reviews);
  const correct = Math.min(reviews, nonNegativeInteger(stats.correct));
  const currentStreak = Math.min(correct, nonNegativeInteger(stats.currentStreak));

  return {
    reviews,
    correct,
    errors: Math.min(reviews, nonNegativeInteger(stats.errors)),
    uncertain: Math.min(reviews, nonNegativeInteger(stats.uncertain)),
    currentStreak,
    longestStreak: Math.max(currentStreak, nonNegativeInteger(stats.longestStreak)),
  };
}

export function createLearningProgress(dueAt: DateInput): LearningProgress {
  return {
    version: LEARNING_PROGRESS_VERSION,
    dueAt: toIsoTimestamp(dueAt, "Fälligkeit"),
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
  };
}

export function normalizeLearningProgress(
  value: unknown,
  fallbackDueAt: DateInput,
): LearningProgress {
  const progress = asObject(value);
  const fallback = createLearningProgress(fallbackDueAt);
  const lastRating = RATINGS.has(progress.lastRating as ReviewRating)
    ? (progress.lastRating as ReviewRating)
    : null;

  return {
    version: LEARNING_PROGRESS_VERSION,
    dueAt: isValidDateString(progress.dueAt) ? progress.dueAt : fallback.dueAt,
    intervalDays: roundInterval(finiteNumber(progress.intervalDays, 0)),
    easeFactor: clamp(finiteNumber(progress.easeFactor, 2.5), MINIMUM_EASE, MAXIMUM_EASE),
    repetitions: nonNegativeInteger(progress.repetitions),
    lapses: nonNegativeInteger(progress.lapses),
    lastReviewedAt: isValidDateString(progress.lastReviewedAt)
      ? progress.lastReviewedAt
      : null,
    lastRating,
    stats: normalizeStats(progress.stats),
  };
}

function progressFromCard(card: Flashcard) {
  return (card as Flashcard & { learning?: unknown }).learning;
}

export function normalizeLearningCard<T extends Flashcard>(
  card: T,
  now: DateInput,
): LearningCard<T> {
  const timestamp = toTimestamp(now);
  const storedProgress = progressFromCard(card);
  const learning = normalizeLearningProgress(storedProgress, timestamp);
  if ((storedProgress === undefined || storedProgress === null) && card.mastered) {
    learning.dueAt = new Date(timestamp + 3 * DAY_IN_MS).toISOString();
    learning.intervalDays = 3;
    learning.repetitions = 1;
    learning.stats = {
      reviews: 1,
      correct: 1,
      errors: 0,
      uncertain: 0,
      currentStreak: 1,
      longestStreak: 1,
    };
  }
  return {
    ...card,
    learning,
  } as LearningCard<T>;
}

export function normalizeLearningCards<T extends Flashcard>(
  cards: readonly T[],
  now: DateInput,
): LearningCard<T>[] {
  return cards.map((card) => normalizeLearningCard(card, now));
}

function nextInterval(progress: LearningProgress, rating: ReviewRating) {
  switch (rating) {
    case "again":
      return AGAIN_INTERVAL_DAYS;
    case "hard":
      return progress.repetitions === 0
        ? 0.5
        : Math.max(1, progress.intervalDays * 1.2);
    case "good":
      if (progress.repetitions === 0) return 1;
      if (progress.repetitions === 1) return 3;
      return Math.max(1, progress.intervalDays * progress.easeFactor);
    case "easy":
      return progress.repetitions === 0
        ? 4
        : Math.max(4, progress.intervalDays * progress.easeFactor * 1.3);
  }
}

function nextEase(easeFactor: number, rating: ReviewRating) {
  const adjustment =
    rating === "again" ? -0.2 : rating === "hard" ? -0.15 : rating === "easy" ? 0.15 : 0;
  return Math.round(clamp(easeFactor + adjustment, MINIMUM_EASE, MAXIMUM_EASE) * 100) / 100;
}

export function reviewProgress(
  value: unknown,
  rating: ReviewRating,
  reviewedAt: DateInput,
): LearningProgress {
  if (!RATINGS.has(rating)) {
    throw new Error("Die Lernbewertung ist ungültig.");
  }

  const reviewTimestamp = toTimestamp(reviewedAt, "Lernzeitpunkt");
  const progress = normalizeLearningProgress(value, reviewTimestamp);
  const exactIntervalDays = clamp(
    nextInterval(progress, rating),
    0,
    MAXIMUM_INTERVAL_DAYS,
  );
  const intervalDays = roundInterval(exactIntervalDays);
  const wasCorrect = rating !== "again";
  const currentStreak = wasCorrect ? progress.stats.currentStreak + 1 : 0;

  return {
    version: LEARNING_PROGRESS_VERSION,
    dueAt: new Date(reviewTimestamp + Math.round(exactIntervalDays * DAY_IN_MS)).toISOString(),
    intervalDays,
    easeFactor: nextEase(progress.easeFactor, rating),
    repetitions: rating === "again" ? 0 : progress.repetitions + 1,
    lapses: progress.lapses + (rating === "again" ? 1 : 0),
    lastReviewedAt: new Date(reviewTimestamp).toISOString(),
    lastRating: rating,
    stats: {
      reviews: progress.stats.reviews + 1,
      correct: progress.stats.correct + (wasCorrect ? 1 : 0),
      errors: progress.stats.errors + (rating === "again" ? 1 : 0),
      uncertain: progress.stats.uncertain + (rating === "hard" ? 1 : 0),
      currentStreak,
      longestStreak: Math.max(progress.stats.longestStreak, currentStreak),
    },
  };
}

export function reviewLearningCard<T extends Flashcard>(
  card: T,
  rating: ReviewRating,
  reviewedAt: DateInput,
): LearningCard<T> {
  return {
    ...card,
    mastered: rating === "good" || rating === "easy",
    learning: reviewProgress(progressFromCard(card), rating, reviewedAt),
  } as LearningCard<T>;
}

export function isDue(value: unknown, now: DateInput) {
  const nowTimestamp = toTimestamp(now);
  return toTimestamp(normalizeLearningProgress(value, nowTimestamp).dueAt) <= nowTimestamp;
}

export function dueLearningCards<T extends Flashcard>(
  cards: readonly T[],
  now: DateInput,
): LearningCard<T>[] {
  const timestamp = toTimestamp(now);
  return normalizeLearningCards(cards, timestamp).filter(
    (card) => toTimestamp(card.learning.dueAt) <= timestamp,
  );
}

export function errorLearningCards<T extends Flashcard>(
  cards: readonly T[],
  now: DateInput,
): LearningCard<T>[] {
  return normalizeLearningCards(cards, now).filter(
    (card) => card.learning.lastRating === "again" || card.learning.lastRating === "hard",
  );
}

export function isMatureProgress(value: unknown, now: DateInput) {
  const progress = normalizeLearningProgress(value, now);
  return progress.repetitions >= 3 && progress.intervalDays >= 21;
}

export function summarizeLearning<T extends Flashcard>(
  cards: readonly T[],
  now: DateInput,
): LearningSummary {
  const normalized = normalizeLearningCards(cards, now);
  const nowTimestamp = toTimestamp(now);
  const summary = normalized.reduce(
    (result, card) => {
      const { stats } = card.learning;
      result.reviews += stats.reviews;
      result.correct += stats.correct;
      result.errors += stats.errors;
      result.uncertain += stats.uncertain;
      if (stats.reviews === 0) result.newCards += 1;
      if (toTimestamp(card.learning.dueAt) <= nowTimestamp) result.dueNow += 1;
      if (isMatureProgress(card.learning, nowTimestamp)) result.matureCards += 1;
      return result;
    },
    {
      cards: normalized.length,
      dueNow: 0,
      scheduled: 0,
      newCards: 0,
      matureCards: 0,
      reviews: 0,
      correct: 0,
      errors: 0,
      uncertain: 0,
      accuracyPercent: 0,
    } satisfies LearningSummary,
  );

  summary.scheduled = summary.cards - summary.dueNow;
  summary.accuracyPercent = summary.reviews
    ? Math.round((summary.correct / summary.reviews) * 1_000) / 10
    : 0;
  return summary;
}
