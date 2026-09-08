import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Flashcard } from "../../types";
import { formatNumber, t, useI18n } from "../../i18n";
import { useSessionCountdown } from "../../hooks/useSessionCountdown";
import type { ReviewRating } from "../../lib/learning/model";
import type { VaultNote } from "../../lib/obsidian";

const DURATION_OPTIONS = [3, 5, 10] as const;
const MAX_RECALL_LENGTH = 12_000;
const MAX_REFERENCE_CARDS = 20;

type FreeRecallDuration = (typeof DURATION_OPTIONS)[number];
type FreeRecallRating = Extract<ReviewRating, "again" | "good">;
type FreeRecallPhase = "setup" | "recall" | "compare" | "saved";

export type FreeRecallSource =
  | { type: "deck"; deck: string }
  | { type: "obsidian"; relativePath: string; modifiedAt: number };

export interface FreeRecallEntry {
  id: string;
  createdAt: string;
  source: FreeRecallSource;
  durationMinutes: FreeRecallDuration;
  elapsedSeconds: number;
  recallText: string;
  ratings: Array<{ cardId: string; rating: FreeRecallRating }>;
}

export interface FreeRecallModeProps {
  cards: Flashcard[];
  notes: VaultNote[];
  isVisible: boolean;
  onSave: (entry: FreeRecallEntry) => void;
  onRateCard: (cardId: string, rating: ReviewRating) => void;
  onClose: () => void;
}

interface DeckSourceOption {
  key: string;
  type: "deck";
  deck: string;
  isFallback: boolean;
}

interface NoteSourceOption {
  key: string;
  type: "obsidian";
  note: VaultNote;
}

type SourceOption = DeckSourceOption | NoteSourceOption;

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function normalizedDeck(card: Flashcard) {
  return card.deck.trim() || "Ohne Stapel";
}

function buildSourceOptions(cards: Flashcard[], notes: VaultNote[], locale: string) {
  const decks = Array.from(new Set(cards.map(normalizedDeck))).sort((first, second) =>
    first.localeCompare(second, locale),
  );
  const uniqueNotes = Array.from(
    new Map(notes.map((note) => [note.relativePath, note])).values(),
  ).sort((first, second) =>
    first.relativePath.localeCompare(second.relativePath, locale),
  );

  return [
    ...decks.map(
      (deck): DeckSourceOption => ({
        key: `deck:${deck}`,
        type: "deck",
        deck,
        isFallback: deck === "Ohne Stapel" && !cards.some((card) => card.deck.trim() === deck),
      }),
    ),
    ...uniqueNotes.map(
      (note): NoteSourceOption => ({
        key: `note:${note.relativePath}`,
        type: "obsidian",
        note,
      }),
    ),
  ];
}

function cardsForSource(cards: Flashcard[], source: SourceOption) {
  if (source.type === "deck") {
    return cards
      .filter((card) => normalizedDeck(card) === source.deck)
      .slice(0, MAX_REFERENCE_CARDS);
  }
  return cards
    .filter(
      (card) =>
        card.source?.type === "obsidian" &&
        card.source.relativePath === source.note.relativePath,
    )
    .slice(0, MAX_REFERENCE_CARDS);
}

