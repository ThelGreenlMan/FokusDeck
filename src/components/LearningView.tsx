import { useEffect, useMemo, useRef, useState } from "react";
import type { Flashcard } from "../types";
import { usePersistentState } from "../hooks/usePersistentState";
import {
  dueLearningCards,
  errorLearningCards,
  interleaveDecks,
  reviewLearningCard,
  summarizeLearning,
  type ReviewRating,
} from "../lib/learning";
import type { VaultNote } from "../lib/obsidian";
import {
  CardStudySession,
  type AnswerMode,
  type DailySessionSnapshot,
} from "./learning/CardStudySession";
import { ExamMode, type ExamEntry } from "./learning/ExamMode";
import {
  FeynmanMode,
  type FeynmanCardDraft,
  type FeynmanEntry,
} from "./learning/FeynmanMode";
import {
  FreeRecallMode,
  type FreeRecallEntry,
} from "./learning/FreeRecallMode";
import {
  Sq3rMode,
  type Sq3rEntry,
} from "./learning/Sq3rMode";

const DAILY_SESSION_KEY = "fokusdeck:daily-session-v1";
const LEARNING_PLAN_KEY = "fokusdeck:learning-plan-v1";
const LEARNING_JOURNAL_KEY = "fokusdeck:learning-journal-v1";
const MAX_HISTORY_ENTRIES = 5;

type LearningMode = "cards" | "exam" | "feynman" | "free-recall" | "sq3r";

interface LearningPlan {
  selectedDecks: string[];
  maximumCards: number;
  mixTopics: boolean;
  answerMode: AnswerMode;
}

interface LearningJournal {
  exams: ExamEntry[];
  feynman: FeynmanEntry[];
  freeRecall: FreeRecallEntry[];
  sq3r: Sq3rEntry[];
}

interface CardDraft {
  front: string;
  back: string;
  deck: string;
}

export interface LearningViewProps {
  cards: Flashcard[];
  notes: VaultNote[];
  hasObsidian: boolean;
  isVisible: boolean;
  onCardsChange: (cards: Flashcard[]) => void;
  onOpenCards: () => void;
  onOpenSettings: () => void;
}

const initialPlan: LearningPlan = {
  selectedDecks: [],
  maximumCards: 20,
  mixTopics: true,
  answerMode: "mental",
};

const initialJournal: LearningJournal = {
  exams: [],
  feynman: [],
  freeRecall: [],
  sq3r: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function storedStrings(value: unknown, maximum = 200) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maximum);
}

function normalizePlan(value: unknown): LearningPlan {
  const stored = asRecord(value);
  const selectedDecks = Array.from(
    new Set(storedStrings(stored?.selectedDecks, 100).map((deck) => deck.slice(0, 100))),
  );
  return {
    selectedDecks,
    maximumCards: clampMaximumCards(
      typeof stored?.maximumCards === "number"
        ? stored.maximumCards
        : initialPlan.maximumCards,
    ),
    mixTopics:
      typeof stored?.mixTopics === "boolean"
        ? stored.mixTopics
        : initialPlan.mixTopics,
    answerMode: stored?.answerMode === "typed" ? "typed" : "mental",
  };
}

function hasStringId(value: unknown): value is { id: string } {
  const stored = asRecord(value);
  return Boolean(stored && typeof stored.id === "string" && stored.id.trim());
}

function storedEntries<T extends { id: string }>(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(hasStringId).slice(0, MAX_HISTORY_ENTRIES) as T[];
}

function isSq3rEntry(value: unknown): value is Sq3rEntry {
  const entry = asRecord(value);
  const source = asRecord(entry?.source);
  const answers = asRecord(entry?.answers);
  return Boolean(
    entry &&
      typeof entry.id === "string" &&
      typeof entry.completed === "boolean" &&
      typeof entry.currentStep === "number" &&
      Number.isFinite(entry.currentStep) &&
      typeof entry.updatedAt === "string" &&
      source &&
      (source.type === "obsidian" || source.type === "text") &&
      typeof source.label === "string" &&
      typeof source.text === "string" &&
      (source.relativePath === undefined || typeof source.relativePath === "string") &&
      (source.modifiedAt === undefined || typeof source.modifiedAt === "number") &&
      answers &&
      typeof answers.overview === "string" &&
      typeof answers.questions === "string" &&
      typeof answers.readingNotes === "string" &&
      typeof answers.recitation === "string" &&
      typeof answers.review === "string",
  );
}

