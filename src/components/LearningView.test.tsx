// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import type { Flashcard } from "../types";
import { LearningView } from "./LearningView";

const cards: Flashcard[] = [
  { id: "one", front: "Meine Frage", back: "Meine Antwort", deck: "Mein Stapel", mastered: false, createdAt: "2026-01-01T00:00:00.000Z" },
];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  setLanguage("de", { persist: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setLanguage("de", { persist: false });
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("LearningView language switching", () => {
  it("translates the plan and singular card count without changing user deck names", () => {
    const onCardsChange = vi.fn();
    act(() => root.render(<LearningView cards={cards} notes={[]} hasObsidian={false} isVisible onCardsChange={onCardsChange} onOpenCards={vi.fn()} onOpenSettings={vi.fn()} />));

    act(() => setLanguage("en", { persist: false }));

    expect(container.querySelector("h1")?.textContent).toBe("Your study plan for today");
    expect(container.querySelector("#daily-plan-heading")?.textContent).toBe("1 card is waiting for you");
    expect(container.querySelector(".learning-plan-settings")?.textContent).toContain("Mein Stapel");
    expect(container.querySelector(".learning-plan-settings")?.textContent).toContain("Answer mode");
    expect(onCardsChange).not.toHaveBeenCalled();
  });

  it("keeps the active saved round, typed answer and revealed state on language changes", () => {
    const session = {
      id: "saved-round", title: "Heutige Runde", queueIds: ["one"], position: 0,
      answerMode: "typed", answers: { one: "Mein Entwurf" }, ratings: {},
      counts: { again: 0, hard: 0, good: 0, easy: 0 }, requeuedIds: [],
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    localStorage.setItem("fokusdeck:daily-session-v1", JSON.stringify(session));
    const onCardsChange = vi.fn();
    act(() => root.render(<LearningView cards={cards} notes={[]} hasObsidian={false} isVisible onCardsChange={onCardsChange} onOpenCards={vi.fn()} onOpenSettings={vi.fn()} />));
    act(() => container.querySelector<HTMLButtonElement>(".learning-resume button")!.click());
    const answer = container.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(answer.value).toBe("Mein Entwurf");
    act(() => container.querySelector<HTMLButtonElement>(".learning-reveal-button")!.click());
    const sessionElement = container.querySelector(".learning-session");
    const storedBeforeSwitch = localStorage.getItem("fokusdeck:daily-session-v1");

    act(() => setLanguage("en", { persist: false }));

    expect(container.querySelector(".learning-session")).toBe(sessionElement);
    expect(container.querySelector("textarea")).toBe(answer);
    expect(answer.value).toBe("Mein Entwurf");
    expect(answer.disabled).toBe(true);
    expect(container.querySelector("#study-question")?.textContent).toBe("Meine Frage");
    expect(container.querySelector(".learning-reveal-button")).toBeNull();
    expect(container.querySelector(".learning-ratings")).not.toBeNull();
    expect(localStorage.getItem("fokusdeck:daily-session-v1")).toBe(storedBeforeSwitch);
    expect(onCardsChange).not.toHaveBeenCalled();
  });
});
