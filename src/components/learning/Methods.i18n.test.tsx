// @vitest-environment jsdom

import { act, StrictMode, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import type { Flashcard } from "../../types";
import { CardStudySession, displaySessionTitle, type DailySessionSnapshot } from "./CardStudySession";
import { ExamMode } from "./ExamMode";
import { FeynmanMode } from "./FeynmanMode";
import { FreeRecallMode } from "./FreeRecallMode";
import { Sq3rMode, type Sq3rEntry } from "./Sq3rMode";

const roots = new Set<Root>();
const cards: Flashcard[] = [
  { id: "one", front: "Unveränderte Frage eins", back: "Unveränderte Antwort eins", deck: "Mein deutscher Stapel", mastered: false, createdAt: "2026-09-01T10:00:00.000Z" },
  { id: "two", front: "Unveränderte Frage zwei", back: "Unveränderte Antwort zwei", deck: "Mein deutscher Stapel", mastered: false, createdAt: "2026-09-01T10:00:00.000Z" },
];

function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  act(() => root.render(<StrictMode>{node}</StrictMode>));
  return container;
}

function button(container: Element, label: string) {
  const element = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!element) throw new Error(`Button not found: ${label}`);
  return element;
}

function click(container: Element, label: string) {
  act(() => button(container, label).click());
}

