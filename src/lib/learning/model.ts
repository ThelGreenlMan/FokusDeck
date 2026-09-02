import type { Flashcard } from "../../types";

export const LEARNING_PROGRESS_VERSION = 1 as const;

export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface ReviewStats {
  reviews: number;
  correct: number;
  errors: number;
  uncertain: number;
  currentStreak: number;
  longestStreak: number;
}

export interface LearningProgress {
  version: typeof LEARNING_PROGRESS_VERSION;
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: string | null;
  lastRating: ReviewRating | null;
  stats: ReviewStats;
}

export type LearningCard<T extends Flashcard = Flashcard> = Omit<T, "learning"> & {
  learning: LearningProgress;
};

export interface LearningSummary {
  cards: number;
  dueNow: number;
  scheduled: number;
  newCards: number;
  matureCards: number;
  reviews: number;
  correct: number;
  errors: number;
  uncertain: number;
  accuracyPercent: number;
}

export type DateInput = Date | string | number;
