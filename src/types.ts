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
}

export type AppView = "dashboard" | "cards";