function normalizeJournal(value: unknown): LearningJournal {
  const stored = asRecord(value);
  const sq3r = Array.isArray(stored?.sq3r)
    ? stored.sq3r.filter(isSq3rEntry).slice(0, MAX_HISTORY_ENTRIES)
    : [];
  return {
    exams: storedEntries<ExamEntry>(stored?.exams),
    feynman: storedEntries<FeynmanEntry>(stored?.feynman),
    freeRecall: storedEntries<FreeRecallEntry>(stored?.freeRecall),
    sq3r,
  };
}

function normalizeDailySession(value: unknown): DailySessionSnapshot | null {
  const stored = asRecord(value);
  if (!stored) return null;

  const queueIds = storedStrings(stored.queueIds, 200);
  const answers = asRecord(stored.answers);
  const storedRatings = asRecord(stored.ratings);
  const storedCounts = asRecord(stored.counts);
  if (
    !queueIds.length ||
    typeof stored.id !== "string" ||
    typeof stored.title !== "string" ||
    (stored.answerMode !== "mental" && stored.answerMode !== "typed") ||
    !answers ||
    !storedRatings ||
    !storedCounts ||
    !Array.isArray(stored.requeuedIds) ||
    typeof stored.startedAt !== "string"
  ) {
    return null;
  }

  const ratings: Record<string, ReviewRating> = {};
  for (const [cardId, rating] of Object.entries(storedRatings)) {
    if (
      rating === "again" ||
      rating === "hard" ||
      rating === "good" ||
      rating === "easy"
    ) {
      ratings[cardId] = rating;
    }
  }

  const safeAnswers: Record<string, string> = {};
  for (const [cardId, answer] of Object.entries(answers)) {
    if (typeof answer === "string") safeAnswers[cardId] = answer.slice(0, 4_000);
  }

  const countFor = (rating: ReviewRating) => {
    const count = storedCounts[rating];
    return typeof count === "number" && Number.isFinite(count)
      ? Math.max(0, Math.floor(count))
      : 0;
  };
  const storedPosition = stored.position;
  const position =
    typeof storedPosition === "number" && Number.isFinite(storedPosition)
      ? Math.min(queueIds.length, Math.max(0, Math.floor(storedPosition)))
      : 0;

  return {
    id: stored.id.slice(0, 200),
    title: stored.title.slice(0, 200),
    queueIds,
    position,
    answerMode: stored.answerMode,
    answers: safeAnswers,
    ratings,
    counts: {
      again: countFor("again"),
      hard: countFor("hard"),
      good: countFor("good"),
      easy: countFor("easy"),
    },
    requeuedIds: storedStrings(stored.requeuedIds, 100),
    startedAt: stored.startedAt,
  };
}

function sessionForExistingCards(
  session: DailySessionSnapshot | null,
  cards: readonly Flashcard[],
) {
  if (!session) return null;
  const availableIds = new Set(cards.map((card) => card.id));
  const queueIds = session.queueIds.filter((id) => availableIds.has(id));
  if (!queueIds.length) return null;
  const position = session.queueIds
    .slice(0, session.position)
    .filter((id) => availableIds.has(id)).length;
  return { ...session, queueIds, position: Math.min(position, queueIds.length) };
}

function normalizedDeck(card: Flashcard) {
  return card.deck.trim() || "Ohne Stapel";
}

function clampMaximumCards(value: number) {
  if (!Number.isFinite(value)) return initialPlan.maximumCards;
  return Math.min(50, Math.max(5, Math.round(value)));
}

function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function uniqueCards(cards: readonly Flashcard[]) {
  return Array.from(new Map(cards.map((card) => [card.id, card])).values());
}

