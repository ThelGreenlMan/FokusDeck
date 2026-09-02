import { useEffect, useMemo, useRef, useState } from "react";
import type { Flashcard } from "../../types";
import {
  reviewLearningCard,
  type ReviewRating,
} from "../../lib/learning";

export type AnswerMode = "mental" | "typed";

export interface DailySessionSnapshot {
  id: string;
  title: string;
  queueIds: string[];
  position: number;
  answerMode: AnswerMode;
  answers: Record<string, string>;
  ratings: Record<string, ReviewRating>;
  counts: Record<ReviewRating, number>;
  requeuedIds: string[];
  startedAt: string;
}

interface CardStudySessionProps {
  cards: Flashcard[];
  session: DailySessionSnapshot;
  onSessionChange: (session: DailySessionSnapshot | null) => void;
  onRateCard: (cardId: string, rating: ReviewRating) => void;
  onClose: () => void;
}

const ratingLabels: Record<ReviewRating, string> = {
  again: "Nochmal",
  hard: "Schwer",
  good: "Gut",
  easy: "Leicht",
};

function formatNextDue(card: Flashcard, rating: ReviewRating) {
  const now = new Date();
  const reviewed = reviewLearningCard(card, rating, now);
  const milliseconds = new Date(reviewed.learning.dueAt).getTime() - now.getTime();
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `in ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} Std.`;
  const days = Math.max(1, Math.round(hours / 24));
  return days === 1 ? "morgen" : `in ${days} Tagen`;
}

