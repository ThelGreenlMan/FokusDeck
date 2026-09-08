// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import type { Flashcard } from "../types";
import { loadCsvFile } from "../lib/csv";
import { createCollectionDocument, loadCollectionFile } from "../lib/collection";
import { FlashcardsView } from "./FlashcardsView";

vi.mock("../lib/obsidian", () => ({
  isTauriDesktop: () => true,
  localizeNativeError: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock("../lib/csv", () => ({ loadCsvFile: vi.fn() }));
vi.mock("../lib/collection", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/collection")>(),
  loadCollectionFile: vi.fn(), saveCollectionFile: vi.fn(),
}));

const cards: Flashcard[] = [
  { id: "one", front: "Meine Frage", back: "Meine Antwort", deck: "Alle Karten", mastered: false, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "two", front: "Andere Frage", back: "Andere Antwort", deck: "Biologie", mastered: false, createdAt: "2026-01-01T00:00:00.000Z" },
];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  setLanguage("de", { persist: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setLanguage("de", { persist: false });
  vi.unstubAllGlobals();
});

function button(text: string) {
  const found = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.trim() === text);
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}

function typeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("FlashcardsView language switching", () => {
  it("shows an English default placeholder but saves a language-independent default deck", () => {
    const onCardsChange = vi.fn();
    setLanguage("en", { persist: false });
    act(() => root.render(<FlashcardsView cards={[]} onCardsChange={onCardsChange} onOpenObsidianSource={vi.fn()} />));
    act(() => button("New card").click());
    const [front, back] = Array.from(container.querySelectorAll<HTMLTextAreaElement>(".new-card-form textarea"));
    expect(container.querySelector<HTMLInputElement>(".new-card-form input")?.placeholder).toBe("General");
    act(() => {
      typeValue(front, "My question");
      typeValue(back, "My answer");
    });
    act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(onCardsChange).toHaveBeenCalledWith([expect.objectContaining({
      front: "My question", back: "My answer", deck: "Allgemein",
    })]);
  });

  it("keeps a selected user deck, revealed card and unsaved card fields intact", () => {
    const onCardsChange = vi.fn();
    act(() => root.render(<FlashcardsView cards={cards} onCardsChange={onCardsChange} onOpenObsidianSource={vi.fn()} />));
    const userDeck = container.querySelectorAll<HTMLButtonElement>(".deck-list button")[1];
    act(() => userDeck.click());
    const displayedCard = container.querySelector<HTMLButtonElement>(".flashcard")!;
    act(() => displayedCard.click());
    act(() => button("Neue Karte").click());
    const [front, back] = Array.from(container.querySelectorAll<HTMLTextAreaElement>(".new-card-form textarea"));
    const deck = container.querySelector<HTMLInputElement>(".new-card-form input")!;
    act(() => {
      typeValue(front, "Mein ungespeicherter Entwurf");
      typeValue(back, "Meine ungespeicherte Antwort");
      typeValue(deck, "Eigener Stapel");
    });

    act(() => setLanguage("en", { persist: false }));

    expect(container.querySelector("h1")?.textContent).toBe("Your flashcards");
    expect(container.querySelector(".flashcard")).toBe(displayedCard);
    expect(displayedCard.classList.contains("is-flipped")).toBe(true);
    expect(displayedCard.getAttribute("aria-label")).toContain("Answer: Meine Antwort");
    expect(container.querySelector(".deck-list .is-active span")?.textContent).toBe("Alle Karten");
    expect(container.querySelector(".deck-list button span")?.textContent).toBe("All cards");
    expect(front.value).toBe("Mein ungespeicherter Entwurf");
    expect(back.value).toBe("Meine ungespeicherte Antwort");
    expect(deck.value).toBe("Eigener Stapel");
    expect(front.placeholder).toBe("e.g. What is photosynthesis?");
    expect(onCardsChange).not.toHaveBeenCalled();

    act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onCardsChange).toHaveBeenCalledWith([...cards, expect.objectContaining({
      front: "Mein ungespeicherter Entwurf", back: "Meine ungespeicherte Antwort", deck: "Eigener Stapel",
    })]);
  });

  it("retranslates completed import feedback and preserves the imported collection name", async () => {
    const onCardsChange = vi.fn();
    vi.mocked(loadCsvFile).mockResolvedValue(createCollectionDocument([cards[0]], "Meine CSV-Sammlung"));
    act(() => root.render(<FlashcardsView cards={[]} onCardsChange={onCardsChange} onOpenObsidianSource={vi.fn()} />));
    await act(async () => button("CSV importieren").click());
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Meine CSV-Sammlung: 1 Karte aus CSV importiert.");
    const callsBeforeSwitch = onCardsChange.mock.calls.length;

    act(() => setLanguage("en", { persist: false }));

    expect(container.querySelector('[role="status"]')?.textContent).toBe("Meine CSV-Sammlung: 1 card imported from CSV.");
    expect(onCardsChange).toHaveBeenCalledTimes(callsBeforeSwitch);
  });

  it("retranslates an already visible collection validation error", async () => {
    const { parseCollection } = await import("../lib/collection");
    let error: unknown;
    try { parseCollection("invalid JSON"); } catch (caught) { error = caught; }
    vi.mocked(loadCollectionFile).mockRejectedValue(error);
    act(() => root.render(<FlashcardsView cards={cards} onCardsChange={vi.fn()} onOpenObsidianSource={vi.fn()} />));
    await act(async () => button("Sammlung laden").click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain("kein gültiges JSON");

    act(() => setLanguage("en", { persist: false }));

    expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading failed: The file does not contain valid JSON.");
  });
});