function newSession(
  title: string,
  cards: readonly Flashcard[],
  answerMode: AnswerMode,
): DailySessionSnapshot {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`,
    title,
    queueIds: cards.map((card) => card.id),
    position: 0,
    answerMode,
    answers: {},
    ratings: {},
    counts: { again: 0, hard: 0, good: 0, easy: 0 },
    requeuedIds: [],
    startedAt: new Date().toISOString(),
  };
}

function upsertHistory<T extends { id: string }>(entries: T[], entry: T) {
  return [entry, ...entries.filter((candidate) => candidate.id !== entry.id)].slice(
    0,
    MAX_HISTORY_ENTRIES,
  );
}

function newestIncompleteSq3r(entries: Sq3rEntry[]) {
  return [...entries]
    .filter((entry) => !entry.completed)
    .sort(
      (first, second) =>
        new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime(),
    )[0] ?? null;
}

export function LearningView({
  cards,
  notes,
  hasObsidian,
  isVisible,
  onCardsChange,
  onOpenCards,
  onOpenSettings,
}: LearningViewProps) {
  const [clock, setClock] = useState(() => Date.now());
  const [activeMode, setActiveMode] = useState<LearningMode | null>(null);
  const [storedPlan, setStoredPlan, planStorageError] = usePersistentState<LearningPlan | null>(
    LEARNING_PLAN_KEY,
    initialPlan,
  );
  const [storedDailySession, setStoredDailySession, sessionStorageError] =
    usePersistentState<DailySessionSnapshot | null>(DAILY_SESSION_KEY, null);
  const [storedJournal, setStoredJournal, journalStorageError] = usePersistentState<LearningJournal | null>(
    LEARNING_JOURNAL_KEY,
    initialJournal,
  );
  const plan = normalizePlan(storedPlan);
  const journal = normalizeJournal(storedJournal);
  const normalizedSession = normalizeDailySession(storedDailySession);
  const dailySession = sessionForExistingCards(normalizedSession, cards);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const deckNames = useMemo(
    () =>
      Array.from(new Set(cards.map(normalizedDeck))).sort((first, second) =>
        first.localeCompare(second, "de-DE"),
      ),
    [cards],
  );
  const selectedDecks = Array.isArray(plan.selectedDecks)
    ? plan.selectedDecks.filter((deck) => deckNames.includes(deck))
    : [];
  const maximumCards = clampMaximumCards(plan.maximumCards);
  const answerMode: AnswerMode = plan.answerMode === "typed" ? "typed" : "mental";
  const selectedCards = selectedDecks.length
    ? cards.filter((card) => selectedDecks.includes(normalizedDeck(card)))
    : cards;
  const selectedDeckCount = new Set(selectedCards.map(normalizedDeck)).size;
  const shouldMix = Boolean(plan.mixTopics) && selectedDeckCount > 1;
  // A migration can assign `dueAt` a few milliseconds after the view's first
  // clock snapshot. Using the later value makes legacy cards immediately due.
  const now = new Date(Math.max(clock, Date.now()));
  const summary = summarizeLearning(selectedCards, now);
  const selectedErrors = errorLearningCards(selectedCards, now);
  const selectedDue = dueLearningCards(selectedCards, now);
  const selectedErrorIds = new Set(selectedErrors.map((card) => card.id));
  const dueErrors = selectedDue.filter((card) => selectedErrorIds.has(card.id));
  const dailyCandidates = uniqueCards([...dueErrors, ...selectedDue]);
  const dailyQueue = shouldMix
    ? interleaveDecks(dailyCandidates, `daily-${localDateKey(clock)}`, maximumCards)
    : dailyCandidates.slice(0, maximumCards);
  const estimatedMinutes = dailyQueue.length
    ? Math.max(1, Math.ceil((dailyQueue.length * (answerMode === "typed" ? 75 : 45)) / 60))
    : 0;
  const validSavedQueueLength = dailySession
    ? dailySession.queueIds.filter((id) => cards.some((card) => card.id === id)).length
    : 0;
  const hasSavedSession = Boolean(dailySession && validSavedQueueLength > 0);
  const sq3rDraft = newestIncompleteSq3r(journal.sq3r);
  const storageError = planStorageError || sessionStorageError || journalStorageError;
  const storageNotice = storageError ? (
    <p className="learning-form-error" role="alert">{storageError}</p>
  ) : null;

  useEffect(() => {
    if (storedDailySession !== null && (!dailySession || !validSavedQueueLength)) {
      setStoredDailySession(null);
    } else if (
      dailySession &&
      JSON.stringify(dailySession) !== JSON.stringify(storedDailySession)
    ) {
      setStoredDailySession(dailySession);
    }
  }, [dailySession, setStoredDailySession, storedDailySession, validSavedQueueLength]);

  const changePlan = (changes: Partial<LearningPlan>) => {
    setStoredPlan({
      selectedDecks,
      maximumCards,
      mixTopics: Boolean(plan.mixTopics),
      answerMode,
      ...changes,
    });
  };

  const toggleDeck = (deck: string) => {
    const nextDecks = selectedDecks.includes(deck)
      ? selectedDecks.filter((candidate) => candidate !== deck)
      : [...selectedDecks, deck];
    changePlan({ selectedDecks: nextDecks });
  };

  const showSession = (session: DailySessionSnapshot) => {
    setStoredDailySession(session);
    setActiveMode("cards");
  };

  const replaceSession = (session: DailySessionSnapshot) => {
    if (
      hasSavedSession &&
      !window.confirm("Die gespeicherte Lernrunde verwerfen und eine neue beginnen?")
    ) {
      return;
    }
    showSession(session);
  };

  const startDailyRound = () => {
    if (!dailyQueue.length) return;
    replaceSession(newSession("Heutige Runde", dailyQueue, answerMode));
  };

  const startFiveMinuteTraining = () => {
    if (!selectedCards.length) return;
    const limit = Math.min(7, maximumCards);
    const trainingCards = shouldMix
      ? interleaveDecks(
          selectedCards,
          `extra-${localDateKey(clock)}`,
          limit,
        )
      : selectedCards.slice(0, limit);
    replaceSession(newSession("5-Minuten-Training", trainingCards, answerMode));
  };

  const startErrorRound = () => {
    if (!selectedErrors.length) return;
    const errorQueue = plan.mixTopics
      ? interleaveDecks(
          selectedErrors,
          `errors-${localDateKey(clock)}`,
          maximumCards,
        )
      : selectedErrors.slice(0, maximumCards);
    replaceSession(newSession("Fehlerkarten", errorQueue, answerMode));
  };

  const rateCard = (cardId: string, rating: ReviewRating) => {
    const updatedCards = cardsRef.current.map((card) =>
      card.id === cardId ? reviewLearningCard(card, rating, new Date()) : card,
    );
    cardsRef.current = updatedCards;
    onCardsChange(updatedCards);
  };

  const createCard = (draft: CardDraft | FeynmanCardDraft) => {
    const front = draft.front.trim().slice(0, 1_000);
    const back = draft.back.trim().slice(0, 4_000);
    if (!front || !back) return;

    const nextCard: Flashcard = {
      id: globalThis.crypto?.randomUUID?.() ?? `card-${Date.now()}`,
      front,
      back,
      deck: draft.deck.trim().slice(0, 100) || "Allgemein",
      mastered: false,
      createdAt: new Date().toISOString(),
    };
    const updatedCards = [...cardsRef.current, nextCard];
    cardsRef.current = updatedCards;
    onCardsChange(updatedCards);
  };

  const saveExam = (entry: ExamEntry) => {
    setStoredJournal((current) => {
      const safe = normalizeJournal(current);
      return { ...safe, exams: upsertHistory(safe.exams, entry) };
    });
  };

  const saveFeynman = (entry: FeynmanEntry) => {
    setStoredJournal((current) => {
      const safe = normalizeJournal(current);
      return { ...safe, feynman: upsertHistory(safe.feynman, entry) };
    });
  };

  const saveFreeRecall = (entry: FreeRecallEntry) => {
    setStoredJournal((current) => {
      const safe = normalizeJournal(current);
      return { ...safe, freeRecall: upsertHistory(safe.freeRecall, entry) };
    });
  };

  const saveSq3r = (entry: Sq3rEntry) => {
    setStoredJournal((current) => {
      const safe = normalizeJournal(current);
      return { ...safe, sq3r: upsertHistory(safe.sq3r, entry) };
    });
  };

  if (activeMode === "cards" && dailySession) {
    return (
      <main className="page-content learning-page">
        {storageNotice}
        <CardStudySession
          cards={cards}
          session={dailySession}
          onSessionChange={setStoredDailySession}
          onRateCard={rateCard}
          onClose={() => setActiveMode(null)}
        />
      </main>
    );
  }

  if (activeMode === "exam") {
    return (
      <main className="page-content learning-page">
        {storageNotice}
        <ExamMode
          cards={cards}
          isVisible={isVisible}
          onRateCard={rateCard}
          onSave={saveExam}
          onClose={() => setActiveMode(null)}
        />
      </main>
    );
  }

  if (activeMode === "feynman") {
    return (
      <main className="page-content learning-page">
        {storageNotice}
        <FeynmanMode
          decks={deckNames}
          onSave={saveFeynman}
          onCreateCard={createCard}
          onClose={() => setActiveMode(null)}
        />
      </main>
    );
  }

  if (activeMode === "free-recall") {
    return (
      <main className="page-content learning-page">
        {storageNotice}
        <FreeRecallMode
          cards={cards}
          notes={notes}
          isVisible={isVisible}
          onSave={saveFreeRecall}
          onRateCard={rateCard}
          onClose={() => setActiveMode(null)}
        />
      </main>
    );
  }

  if (activeMode === "sq3r") {
    return (
      <main className="page-content learning-page">
        {storageNotice}
        <Sq3rMode
          notes={notes}
          savedDraft={sq3rDraft}
          onSave={saveSq3r}
          onCreateCard={createCard}
          onConnectObsidian={onOpenSettings}
          onClose={() => setActiveMode(null)}
        />
      </main>
    );
  }

  return (
    <main className="page-content learning-page">
      {storageNotice}
      <header className="page-intro learning-intro">
        <div>
          <p className="eyebrow">Heute lernen</p>
          <h1>Dein Lernplan für heute</h1>
          <p>
            Fällige und schwierige Karten werden automatisch ausgewählt und bei
            mehreren Themen sinnvoll gemischt.
          </p>
        </div>
      </header>

      <dl
        className="learning-today-stats"
        aria-label={selectedDecks.length ? "Lernstand der gewählten Stapel" : "Heutiger Lernstand"}
      >
        <div>
          <dt>Fällig</dt>
          <dd>{summary.dueNow}</dd>
        </div>
        <div>
          <dt>Fehler</dt>
          <dd>{selectedErrors.length}</dd>
        </div>
        <div>
          <dt>Neu</dt>
          <dd>{summary.newCards}</dd>
        </div>
        <div>
          <dt>Ca. Zeit</dt>
          <dd>{estimatedMinutes} Min.</dd>
        </div>
      </dl>

      {cards.length === 0 ? (
        <section className="learning-empty-state" aria-labelledby="learning-empty-heading">
          <p className="learning-eyebrow">Erster Schritt</p>
          <h2 id="learning-empty-heading">Noch keine Karteikarten vorhanden</h2>
          <p>
            Erstelle Karten, importiere eine CSV-Datei oder verbinde Obsidian. SQ3R
            und die Feynman-Methode kannst du auch ohne Karten verwenden.
          </p>
          <div className="learning-form-actions">
            <button
              type="button"
              className="learning-primary-button"
              onClick={onOpenCards}
            >
              Karteikarten öffnen
            </button>
            {!hasObsidian && (
              <button
                type="button"
                className="learning-secondary-button"
                onClick={onOpenSettings}
              >
                Obsidian verbinden
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="learning-daily-plan" aria-labelledby="daily-plan-heading">
          <div className="learning-daily-copy">
            <p className="learning-eyebrow">Empfohlene Tagesrunde</p>
            <h2 id="daily-plan-heading">
              {dailyQueue.length
                ? `${dailyQueue.length} Karten warten auf dich`
                : "Für heute ist alles geschafft"}
            </h2>
            <p>
              {dailyQueue.length
                ? `Verteiltes Wiederholen und aktives Abrufen planen deine Runde${shouldMix ? "; Karten aus mehreren Themen wechseln sich ab." : "."}`
                : selectedDecks.length
                  ? "In den gewählten Stapeln ist heute nichts fällig. Eine freiwillige Wiederholung aktualisiert deinen Lernplan."
                  : "Wenn du noch etwas tun möchtest, starte eine freiwillige Wiederholung; sie aktualisiert deinen Lernplan."}
            </p>
          </div>

          {hasSavedSession && dailySession && (
            <aside className="learning-resume" aria-label="Gespeicherte Lernrunde">
              <strong>{dailySession.title} fortsetzen</strong>
              <span>
                Karte {Math.min(dailySession.position + 1, validSavedQueueLength)} von{" "}
                {validSavedQueueLength}
              </span>
              <button
                type="button"
                className="learning-primary-button"
                onClick={() => setActiveMode("cards")}
              >
                Runde fortsetzen
              </button>
            </aside>
          )}

          <div className="learning-form-actions">
            {dailyQueue.length ? (
              <button
                type="button"
                className="learning-primary-button"
                onClick={startDailyRound}
              >
                {hasSavedSession ? "Neue Runde beginnen" : "Heutige Runde starten"}
              </button>
            ) : (
              <button
                type="button"
                className="learning-primary-button"
                onClick={startFiveMinuteTraining}
              >
                5-Minuten-Training starten
              </button>
            )}
            <button
              type="button"
              className="learning-secondary-button"
              onClick={startErrorRound}
              disabled={selectedErrors.length === 0}
            >
              Fehlerkarten üben ({selectedErrors.length})
            </button>
          </div>

          <details className="learning-plan-settings">
            <summary>Lernplan anpassen</summary>
            <div className="learning-plan-fields">
              <fieldset className="learning-fieldset">
                <legend>Stapel</legend>
                <label className="learning-choice">
                  <input
                    type="checkbox"
                    checked={selectedDecks.length === 0}
                    onChange={() => changePlan({ selectedDecks: [] })}
                  />
                  <span>Alle Stapel</span>
                </label>
                {deckNames.map((deck) => (
                  <label key={deck} className="learning-choice">
                    <input
                      type="checkbox"
                      checked={selectedDecks.includes(deck)}
                      onChange={() => toggleDeck(deck)}
                    />
                    <span>{deck}</span>
                  </label>
                ))}
              </fieldset>

              <label className="learning-field">
                <span>Höchstens {maximumCards} Karten</span>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={maximumCards}
                  onChange={(event) =>
                    changePlan({ maximumCards: Number(event.target.value) })
                  }
                />
              </label>

              <label className="learning-choice">
                <input
                  type="checkbox"
                  checked={Boolean(plan.mixTopics)}
                  onChange={(event) => changePlan({ mixTopics: event.target.checked })}
                  disabled={selectedDeckCount < 2}
                />
                <span>Themen mischen</span>
              </label>
              {selectedDeckCount < 2 && (
                <p className="learning-field-hint">
                  Zum Mischen werden mindestens zwei Stapel benötigt.
                </p>
              )}

              <fieldset className="learning-fieldset">
                <legend>Antwortmodus</legend>
                <label className="learning-choice">
                  <input
                    type="radio"
                    name="daily-answer-mode"
                    checked={answerMode === "mental"}
                    onChange={() => changePlan({ answerMode: "mental" })}
                  />
                  <span>Im Kopf beantworten</span>
                </label>
                <label className="learning-choice">
                  <input
                    type="radio"
                    name="daily-answer-mode"
                    checked={answerMode === "typed"}
                    onChange={() => changePlan({ answerMode: "typed" })}
                  />
                  <span>Antwort eintippen</span>
                </label>
              </fieldset>
            </div>
          </details>
        </section>
      )}

      <section className="learning-methods" aria-labelledby="other-methods-heading">
        <div className="learning-section-heading">
          <p className="learning-eyebrow">Gezielt üben</p>
          <h2 id="other-methods-heading">Andere Lernart wählen</h2>
        </div>
        <ul className="learning-method-list">
          <li className="learning-method-row">
            <div>
              <small>Prüfungsmodus</small>
              <strong>Prüfung simulieren</strong>
              <p>Beantworte ausgewählte Karten mit Zeitlimit und Ergebnisübersicht.</p>
            </div>
            <button
              type="button"
              className="learning-secondary-button"
              onClick={() => setActiveMode("exam")}
              disabled={cards.length === 0}
            >
              Prüfung starten
            </button>
          </li>
          <li className="learning-method-row">
            <div>
              <small>Feynman-Methode</small>
              <strong>Thema einfach erklären</strong>
              <p>Erkläre ein Thema ohne Fachsprache und notiere deine Wissenslücke.</p>
            </div>
            <button
              type="button"
              className="learning-secondary-button"
              onClick={() => setActiveMode("feynman")}
            >
              Feynman-Methode starten
            </button>
          </li>
          <li className="learning-method-row">
            <div>
              <small>Freies Erinnern</small>
              <strong>Aus dem Kopf schreiben</strong>
              <p>Notiere dein Wissen und vergleiche es anschließend mit der Quelle.</p>
            </div>
            <button
              type="button"
              className="learning-secondary-button"
              onClick={() => setActiveMode("free-recall")}
              disabled={cards.length === 0 && notes.length === 0}
            >
              Freies Erinnern starten
            </button>
          </li>
          <li className="learning-method-row">
            <div>
              <small>SQ3R{sq3rDraft ? " · Zwischenstand vorhanden" : ""}</small>
              <strong>Text in fünf Schritten lernen</strong>
              <p>
                {hasObsidian
                  ? "Arbeite eine Obsidian-Notiz oder einen eingefügten Text systematisch durch."
                  : "Füge einen Text ein oder verbinde Obsidian als zusätzliche Quelle."}
              </p>
            </div>
            <button
              type="button"
              className="learning-secondary-button"
              onClick={() => setActiveMode("sq3r")}
            >
              {sq3rDraft ? "SQ3R fortsetzen" : "SQ3R starten"}
            </button>
          </li>
        </ul>
      </section>
    </main>
  );
}
