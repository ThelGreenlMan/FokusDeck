// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { initializeI18n, LANGUAGE_STORAGE_KEY, setLanguage } from "./i18n";

let container: HTMLDivElement;
let root: Root;
const goal = "Mein Ziel: Kapitel 3 erklären";

const snapshotStudyData = () => Object.fromEntries(Object.keys(localStorage)
  .filter((key) => key.startsWith("fokusdeck:") && key !== LANGUAGE_STORAGE_KEY)
  .sort().map((key) => [key, localStorage.getItem(key)]));

function nav(index: number) {
  act(() => container.querySelectorAll<HTMLButtonElement>("nav button")[index].click());
}
function click(parent: Element, selector: string) {
  act(() => parent.querySelector<HTMLButtonElement>(selector)!.click());
}
function switchInSettings(language: string) {
  const select = container.querySelector<HTMLSelectElement>(".settings-language-select")!;
  act(() => { select.value = language; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
function typeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem("fokusdeck:timer-goal-v1", JSON.stringify(goal));
  localStorage.setItem("fokusdeck:flashcards", JSON.stringify([{
    id: "my-card", front: "Meine Frage", back: "Meine Antwort", deck: "Meine Prüfung",
    mastered: false, createdAt: "2026-09-01T10:00:00.000Z",
    source: { type: "obsidian", vaultName: "Mein Wissen", vaultPath: "C:\\Notizen", relativePath: "Prüfung.md", modifiedAt: 1234 },
  }]));
  setLanguage("de", { persist: false });
  initializeI18n();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<App />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  setLanguage("de", { persist: false });
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("whole-app language switch", () => {
  it("retains the card form, selected deck and revealed answer when switching through Settings", () => {
    nav(2);
    const cardsPage = container.querySelector<HTMLElement>(".flashcards-page")!;
    const cardsWrapper = cardsPage.parentElement!;
    const selectedDeck = cardsPage.querySelectorAll<HTMLButtonElement>(".deck-list button")[1];
    act(() => selectedDeck.click());
    const card = cardsPage.querySelector<HTMLButtonElement>(".flashcard")!;
    act(() => card.click());
    click(cardsPage, ".collection-actions .primary-button");
    const form = cardsPage.querySelector<HTMLFormElement>(".new-card-form")!;
    const [front, back] = Array.from(form.querySelectorAll<HTMLTextAreaElement>("textarea"));
    const deck = form.querySelector<HTMLInputElement>("input")!;
    act(() => {
      typeValue(front, "Meine noch ungespeicherte Frage");
      typeValue(back, "Meine noch ungespeicherte Antwort");
      typeValue(deck, "Mein eigener Stapel");
    });
    const storedBeforeSwitch = snapshotStudyData();
    const writes = vi.spyOn(Storage.prototype, "setItem");

    nav(3);
    expect(cardsWrapper.hidden).toBe(true);
    expect(container.querySelector(".new-card-form")).toBe(form);
    switchInSettings("en");
    expect(container.querySelector(".settings-page h1")?.textContent).toBe("Settings");
    nav(2);

    expect(cardsWrapper.hidden).toBe(false);
    expect(container.querySelector(".flashcards-page")).toBe(cardsPage);
    expect(cardsPage.querySelector("h1")?.textContent).toBe("Your flashcards");
    expect(cardsPage.querySelector(".new-card-form")).toBe(form);
    expect(form.querySelectorAll("textarea")[0]).toBe(front);
    expect(form.querySelectorAll("textarea")[1]).toBe(back);
    expect(form.querySelector("input")).toBe(deck);
    expect(front.value).toBe("Meine noch ungespeicherte Frage");
    expect(back.value).toBe("Meine noch ungespeicherte Antwort");
    expect(deck.value).toBe("Mein eigener Stapel");
    expect(front.placeholder).toBe("e.g. What is photosynthesis?");
    expect(cardsPage.querySelector(".deck-list .is-active")).toBe(selectedDeck);
    expect(selectedDeck.querySelector("span")?.textContent).toBe("Meine Prüfung");
    expect(cardsPage.querySelector(".deck-list button span")?.textContent).toBe("All cards");
    expect(cardsPage.querySelector(".flashcard")).toBe(card);
    expect(card.classList.contains("is-flipped")).toBe(true);
    expect(card.getAttribute("aria-label")).toBe("Answer: Meine Antwort. Click to show the question.");
    expect(writes.mock.calls.map(([key]) => key)).toEqual([LANGUAGE_STORAGE_KEY]);
    expect(snapshotStudyData()).toEqual(storedBeforeSwitch);
  });

  it("retains a running timer and goal through Settings and the compact overlay", async () => {
    nav(1);
    click(container, ".primary-timer-button");
    act(() => vi.advanceTimersByTime(5_000));
    expect(document.title).toContain("24:55");
    const storedBeforeSwitch = snapshotStudyData();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    nav(3);
    switchInSettings("en");
    await act(async () => {});
    expect(container.querySelector(".settings-page h1")?.textContent).toBe("Settings");
    expect(document.documentElement.lang).toBe("en-GB");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('"en"');
    expect(writes.mock.calls.map(([key]) => key)).toEqual([LANGUAGE_STORAGE_KEY]);
    expect(snapshotStudyData()).toEqual(storedBeforeSwitch);
    act(() => vi.advanceTimersByTime(3_000));
    expect(document.title).toBe("24:52 · Focus · FokusDeck");
    nav(1);
    expect(container.querySelector(".focus-goal-field__value")?.textContent).toContain(goal);
    expect(container.querySelector(".primary-timer-button")?.textContent).toBe("Pause");
    expect(container.querySelector(".timer-card")?.textContent).toContain("Your next focus session");
    click(container, ".sidebar__bottom button");
    const overlay = container.querySelector(".overlay-shell")!;
    expect(overlay.textContent).toContain("Focus session goal");
    expect(overlay.textContent).toContain(goal);
    expect(overlay.querySelector(".primary-timer-button")?.textContent).toBe("Pause");
    act(() => vi.advanceTimersByTime(2_000));
    expect(overlay.textContent).toContain("24:50");
    click(overlay, ".overlay-close");
    nav(3);
    switchInSettings("de");
    await act(async () => {});
    expect(document.documentElement.lang).toBe("de-DE");
    expect(document.title).toBe("24:50 · Fokus · FokusDeck");
    expect(snapshotStudyData()).toEqual(storedBeforeSwitch);
    nav(2);
    expect(container.textContent).toContain("Meine Frage");
    expect(container.textContent).toContain("Meine Prüfung");
  });

  it("changes an existing local-storage error message immediately without retrying study writes", () => {
    nav(1);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota exceeded"); });
    const input = container.querySelector<HTMLInputElement>(".focus-goal-field input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Nicht gespeichertes Ziel");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector(".toast")?.textContent).toContain("Die lokale Speicherung ist voll");
    nav(3);
    switchInSettings("en");
    expect(container.querySelector(".toast")?.textContent).toContain("Local storage is full or unavailable");
    expect(container.textContent).toContain("Your language preference could not be saved locally");
    nav(1);
    expect(container.querySelector<HTMLInputElement>(".focus-goal-field input")?.value).toBe("Nicht gespeichertes Ziel");
    expect(localStorage.getItem("fokusdeck:timer-goal-v1")).toBe(JSON.stringify(goal));
  });
});
