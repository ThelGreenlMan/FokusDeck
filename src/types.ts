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

export type AppView = "dashboard" | "cards" | "settings";
