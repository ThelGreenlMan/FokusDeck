export type TimerMode = "focus" | "break";

export interface TimerSettings {
  focusMinutes: number;
  breakMinutes: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  deck: string;
  mastered: boolean;
  createdAt: string;
  /** Persistierter Wiederholplan. Fehlt bei älteren Karten und wird dann migriert. */
  learning?: import("./lib/learning/model").LearningProgress;
  source?: ObsidianSource;
}

export interface ObsidianSource {
  type: "obsidian";
  vaultName: string;
  vaultPath: string;
  relativePath: string;
  modifiedAt: number;
}

export interface ObsidianConnection {
  vaultName: string;
  vaultPath: string;
  lastSyncAt: number;
  scannedMarkdownFiles: number;
  importedCards: number;
}

export type AppView = "learning" | "dashboard" | "cards" | "settings";
