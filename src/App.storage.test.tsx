// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const roots = new Set<Root>();
const cardsKey = "fokusdeck:flashcards";
const sessionKey = "fokusdeck:daily-session-v1";
const progressKey = "fokusdeck:obsidian-learning-progress-v1";
const customCards = [{
  id: "custom-card", front: "Eigene Frage", back: "Eigene Antwort",
  deck: "Eigenes Deck", mastered: false, createdAt: "2026-09-01T10:00:00.000Z",
}];
const savedSession = {
  id: "session-test", title: "Meine gespeicherte Lernrunde", queueIds: ["custom-card"],
  position: 0, answerMode: "mental", answers: {}, ratings: {},
  counts: { again: 0, hard: 0, good: 0, easy: 0 }, requeuedIds: [],
  startedAt: "2026-09-06T10:00:00.000Z",
};

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  act(() => root.render(<StrictMode><App /></StrictMode>));
  return container;
}

function button(container: Element, label: string) {
  const match = Array.from(container.querySelectorAll("button"))
    .find((element) => element.textContent?.trim() === label);
  if (!match) throw new Error(`Button fehlt: ${label}`);
  return match;
}

function notice(container: Element, title: string) {
  const match = Array.from(container.querySelectorAll(".storage-recovery"))
    .find((element) => element.querySelector("h2")?.textContent === title);
  if (!match) throw new Error(`Speicherhinweis fehlt: ${title}`);
  return match;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
});

afterEach(() => {
  act(() => { for (const root of roots) root.unmount(); });
  roots.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

describe("App storage recovery integration", () => {
  it("preserves an existing daily session and Obsidian progress while its cards cannot be loaded", async () => {
    const damagedCards = "[damaged personal cards";
    const sessionRaw = JSON.stringify(savedSession);
    const progressRaw = JSON.stringify({ "custom-card": { mastered: true } });
    localStorage.setItem(cardsKey, damagedCards);
    localStorage.setItem(sessionKey, sessionRaw);
    localStorage.setItem(progressKey, progressRaw);
    const container = mount();

    expect(notice(container, "Karteikarten").textContent).toContain("Originaldaten bleiben erhalten");
    expect(localStorage.getItem(cardsKey)).toBe(damagedCards);
    expect(localStorage.getItem(sessionKey)).toBe(sessionRaw);
    expect(localStorage.getItem(progressKey)).toBe(progressRaw);
    expect(localStorage.getItem(`${sessionKey}:backup-v1`)).toBeNull();

    // Navigation and overlay must keep the learning store mounted and intact.
    for (const navButton of container.querySelectorAll<HTMLButtonElement>("aside nav button")) {
      act(() => navButton.click());
      expect(localStorage.getItem(sessionKey)).toBe(sessionRaw);
      expect(localStorage.getItem(cardsKey)).toBe(damagedCards);
    }
    await act(async () => button(container, "Always-on-top").click());
    expect(container.querySelector(".storage-recovery-compact")?.textContent).toContain("Aufmerksamkeit");
    await act(async () => button(container, "Zur App").click());

    // A repaired external value is only loaded after the explicit retry.
    localStorage.setItem(cardsKey, JSON.stringify(customCards));
    act(() => button(notice(container, "Karteikarten"), "Erneut versuchen").click());
    act(() => container.querySelector<HTMLButtonElement>("aside nav button")!.click());
    expect(container.querySelector(".storage-recovery-list")).toBeNull();
    expect(container.textContent).toContain("Meine gespeicherte Lernrunde");
    act(() => button(container, "Runde fortsetzen").click());
    expect(container.textContent).toContain("Eigene Frage");
    expect(localStorage.getItem(sessionKey)).toBe(sessionRaw);
    expect(localStorage.getItem(progressKey)).toBe(progressRaw);
  });

  it("does not copy card progress over saved Obsidian progress when the connection is damaged", () => {
    const progressRaw = JSON.stringify({ "custom-card": { mastered: true } });
    const originalConnection = "{damaged vault connection";
    localStorage.setItem("fokusdeck:obsidian-connection", originalConnection);
    localStorage.setItem(progressKey, progressRaw);
    localStorage.setItem(cardsKey, JSON.stringify(customCards.map((card) => ({
      ...card,
      source: {
        type: "obsidian", vaultName: "Meine Notizen", vaultPath: "C:/Notes",
        relativePath: "topic.md", modifiedAt: 1,
      },
    }))));

    const container = mount();

    expect(notice(container, "Obsidian-Verbindung")).toBeTruthy();
    expect(localStorage.getItem(progressKey)).toBe(progressRaw);
    expect(localStorage.getItem(`${progressKey}:backup-v1`)).toBeNull();
    expect(localStorage.getItem("fokusdeck:obsidian-connection")).toBe(originalConnection);
  });

  it.each([
    ["fokusdeck:timer-settings", "Timer-Einstellungen"],
    ["fokusdeck:timer-goal-v1", "Timerziel"],
    [cardsKey, "Karteikarten"],
    ["fokusdeck:obsidian-connection", "Obsidian-Verbindung"],
    [progressKey, "Obsidian-Lernfortschritt"],
    ["fokusdeck:learning-plan-v1", "Lernplan"],
    [sessionKey, "Lernrunde"],
    ["fokusdeck:learning-journal-v1", "Lernjournal"],
  ])("shows and preserves corrupt data in %s across views", (key, title) => {
    const original = "{unreadable saved data";
    localStorage.setItem(key, original);
    const container = mount();
    expect(notice(container, title).textContent).toContain("Erneut versuchen");
    expect(container.querySelector(".sidebar__bottom")?.textContent).toContain("Aufmerksamkeit");
    for (const navButton of container.querySelectorAll<HTMLButtonElement>("aside nav button")) {
      act(() => navButton.click());
      expect(notice(container, title)).toBeTruthy();
      expect(localStorage.getItem(key)).toBe(original);
      expect(localStorage.getItem(`${key}:backup-v1`)).toBeNull();
    }
  });

  it.each([
    [cardsKey, [null], "Karteikarten"],
    [cardsKey, [...customCards, ...customCards], "Karteikarten"],
    ["fokusdeck:timer-settings", [], "Timer-Einstellungen"],
    ["fokusdeck:timer-goal-v1", { goal: "Falsches Format" }, "Timerziel"],
    ["fokusdeck:obsidian-connection", {}, "Obsidian-Verbindung"],
    [progressKey, { card: null }, "Obsidian-Lernfortschritt"],
    ["fokusdeck:learning-plan-v1", { selectedDecks: [null] }, "Lernplan"],
    [sessionKey, { ...savedSession, answers: { "custom-card": 42 } }, "Lernrunde"],
    ["fokusdeck:learning-journal-v1", { sq3r: [{ id: "invalid" }] }, "Lernjournal"],
  ])("does not silently discard invalid records in %s", (key, value, title) => {
    const original = JSON.stringify(value);
    localStorage.setItem(key, original);
    const container = mount();
    expect(notice(container, title)).toBeTruthy();
    expect(localStorage.getItem(key)).toBe(original);
    expect(localStorage.getItem(`${key}:backup-v1`)).toBeNull();
  });
});
