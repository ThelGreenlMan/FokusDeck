// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { usePersistentState } from "../hooks/usePersistentState";
import type { Flashcard } from "../types";
import { LearningView } from "./LearningView";
import { StorageRecoveryNotice } from "./StorageRecoveryNotice";

const key = "fokusdeck:flashcards";
const journalKey = "fokusdeck:learning-journal-v1";
const cards: Flashcard[] = ["one", "two"].map((id) => ({
  id, front: "Frage " + id, back: "Antwort " + id, deck: "Meine Karten",
  mastered: false, createdAt: "2026-01-01T00:00:00.000Z",
}));
const original = JSON.stringify(cards);
let state: ReturnType<typeof usePersistentState<Flashcard[]>>;
let container: HTMLDivElement;
let root: Root;
const cardWrites = vi.fn();

function Harness() {
  state = usePersistentState(key, cards);
  return <>
    <StorageRecoveryNotice title="Karteikarten" error={state[2]} recovery={state[3]} />
    <LearningView cards={state[0]} notes={[]} hasObsidian={false} isVisible
      cardsStorageBlocked={state[3].blocked}
      onCardsChange={(next) => { cardWrites(next); state[1](next); }}
      onOpenCards={vi.fn()} onOpenSettings={vi.fn()} />
  </>;
}
function mount() {
  act(() => root.render(<StrictMode><Harness /></StrictMode>));
}
function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === label);
  if (!button) throw Error("Button missing: " + label);
  act(() => button.click());
}
function type(field: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function failStorage(kind: "read" | "write") {
  if (kind === "read") {
    const read = Storage.prototype.getItem;
    return vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
      if (name === key) throw Error("Simulated read failure");
      return read.call(this, name);
    });
  }
  const write = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
    if (name === key) throw Error("Simulated write failure");
    return write.call(this, name, value);
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  setLanguage("de", { persist: false });
  localStorage.clear();
  localStorage.setItem(key, original);
  cardWrites.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  setLanguage("de", { persist: false });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("storage failures during active learning", () => {
  it.each([
    ["feynman", "Feynman-Methode starten"],
    ["exam", "Prüfung starten"],
    ["recall", "Freies Erinnern starten"],
    ["sq3r", "SQ3R starten"],
  ])("retains the %s draft, DOM and timer through a runtime block, language switch and retry", (mode, start) => {
    mount();
    click(start);
    if (mode === "exam") click("Prüfung starten");
    if (mode === "recall") click("Erinnerungsphase starten");
    const field = container.querySelector<HTMLTextAreaElement>("textarea")!;
    type(field, "Mein unersetzlicher Lernentwurf");
    act(() => vi.advanceTimersByTime(2_000));
    const time = container.querySelector('time, [role="timer"]');
    const remaining = time?.textContent;
    const fail = failStorage("read");
    act(() => state[1](current => current.map(card => ({ ...card, mastered: true }))));
    expect(state[3].blocked).toBe(true);
    expect(container.querySelector("textarea")).toBe(field);
    expect(field.value).toBe("Mein unersetzlicher Lernentwurf");
    expect(field.matches(":disabled")).toBe(true);
    act(() => vi.advanceTimersByTime(30_000));
    expect(time?.textContent).toBe(remaining);
    const pending = state[3].pendingData;
    act(() => setLanguage("en", { persist: false }));
    expect(container.textContent).toContain("Controls and study timers are paused");
    expect(state[3].pendingData).toBe(pending);
    expect(container.querySelector("textarea")).toBe(field);
    fail.mockRestore();
    act(() => state[3].retry());
    expect(state[3].blocked).toBe(false);
    expect(field.matches(":disabled")).toBe(false);
    expect(container.querySelector("textarea")).toBe(field);
    expect(field.value).toBe("Mein unersetzlicher Lernentwurf");
    expect(localStorage.getItem(key)).toBe(pending);
    if (time) {
      const resumed = time.textContent;
      act(() => vi.advanceTimersByTime(2_000));
      expect(time.textContent).not.toBe(resumed);
    }
  });

  it("retains a Feynman draft when saving its own journal hits a read error", () => {
    mount();
    click("Feynman-Methode starten");
    const topic = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(topic, "Mein Thema");
      topic.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const fields = container.querySelectorAll<HTMLTextAreaElement>("textarea");
    type(fields[0], "Meine ausführliche Erklärung");
    type(fields[3], "Meine einfache Erklärung");
    const read = Storage.prototype.getItem;
    const fail = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
      if (name === journalKey) throw Error("Journal unavailable");
      return read.call(this, name);
    });
    click("Eintrag speichern");
    expect(container.querySelector("textarea")).toBe(fields[0]);
    expect(fields[0].matches(":disabled")).toBe(true);
    expect(container.textContent).toContain("Ungespeicherte Änderungen sichern");
    fail.mockRestore();
    click("Erneut versuchen");
    expect(fields[0].matches(":disabled")).toBe(false);
    expect(fields[0].value).toBe("Meine ausführliche Erklärung");
    const journal = JSON.parse(localStorage.getItem(journalKey)!);
    expect(journal.feynman[0].explanation).toBe("Meine ausführliche Erklärung");
    expect(journal.feynman[0].simplifiedExplanation).toBe("Meine einfache Erklärung");
  });

  it.each([
    ["exam", "read"], ["exam", "write"],
    ["timeout", "read"], ["timeout", "write"],
    ["recall", "read"], ["recall", "write"],
  ] as const)("keeps every %s rating together after a %s failure and retries exactly once", (mode, failure) => {
    mount();
    click(mode === "recall" ? "Freies Erinnern starten" : "Prüfung starten");
    click(mode === "recall" ? "Erinnerungsphase starten" : "Prüfung starten");
    let finish: () => void;
    if (mode === "exam") {
      type(container.querySelector<HTMLTextAreaElement>("textarea")!, "Erste Antwort");
      click("Lösung aufdecken");
      act(() => container.querySelector<HTMLButtonElement>(".learning-rating--good")!.click());
      type(container.querySelector<HTMLTextAreaElement>("textarea")!, "Zweite Antwort");
      click("Lösung aufdecken");
      finish = () => act(() => container.querySelector<HTMLButtonElement>(".learning-rating--hard")!.click());
    } else if (mode === "recall") {
      type(container.querySelector<HTMLTextAreaElement>("textarea")!, "Meine Erinnerungen");
      click("Erinnern abschließen");
      for (const button of container.querySelectorAll<HTMLButtonElement>(".learning-rating-good")) {
        act(() => button.click());
      }
      finish = () => click("Ergebnis speichern");
    } else {
      finish = () => act(() => vi.advanceTimersByTime(31 * 60_000));
    }
    const read = Storage.prototype.getItem;
    const fail = failStorage(failure);
    finish();
    expect(cardWrites).toHaveBeenCalledTimes(1);
    expect(state[2]).toBeTruthy();
    expect(read.call(localStorage, key)).toBe(original);
    const pending = state[3].pendingData;
    const rated: Flashcard[] = JSON.parse(pending!);
    expect(rated.map(card => card.learning?.stats.reviews)).toEqual([1, 1]);
    expect(rated.every(card => card.learning?.lastRating !== null)).toBe(true);
    const journal = JSON.parse(localStorage.getItem(journalKey)!);
    expect(mode === "recall" ? journal.freeRecall[0].ratings : journal.exams[0].answers).toHaveLength(2);
    fail.mockRestore();
    act(() => state[3].retry());
    expect(state[2]).toBe("");
    expect(localStorage.getItem(key)).toBe(pending);
    act(() => state[3].retry());
    expect(localStorage.getItem(key)).toBe(pending);
    expect(cardWrites).toHaveBeenCalledTimes(1);
  });
});