function persistedSource(source: SourceOption): FreeRecallSource {
  if (source.type === "deck") return { type: "deck", deck: source.deck };
  return {
    type: "obsidian",
    relativePath: source.note.relativePath,
    modifiedAt: source.note.modifiedAt,
  };
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${formatNumber(minutes, { minimumIntegerDigits: 2, useGrouping: false })}:${formatNumber(seconds, { minimumIntegerDigits: 2, useGrouping: false })}`;
}

function countdownLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return t("methods.recall.countdown", {
    minutes: t("methods.minutes", { count: minutes }),
    seconds: t("methods.seconds", { count: seconds }),
  });
}

export function FreeRecallMode({
  cards,
  notes,
  isVisible,
  onSave,
  onRateCard,
  onClose,
}: FreeRecallModeProps) {
  const { t, locale } = useI18n();
  const headingId = useId();
  const recallHintId = useId();
  const ratingHintId = useId();
  const sourceOptions = useMemo(
    () => buildSourceOptions(cards, notes, locale),
    [cards, notes, locale],
  );
  const [sourceKey, setSourceKey] = useState(
    () => buildSourceOptions(cards, notes, locale)[0]?.key ?? "",
  );
  const [durationMinutes, setDurationMinutes] =
    useState<FreeRecallDuration>(5);
  const [phase, setPhase] = useState<FreeRecallPhase>("setup");
  const [recallText, setRecallText] = useState("");
  const [sessionSource, setSessionSource] = useState<SourceOption | null>(null);
  const [sessionCards, setSessionCards] = useState<Flashcard[]>([]);
  const [ratings, setRatings] = useState<Record<string, FreeRecallRating>>({});
  const recallFieldRef = useRef<HTMLTextAreaElement>(null);
  const phaseHeadingRef = useRef<HTMLHeadingElement>(null);
  const savedRef = useRef(false);
  const pausedForVisibilityRef = useRef(false);
  const totalSeconds = durationMinutes * 60;
  const countdown = useSessionCountdown(totalSeconds);

  const selectedSource = sourceOptions.find((source) => source.key === sourceKey);
  const deckSources = sourceOptions.filter(
    (source): source is DeckSourceOption => source.type === "deck",
  );
  const noteSources = sourceOptions.filter(
    (source): source is NoteSourceOption => source.type === "obsidian",
  );
  const ratedCards = sessionCards.filter((card) => Boolean(ratings[card.id])).length;
  const ratingsComplete = ratedCards === sessionCards.length;

  useEffect(() => {
    if (!selectedSource) setSourceKey(sourceOptions[0]?.key ?? "");
  }, [selectedSource, sourceOptions]);

  useEffect(() => {
    if (phase === "recall") {
      recallFieldRef.current?.focus();
    } else if (phase === "compare" || phase === "saved") {
      phaseHeadingRef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "recall" && countdown.isFinished) {
      setPhase("compare");
    }
  }, [countdown.isFinished, phase]);

  useEffect(() => {
    if (phase !== "recall") {
      pausedForVisibilityRef.current = false;
      return;
    }
    if (!isVisible && countdown.isRunning) {
      pausedForVisibilityRef.current = true;
      countdown.pause();
    } else if (
      isVisible &&
      pausedForVisibilityRef.current &&
      !countdown.isRunning &&
      !countdown.isFinished
    ) {
      pausedForVisibilityRef.current = false;
      countdown.start();
    }
  }, [
    countdown.isFinished,
    countdown.isRunning,
    countdown.pause,
    countdown.start,
    isVisible,
    phase,
  ]);

  const startRecall = () => {
    if (!selectedSource) return;
    setSessionSource(selectedSource);
    setSessionCards(cardsForSource(cards, selectedSource));
    setRecallText("");
    setRatings({});
    savedRef.current = false;
    countdown.reset();
    countdown.start();
    setPhase("recall");
  };

  const completeRecall = () => {
    countdown.pause();
    setPhase("compare");
  };

  const saveResult = () => {
    if (!sessionSource || !ratingsComplete || savedRef.current) return;
    savedRef.current = true;

    const completedRatings = sessionCards.map((card) => ({
      cardId: card.id,
      rating: ratings[card.id],
    }));
    for (const rating of completedRatings) {
      onRateCard(rating.cardId, rating.rating);
    }

    onSave({
      id: createId(),
      createdAt: new Date().toISOString(),
      source: persistedSource(sessionSource),
      durationMinutes,
      elapsedSeconds: Math.max(0, totalSeconds - countdown.remainingSeconds),
      recallText: recallText.trim(),
      ratings: completedRatings,
    });
    setPhase("saved");
  };

  const closeMode = () => {
    const hasUnsavedWork =
      phase !== "setup" &&
      phase !== "saved" &&
      (Boolean(recallText.trim()) || Object.keys(ratings).length > 0);
    if (
      hasUnsavedWork &&
      !window.confirm(
        t("methods.recall.confirmClose"),
      )
    ) {
      return;
    }
    countdown.pause();
    onClose();
  };

  return (
    <section className="learning-mode" aria-labelledby={headingId}>
      <header className="learning-mode-header">
        <div className="learning-mode-heading">
          <p className="learning-eyebrow">{t("methods.recall.name")}</p>
          <h1 id={headingId}>{t("methods.recall.heading")}</h1>
          <p>
            {t("methods.recall.intro")}
          </p>
        </div>
        <button type="button" className="learning-close-button" onClick={closeMode}>
          {t("methods.close")}
        </button>
      </header>

      {phase === "setup" && (
        <div className="learning-form">
          <label className="learning-field">
            <span>{t("methods.recall.source")}</span>
            <select
              value={sourceKey}
              onChange={(event) => setSourceKey(event.target.value)}
              disabled={sourceOptions.length === 0}
              autoFocus
            >
              {sourceOptions.length === 0 && (
                <option value="">{t("methods.recall.noSource")}</option>
              )}
              {deckSources.length > 0 && (
                <optgroup label={t("methods.decks")}>
                  {deckSources.map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.isFallback ? t("methods.noDeck") : source.deck}
                    </option>
                  ))}
                </optgroup>
              )}
              {noteSources.length > 0 && (
                <optgroup label={t("methods.obsidianNotes")}>
                  {noteSources.map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.note.relativePath}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <fieldset className="learning-fieldset">
            <legend>{t("methods.duration")}</legend>
            <div className="learning-choice-group">
              {DURATION_OPTIONS.map((minutes) => (
                <label key={minutes} className="learning-choice">
                  <input
                    type="radio"
                    name="free-recall-duration"
                    value={minutes}
                    checked={durationMinutes === minutes}
                    onChange={() => setDurationMinutes(minutes)}
                  />
                  <span>{t("methods.minutes", { count: minutes })}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {sourceOptions.length === 0 && (
            <p className="learning-feedback" role="status">
              {t("methods.recall.needSource")}
            </p>
          )}

          <div className="learning-form-actions">
            <button
              type="button"
              className="learning-primary-button"
              onClick={startRecall}
              disabled={!selectedSource}
            >
              {t("methods.recall.start")}
            </button>
          </div>
        </div>
      )}

      {phase === "recall" && (
        <div className="learning-session">
          <div className="learning-session-status">
            <span
              className="learning-countdown"
              role="timer"
              aria-live="off"
              aria-label={countdownLabel(countdown.remainingSeconds)}
            >
              {formatCountdown(countdown.remainingSeconds)}
            </span>
            <span>{countdown.isRunning ? t("methods.recall.running") : t("methods.paused")}</span>
          </div>

          <label className="learning-field">
            <span>{t("methods.recall.prompt")}</span>
            <textarea
              ref={recallFieldRef}
              value={recallText}
              onChange={(event) => setRecallText(event.target.value)}
              maxLength={MAX_RECALL_LENGTH}
              rows={15}
              placeholder={t("methods.recall.placeholder")}
              aria-describedby={recallHintId}
              readOnly={!countdown.isRunning}
            />
            <small id={recallHintId}>
              {t("methods.recall.characters", { count: recallText.length, max: MAX_RECALL_LENGTH })}
            </small>
          </label>

          <div className="learning-form-actions">
            {countdown.isRunning ? (
              <button
                type="button"
                className="learning-secondary-button"
                onClick={countdown.pause}
              >
                {t("methods.pause")}
              </button>
            ) : (
              <button
                type="button"
                className="learning-secondary-button"
                onClick={countdown.start}
              >
                {t("methods.resume")}
              </button>
            )}
            <button
              type="button"
              className="learning-primary-button"
              onClick={completeRecall}
            >
              {t("methods.recall.finish")}
            </button>
          </div>
        </div>
      )}

      {phase === "compare" && sessionSource && (
        <div className="learning-comparison">
          <h3 ref={phaseHeadingRef} tabIndex={-1}>
            {t("methods.recall.compare")}
          </h3>

          <section className="learning-reference-block">
            <h4>{t("methods.recall.yourNotes")}</h4>
            <p className="learning-recall-text">
              {recallText.trim() || t("methods.recall.emptyNotes")}
            </p>
          </section>

          {sessionSource.type === "obsidian" && (
            <section className="learning-reference-block">
              <h4>{t("methods.recall.noteHeading", { path: sessionSource.note.relativePath })}</h4>
              <div className="learning-reference-text">
                {sessionSource.note.content || t("methods.recall.emptySource")}
              </div>
            </section>
          )}

          {sessionSource.type === "deck" && sessionCards.length > 0 && (
            <p className="learning-feedback">
              {t("methods.recall.compareDeck", {
                deck: sessionSource.isFallback ? t("methods.noDeck") : sessionSource.deck,
              })}
            </p>
          )}

          {sessionCards.length > 0 ? (
            <div className="learning-rating-list" aria-describedby={ratingHintId}>
              <p id={ratingHintId} className="learning-feedback">
                {t("methods.recall.ratingHint")}
              </p>
              {sessionCards.map((card) => (
                <article key={card.id} className="learning-rating-card">
                  <p className="learning-rating-question">{card.front}</p>
                  <p className="learning-rating-answer">{card.back}</p>
                  <fieldset className="learning-rating-options">
                    <legend>{t("methods.recall.ratePrompt")}</legend>
                    <button
                      type="button"
                      className="learning-rating-again"
                      aria-pressed={ratings[card.id] === "again"}
                      onClick={() =>
                        setRatings((current) => ({ ...current, [card.id]: "again" }))
                      }
                    >
                      {t("methods.rating.again")}
                    </button>
                    <button
                      type="button"
                      className="learning-rating-good"
                      aria-pressed={ratings[card.id] === "good"}
                      onClick={() =>
                        setRatings((current) => ({ ...current, [card.id]: "good" }))
                      }
                    >
                      {t("methods.rating.good")}
                    </button>
                  </fieldset>
                </article>
              ))}
            </div>
          ) : (
            <p className="learning-feedback" role="status">
              {t("methods.recall.noLinkedCards")}
            </p>
          )}

          <div className="learning-form-actions">
            <span className="learning-rating-progress" aria-live="polite">
              {sessionCards.length > 0
                ? t("methods.recall.rated", { count: ratedCards, total: sessionCards.length })
                : t("methods.recall.noCardsToRate")}
            </span>
            <button
              type="button"
              className="learning-primary-button"
              onClick={saveResult}
              disabled={!ratingsComplete}
            >
              {t("methods.saveResult")}
            </button>
          </div>
        </div>
      )}

      {phase === "saved" && (
        <div className="learning-completion" role="status">
          <h3 ref={phaseHeadingRef} tabIndex={-1}>
            {t("methods.recall.complete")}
          </h3>
          <p>
            {t("methods.recall.saved")}
          </p>
          <button type="button" className="learning-primary-button" onClick={closeMode}>
            {t("methods.done")}
          </button>
        </div>
      )}
    </section>
  );
}