export function CardStudySession({
  cards,
  session,
  onSessionChange,
  onRateCard,
  onClose,
}: CardStudySessionProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [answer, setAnswer] = useState(
    () => session.answers[session.queueIds[session.position]] ?? "",
  );
  const questionRef = useRef<HTMLHeadingElement>(null);
  const ratingsRef = useRef<HTMLFieldSetElement>(null);
  const ratingLockedRef = useRef(false);
  const cardById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );
  const validQueue = session.queueIds.filter((id) => cardById.has(id));
  const position = session.queueIds
    .slice(0, session.position)
    .filter((id) => cardById.has(id)).length;
  const currentCard = cardById.get(validQueue[position]);
  const isComplete = position >= validQueue.length || !currentCard;

  useEffect(() => {
    ratingLockedRef.current = false;
    setIsRating(false);
    if (currentCard) questionRef.current?.focus();
  }, [currentCard?.id, position]);

  useEffect(() => {
    if (isRevealed) ratingsRef.current?.focus();
  }, [isRevealed]);

  const changeAnswer = (value: string) => {
    setAnswer(value);
    onSessionChange({
      ...session,
      answers: { ...session.answers, [currentCard?.id ?? ""]: value },
    });
  };

  const rate = (rating: ReviewRating) => {
    if (!currentCard || ratingLockedRef.current) return;
    ratingLockedRef.current = true;
    setIsRating(true);
    const shouldRequeue =
      rating === "again" && !session.requeuedIds.includes(currentCard.id);
    onRateCard(currentCard.id, rating);
    onSessionChange({
      ...session,
      queueIds: shouldRequeue
        ? [...validQueue, currentCard.id]
        : validQueue,
      position: position + 1,
      answers: {
        ...session.answers,
        [currentCard.id]: answer.trim().slice(0, 4_000),
      },
      ratings: { ...session.ratings, [currentCard.id]: rating },
      counts: {
        ...session.counts,
        [rating]: session.counts[rating] + 1,
      },
      requeuedIds: shouldRequeue
        ? [...session.requeuedIds, currentCard.id]
        : session.requeuedIds,
    });
    setAnswer("");
    setIsRevealed(false);
  };

  if (isComplete) {
    const total = Object.values(session.counts).reduce((sum, count) => sum + count, 0);
    const errorIds = Object.entries(session.ratings)
      .filter(([, rating]) => rating === "again" || rating === "hard")
      .map(([id]) => id)
      .filter((id) => cardById.has(id));

    return (
      <section className="learning-session learning-summary" aria-labelledby="daily-summary-heading">
        <p className="learning-eyebrow">Runde abgeschlossen</p>
        <h1 id="daily-summary-heading">Gut gearbeitet.</h1>
        <p>Deine Bewertungen planen automatisch die nächsten Wiederholungen.</p>
        <dl className="learning-summary-grid">
          <div><dt>Bearbeitet</dt><dd>{total}</dd></div>
          <div><dt>Gut oder leicht</dt><dd>{session.counts.good + session.counts.easy}</dd></div>
          <div><dt>Schwierig</dt><dd>{session.counts.hard}</dd></div>
          <div><dt>Nochmal</dt><dd>{session.counts.again}</dd></div>
        </dl>
        <div className="learning-form-actions">
          {errorIds.length > 0 && (
            <button
              type="button"
              className="learning-secondary-button"
              onClick={() =>
                onSessionChange({
                  id: `errors-${Date.now()}`,
                  title: "Fehler wiederholen",
                  queueIds: errorIds,
                  position: 0,
                  answerMode: session.answerMode,
                  answers: {},
                  ratings: {},
                  counts: { again: 0, hard: 0, good: 0, easy: 0 },
                  requeuedIds: [],
                  startedAt: new Date().toISOString(),
                })
              }
            >
              Fehler wiederholen
            </button>
          )}
          <button
            type="button"
            className="learning-primary-button"
            onClick={() => {
              onSessionChange(null);
              onClose();
            }}
          >
            Fertig
          </button>
        </div>
      </section>
    );
  }

  const progress = Math.round((position / validQueue.length) * 100);

  return (
    <section className="learning-session" aria-labelledby="study-question">
      <header className="learning-session-header">
        <div>
          <p className="learning-eyebrow">{session.title}</p>
          <span>{currentCard.deck} · Karte {position + 1} von {validQueue.length}</span>
        </div>
        <button type="button" className="learning-close-button" onClick={onClose}>
          Pausieren
        </button>
      </header>
      <progress value={progress} max="100" aria-label={`${progress} Prozent der Runde abgeschlossen`} />

      <article className="learning-question-card">
        <span className="learning-card-label">Frage</span>
        <h1 id="study-question" ref={questionRef} tabIndex={-1}>{currentCard.front}</h1>
      </article>

      {session.answerMode === "typed" && (
        <label className="learning-field">
          <span>Deine Antwort</span>
          <textarea
            rows={5}
            maxLength={4_000}
            value={answer}
            onChange={(event) => changeAnswer(event.target.value)}
            placeholder="Rufe die Antwort aus dem Gedächtnis ab …"
            disabled={isRevealed}
            autoFocus
          />
        </label>
      )}

      {!isRevealed ? (
        <button
          type="button"
          className="learning-primary-button learning-reveal-button"
          onClick={() => setIsRevealed(true)}
        >
          Antwort aufdecken
        </button>
      ) : (
        <>
          {session.answerMode === "typed" && answer.trim() && (
            <article className="learning-answer learning-answer--own">
              <span>Deine Antwort</span>
              <p>{answer}</p>
            </article>
          )}
          <article className="learning-answer">
            <span>Musterantwort</span>
            <p>{currentCard.back}</p>
          </article>
          <fieldset className="learning-ratings" ref={ratingsRef} tabIndex={-1}>
            <legend>Wie gut konntest du die Antwort abrufen?</legend>
            {(Object.keys(ratingLabels) as ReviewRating[]).map((rating) => (
              <button
                key={rating}
                type="button"
                className={`learning-rating learning-rating--${rating}`}
                onClick={() => rate(rating)}
                disabled={isRating}
              >
                <strong>{ratingLabels[rating]}</strong>
                <span>{formatNextDue(currentCard, rating)}</span>
              </button>
            ))}
          </fieldset>
        </>
      )}
    </section>
  );
}