function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function switchLanguage(language: "de" | "en") {
  act(() => { setLanguage(language, { persist: false }); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  setLanguage("de", { persist: false });
});

afterEach(() => {
  act(() => { for (const root of roots) root.unmount(); });
  roots.clear();
  document.body.replaceChildren();
  setLanguage("de", { persist: false });
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("learning methods live language changes", () => {
  it("keeps a typed card answer and revealed state without changing the saved session", () => {
    const saved: DailySessionSnapshot = {
      id: "daily", title: "Heutige Runde", queueIds: ["one", "two"], position: 0,
      answerMode: "typed", answers: {}, ratings: {},
      counts: { again: 0, hard: 0, good: 0, easy: 0 }, requeuedIds: [],
      startedAt: "2026-09-01T10:00:00.000Z",
    };
    const onSave = vi.fn();
    function Session() {
      const [session, setSession] = useState<DailySessionSnapshot | null>(saved);
      return session && <CardStudySession cards={cards} session={session}
        onSessionChange={(value) => { onSave(value); setSession(value); }}
        onRateCard={vi.fn()} onClose={vi.fn()} />;
    }
    const container = mount(<Session />);
    const answer = container.querySelector<HTMLTextAreaElement>("textarea")!;
    input(answer, "Meine unveränderte Antwort");
    click(container, "Antwort aufdecken");
    const before = JSON.stringify(onSave.mock.lastCall);
    const writes = onSave.mock.calls.length;

    switchLanguage("en");

    expect(container.textContent).toContain("Today's round");
    expect(container.textContent).toContain("How well could you recall the answer?");
    expect(container.textContent).toContain(cards[0].front);
    expect(container.textContent).toContain(cards[0].deck);
    expect(container.querySelector("textarea")).toBe(answer);
    expect(answer.value).toBe("Meine unveränderte Antwort");
    expect(answer.disabled).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(writes);
    expect(JSON.stringify(onSave.mock.lastCall)).toBe(before);
    expect(container.querySelector("progress")?.getAttribute("aria-label"))
      .toBe("0 percent of the round complete");
  });

  it("translates only known session titles, never custom saved titles", () => {
    switchLanguage("en");
    expect(displaySessionTitle("Fehler wiederholen")).toBe("Review mistakes");
    expect(displaySessionTitle("Meine Prüfungsvorbereitung")).toBe("Meine Prüfungsvorbereitung");
    expect(displaySessionTitle("__proto__")).toBe("__proto__");
    switchLanguage("de");
    expect(displaySessionTitle("Today's round")).toBe("Heutige Runde");
  });

  it("keeps an exam's question, written answer and remaining time, then translates results", () => {
    const onSave = vi.fn();
    const onRateCard = vi.fn();
    const container = mount(<ExamMode cards={cards} isVisible onSave={onSave}
      onRateCard={onRateCard} onClose={vi.fn()} />);
    click(container, "Prüfung starten");
    input(container.querySelector<HTMLTextAreaElement>("textarea")!, "Erste Antwort bleibt");
    click(container, "Lösung aufdecken");
    act(() => container.querySelector<HTMLButtonElement>(".learning-rating--good")!.click());
    const answer = container.querySelector<HTMLTextAreaElement>("textarea")!;
    input(answer, "Zweite Antwort bleibt");
    act(() => { vi.advanceTimersByTime(2_000); });
    const question = container.querySelector(".learning-question-card h3")!.textContent;
    const remaining = container.querySelector("time")!.textContent;

    switchLanguage("en");

    expect(container.querySelector("h1")?.textContent).toBe("Question 2 of 2");
    expect(container.querySelector(".learning-question-card h3")?.textContent).toBe(question);
    expect(container.querySelector("textarea")).toBe(answer);
    expect(answer.value).toBe("Zweite Antwort bleibt");
    expect(container.querySelector("time")?.textContent).toBe(remaining);
    expect(onSave).not.toHaveBeenCalled();
    expect(onRateCard).not.toHaveBeenCalled();
    click(container, "Reveal solution");
    act(() => container.querySelector<HTMLButtonElement>(".learning-rating--hard")!.click());
    expect(container.textContent).toContain("Exam complete");
    expect(container.textContent).toContain("Partly correct");
    expect(container.textContent).toContain("The exam result has been saved.");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].answers.map((entry: { givenAnswer: string }) => entry.givenAnswer))
      .toEqual(["Erste Antwort bleibt", "Zweite Antwort bleibt"]);
    switchLanguage("de");
    expect(container.textContent).toContain("Prüfung abgeschlossen");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("keeps Feynman input and retranslates an already displayed success status", () => {
    const onSave = vi.fn();
    const container = mount(<FeynmanMode decks={[cards[0].deck]} onSave={onSave}
      onCreateCard={vi.fn()} onClose={vi.fn()} />);
    input(container.querySelector<HTMLInputElement>('input[type="text"]')!, "Mein Thema");
    const fields = container.querySelectorAll<HTMLTextAreaElement>("textarea");
    input(fields[0], "Meine erste Erklärung");
    input(fields[3], "Meine einfache Erklärung");
    click(container, "Eintrag speichern");
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain("Dein Feynman-Eintrag wurde gespeichert.");
    const payload = JSON.stringify(onSave.mock.lastCall);

    switchLanguage("en");

    expect(container.textContent).toContain("Explain it in your own words");
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain("Your Feynman entry has been saved.");
    expect(container.querySelectorAll("textarea")[0]).toBe(fields[0]);
    expect(fields[0].value).toBe("Meine erste Erklärung");
    expect(fields[3].value).toBe("Meine einfache Erklärung");
    expect(container.querySelector("select")?.value).toBe(cards[0].deck);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onSave.mock.lastCall)).toBe(payload);
  });

  it.each([
    { decks: [], label: "General" },
    { decks: ["Allgemein"], label: "Allgemein" },
  ])("localizes only Feynman's generated default deck ($label), preserving saved deck identity", ({ decks, label }) => {
    const onSave = vi.fn();
    const onCreateCard = vi.fn();
    const container = mount(<FeynmanMode decks={decks} onSave={onSave}
      onCreateCard={onCreateCard} onClose={vi.fn()} />);
    const select = container.querySelector("select")!;
    switchLanguage("en");
    expect(select.selectedOptions[0].textContent).toBe(label);
    expect(select.value).toBe("Allgemein");
    expect(onSave).not.toHaveBeenCalled();
    input(container.querySelector<HTMLInputElement>('input[type="text"]')!, "Mein Thema");
    container.querySelectorAll("textarea").forEach((field, index) => input(field, `Mein Text ${index}`));
    click(container, "Create a card from the knowledge gap");
    expect(onCreateCard.mock.calls[0][0].deck).toBe("Allgemein");
    expect(onSave.mock.calls[0][0].deck).toBe("Allgemein");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(`“${label}”`);
    switchLanguage("de");
    expect(select.selectedOptions[0].textContent).toBe("Allgemein");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it.each([
    { deck: "", label: "No deck" },
    { deck: "Ohne Stapel", label: "Ohne Stapel" },
  ])("localizes only the exam's empty-deck fallback ($label) and uses singular card counts", ({ deck, label }) => {
    const onSave = vi.fn();
    const container = mount(<ExamMode cards={[{ ...cards[0], deck }]} isVisible
      onSave={onSave} onRateCard={vi.fn()} onClose={vi.fn()} />);
    expect(container.textContent).toContain("1 Karte in der aktuellen Auswahl verfügbar");
    switchLanguage("en");
    expect(container.querySelector(".learning-check-option span")?.textContent).toBe(label);
    expect(container.textContent).toContain("1 card available in the current selection");
    expect(container.textContent).not.toContain("1 cards available");
    click(container, "Start exam");
    input(container.querySelector<HTMLTextAreaElement>("textarea")!, "Meine Antwort");
    click(container, "Reveal solution");
    act(() => container.querySelector<HTMLButtonElement>(".learning-rating--good")!.click());
    expect(onSave.mock.calls[0][0].selectedDecks).toEqual(["Ohne Stapel"]);
    expect(onSave.mock.calls[0][0].answers[0].deck).toBe(deck);
  });

  it.each([
    { deck: "", label: "No deck" },
    { deck: "Ohne Stapel", label: "Ohne Stapel" },
  ])("localizes only free recall's empty-deck fallback ($label), never its saved source", ({ deck, label }) => {
    const onSave = vi.fn();
    const container = mount(<FreeRecallMode cards={[{ ...cards[0], deck }]} notes={[]} isVisible
      onSave={onSave} onRateCard={vi.fn()} onClose={vi.fn()} />);
    const select = container.querySelector("select")!;
    switchLanguage("en");
    expect(select.selectedOptions[0].textContent).toBe(label);
    expect(select.value).toBe("deck:Ohne Stapel");
    click(container, "Start recall");
    input(container.querySelector<HTMLTextAreaElement>("textarea")!, "Meine Erinnerungen");
    click(container, "Finish recall");
    expect(container.textContent).toContain(`the “${label}” deck`);
    expect(container.textContent).toContain("Rated cards: 0 of 1");
    act(() => container.querySelector<HTMLButtonElement>(".learning-rating-good")!.click());
    expect(container.textContent).toContain("Rated cards: 1 of 1");
    switchLanguage("de");
    expect(container.textContent).toContain("Bewertete Karten: 1 von 1");
    click(container, "Ergebnis speichern");
    expect(onSave.mock.calls[0][0].source).toEqual({ type: "deck", deck: "Ohne Stapel" });
  });

  it("keeps free recall text and countdown while the source remains hidden", () => {
    const onSave = vi.fn();
    const note = { relativePath: "Wissen/Quelle.md", content: "Geheimer unveränderter Quelltext", modifiedAt: 10 };
    const container = mount(<FreeRecallMode cards={[]} notes={[note]} isVisible
      onSave={onSave} onRateCard={vi.fn()} onClose={vi.fn()} />);
    click(container, "Erinnerungsphase starten");
    const field = container.querySelector<HTMLTextAreaElement>("textarea")!;
    input(field, "Meine eigenen Erinnerungen");
    act(() => { vi.advanceTimersByTime(2_000); });
    const remaining = container.querySelector('[role="timer"]')!.textContent;

    switchLanguage("en");

    expect(container.textContent).toContain("Recall timer running");
    expect(container.textContent).not.toContain(note.content);
    expect(container.querySelector("textarea")).toBe(field);
    expect(field.value).toBe("Meine eigenen Erinnerungen");
    expect(container.querySelector('[role="timer"]')?.textContent).toBe(remaining);
    expect(container.querySelector('[role="timer"]')?.getAttribute("aria-label"))
      .toBe("4 minutes and 58 seconds remaining");
    expect(onSave).not.toHaveBeenCalled();
    click(container, "Finish recall");
    expect(container.textContent).toContain(note.content);
    click(container, "Save result");
    expect(onSave.mock.calls[0][0].recallText).toBe("Meine eigenen Erinnerungen");
    expect(onSave.mock.calls[0][0].source.relativePath).toBe(note.relativePath);
    expect(container.textContent).toContain("Free recall complete");
  });

  it("keeps SQ3R's current step, source, draft and translated save feedback", () => {
    const onSave = vi.fn();
    const container = mount(<Sq3rMode notes={[]} onSave={onSave}
      onCreateCard={vi.fn()} onConnectObsidian={vi.fn()} onClose={vi.fn()} />);
    const fields = container.querySelectorAll<HTMLTextAreaElement>("textarea");
    input(fields[0], "Mein eigener unveränderter Lerntext");
    input(fields[1], "Mein Überblick");
    click(container, "Weiter");
    const questions = container.querySelector<HTMLTextAreaElement>("textarea")!;
    input(questions, "Warum bleibt meine Leitfrage erhalten?");
    click(container, "Zwischenstand speichern");
    const payload = JSON.stringify(onSave.mock.lastCall);

    switchLanguage("en");

    expect(container.querySelector('.learning-step[aria-current="step"]')?.textContent)
      .toContain("Question");
    expect(container.querySelector("textarea")).toBe(questions);
    expect(questions.value).toBe("Warum bleibt meine Leitfrage erhalten?");
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain("Your SQ3R draft has been saved.");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onSave.mock.lastCall)).toBe(payload);
    click(container, "Back");
    expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value)
      .toBe("Mein eigener unveränderter Lerntext");
    expect(container.textContent).toContain("Up to 40,000 characters.");
  });

  it("retranslates a missing SQ3R step inside a stored feedback message", () => {
    const savedDraft: Sq3rEntry = {
      id: "sq3r", source: { type: "text", label: "Eingefügter Text", text: "Quelltext" },
      answers: { overview: "", questions: "Frage", readingNotes: "Notiz", recitation: "Wiedergabe", review: "Reflexion" },
      currentStep: 4, completed: false, updatedAt: "2026-09-01T10:00:00.000Z",
    };
    const container = mount(<Sq3rMode notes={[]} savedDraft={savedDraft} onSave={vi.fn()}
      onCreateCard={vi.fn()} onConnectObsidian={vi.fn()} onClose={vi.fn()} />);
    click(container, "SQ3R abschließen");
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain("Bitte vervollständige zuerst den Schritt „Überblick“.");
    switchLanguage("en");
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain("Complete the “Survey” step first.");
  });
});
