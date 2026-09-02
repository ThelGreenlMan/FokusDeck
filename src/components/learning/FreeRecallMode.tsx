import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Flashcard } from "../../types";
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

function buildSourceOptions(cards: Flashcard[], notes: VaultNote[]) {
  const decks = Array.from(new Set(cards.map(normalizedDeck))).sort((first, second) =>
    first.localeCompare(second, "de-DE"),
  );
  const uniqueNotes = Array.from(
    new Map(notes.map((note) => [note.relativePath, note])).values(),
  ).sort((first, second) =>
    first.relativePath.localeCompare(second.relativePath, "de-DE"),
  );

  return [
    ...decks.map(
      (deck): DeckSourceOption => ({ key: `deck:${deck}`, type: "deck", deck }),
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
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function countdownLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} ${minutes === 1 ? "Minute" : "Minuten"} und ${seconds} ${
    seconds === 1 ? "Sekunde" : "Sekunden"
  } verbleibend`;
}

export function FreeRecallMode({
  cards,
  notes,
  isVisible,
  onSave,
  onRateCard,
  onClose,
}: FreeRecallModeProps) {
  const headingId = useId();
  const recallHintId = useId();
  const ratingHintId = useId();
  const sourceOptions = useMemo(
    () => buildSourceOptions(cards, notes),
    [cards, notes],
  );
  const [sourceKey, setSourceKey] = useState(
    () => buildSourceOptions(cards, notes)[0]?.key ?? "",
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
        "Freies Erinnern beenden und ungespeicherten Text sowie Bewertungen verwerfen?",
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
          <p className="learning-eyebrow">Freies Erinnern</p>
          <h1 id={headingId}>Schreibe dein Wissen aus dem Kopf auf</h1>
          <p>
            Während der Erinnerungsphase bleibt die Quelle verborgen. Danach
            vergleichst und bewertest du dich selbst – FokusDeck bewertet deinen Text
            nicht automatisch.
          </p>
        </div>
        <button type="button" className="learning-close-button" onClick={closeMode}>
          Modus schließen
        </button>
      </header>

      {phase === "setup" && (
        <div className="learning-form">
          <label className="learning-field">
            <span>Quelle zum Vergleichen</span>
            <select
              value={sourceKey}
              onChange={(event) => setSourceKey(event.target.value)}
              disabled={sourceOptions.length === 0}
              autoFocus
            >
              {sourceOptions.length === 0 && (
                <option value="">Keine Quelle verfügbar</option>
              )}
              {deckSources.length > 0 && (
                <optgroup label="Stapel">
                  {deckSources.map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.deck}
                    </option>
                  ))}
                </optgroup>
              )}
              {noteSources.length > 0 && (
                <optgroup label="Obsidian-Notizen">
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
            <legend>Dauer</legend>
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
                  <span>{minutes} Minuten</span>
                </label>
              ))}
            </div>
          </fieldset>

          {sourceOptions.length === 0 && (
            <p className="learning-feedback" role="status">
              Erstelle zuerst Karteikarten oder verbinde einen Obsidian-Tresor.
            </p>
          )}

          <div className="learning-form-actions">
            <button
              type="button"
              className="learning-primary-button"
              onClick={startRecall}
              disabled={!selectedSource}
            >
              Erinnerungsphase starten
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
            <span>{countdown.isRunning ? "Erinnerungszeit läuft" : "Pausiert"}</span>
          </div>

          <label className="learning-field">
            <span>Was weißt du noch?</span>
            <textarea
              ref={recallFieldRef}
              value={recallText}
              onChange={(event) => setRecallText(event.target.value)}
              maxLength={MAX_RECALL_LENGTH}
              rows={15}
              placeholder="Schreibe Begriffe, Zusammenhänge und Beispiele auf, an die du dich erinnerst."
              aria-describedby={recallHintId}
              readOnly={!countdown.isRunning}
            />
            <small id={recallHintId}>
              Die Quelle wird erst nach dem Abschließen eingeblendet. {recallText.length}
              /{MAX_RECALL_LENGTH} Zeichen
            </small>
          </label>

          <div className="learning-form-actions">
            {countdown.isRunning ? (
              <button
                type="button"
                className="learning-secondary-button"
                onClick={countdown.pause}
              >
                Pausieren
              </button>
            ) : (
              <button
                type="button"
                className="learning-secondary-button"
                onClick={countdown.start}
              >
                Fortsetzen
              </button>
            )}
            <button
              type="button"
              className="learning-primary-button"
              onClick={completeRecall}
            >
              Erinnern abschließen
            </button>
          </div>
        </div>
      )}

      {phase === "compare" && sessionSource && (
        <div className="learning-comparison">
          <h3 ref={phaseHeadingRef} tabIndex={-1}>
            Vergleiche deine Erinnerung mit der Quelle
          </h3>

          <section className="learning-reference-block">
            <h4>Deine Notizen</h4>
            <p className="learning-recall-text">
              {recallText.trim() || "Du hast in dieser Runde nichts notiert."}
            </p>
          </section>

          {sessionSource.type === "obsidian" && (
            <section className="learning-reference-block">
              <h4>Obsidian-Notiz · {sessionSource.note.relativePath}</h4>
              <div className="learning-reference-text">
                {sessionSource.note.content || "Diese Notiz enthält keinen Text."}
              </div>
            </section>
          )}

          {sessionSource.type === "deck" && sessionCards.length > 0 && (
            <p className="learning-feedback">
              Vergleiche deine Notizen mit den Antworten aus dem Stapel
              „{sessionSource.deck}“.
            </p>
          )}

          {sessionCards.length > 0 ? (
            <div className="learning-rating-list" aria-describedby={ratingHintId}>
              <p id={ratingHintId} className="learning-feedback">
                Bewerte jeden Wissenspunkt. Deine Auswahl wird erst beim Speichern in
                den Wiederholplan übernommen.
              </p>
              {sessionCards.map((card) => (
                <article key={card.id} className="learning-rating-card">
                  <p className="learning-rating-question">{card.front}</p>
                  <p className="learning-rating-answer">{card.back}</p>
                  <fieldset className="learning-rating-options">
                    <legend>Wie gut hast du dich an diesen Punkt erinnert?</legend>
                    <button
                      type="button"
                      className="learning-rating-again"
                      aria-pressed={ratings[card.id] === "again"}
                      onClick={() =>
                        setRatings((current) => ({ ...current, [card.id]: "again" }))
                      }
                    >
                      Nochmal
                    </button>
                    <button
                      type="button"
                      className="learning-rating-good"
                      aria-pressed={ratings[card.id] === "good"}
                      onClick={() =>
                        setRatings((current) => ({ ...current, [card.id]: "good" }))
                      }
                    >
                      Gut
                    </button>
                  </fieldset>
                </article>
              ))}
            </div>
          ) : (
            <p className="learning-feedback" role="status">
              Zu dieser Quelle gibt es keine direkt zugeordneten Karteikarten. Du
              kannst das Ergebnis trotzdem speichern.
            </p>
          )}

          <div className="learning-form-actions">
            <span className="learning-rating-progress" aria-live="polite">
              {sessionCards.length > 0
                ? `${ratedCards} von ${sessionCards.length} Karten bewertet`
                : "Keine Karten zu bewerten"}
            </span>
            <button
              type="button"
              className="learning-primary-button"
              onClick={saveResult}
              disabled={!ratingsComplete}
            >
              Ergebnis speichern
            </button>
          </div>
        </div>
      )}

      {phase === "saved" && (
        <div className="learning-completion" role="status">
          <h3 ref={phaseHeadingRef} tabIndex={-1}>
            Freies Erinnern abgeschlossen
          </h3>
          <p>
            Dein Ergebnis wurde lokal gespeichert und deine Kartenbewertungen wurden
            in den Wiederholplan übernommen.
          </p>
          <button type="button" className="learning-primary-button" onClick={closeMode}>
            Fertig
          </button>
        </div>
      )}
    </section>
  );
}
