import { useEffect, useMemo, useRef, useState } from "react";
import type { Flashcard } from "../../types";
import { formatNumber, t, useI18n } from "../../i18n";
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
  again: "methods.rating.again",
  hard: "methods.rating.hard",
  good: "methods.rating.good",
  easy: "methods.rating.easy",
};

function formatNextDue(card: Flashcard, rating: ReviewRating) {
  const now = new Date();
  const reviewed = reviewLearningCard(card, rating, now);
  const milliseconds = new Date(reviewed.learning.dueAt).getTime() - now.getTime();
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) return t("methods.due.minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("methods.due.hours", { count: hours });
  const days = Math.max(1, Math.round(hours / 24));
  return days === 1 ? t("methods.due.tomorrow") : t("methods.due.days", { count: days });
}

/** Translate only known app-generated titles; custom saved titles stay untouched. */
export function displaySessionTitle(title: string) {
  const keys: Record<string, string> = {
    "Heutige Runde": "methods.session.title.daily",
    "Today's round": "methods.session.title.daily",
    "5-Minuten-Training": "methods.session.title.short",
    "5-minute practice": "methods.session.title.short",
    "Fehlerkarten": "methods.session.title.errors",
    "Difficult cards": "methods.session.title.errors",
    "Fehler wiederholen": "methods.session.title.reviewErrors",
    "Review mistakes": "methods.session.title.reviewErrors",
  };
  return Object.hasOwn(keys, title) ? t(keys[title]) : title;
}

export function CardStudySession({
  cards,
  session,
  onSessionChange,
  onRateCard,
  onClose,
}: CardStudySessionProps) {
  const { t } = useI18n();
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
        <p className="learning-eyebrow">{t("methods.session.complete")}</p>
        <h1 id="daily-summary-heading">{t("methods.session.wellDone")}</h1>
        <p>{t("methods.session.scheduled")}</p>
        <dl className="learning-summary-grid">
          <div><dt>{t("methods.session.reviewed")}</dt><dd>{formatNumber(total)}</dd></div>
          <div><dt>{t("methods.session.goodOrEasy")}</dt><dd>{formatNumber(session.counts.good + session.counts.easy)}</dd></div>
          <div><dt>{t("methods.session.difficult")}</dt><dd>{formatNumber(session.counts.hard)}</dd></div>
          <div><dt>{t("methods.rating.again")}</dt><dd>{formatNumber(session.counts.again)}</dd></div>
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
              {t("methods.session.title.reviewErrors")}
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
            {t("methods.done")}
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
          <p className="learning-eyebrow">{displaySessionTitle(session.title)}</p>
          <span>{currentCard.deck} · {t("methods.session.position", { position: position + 1, total: validQueue.length })}</span>
        </div>
        <button type="button" className="learning-close-button" onClick={onClose}>
          {t("methods.pause")}
        </button>
      </header>
      <progress value={progress} max="100" aria-label={t("methods.session.progress", { count: progress })} />

      <article className="learning-question-card">
        <span className="learning-card-label">{t("methods.question")}</span>
        <h1 id="study-question" ref={questionRef} tabIndex={-1}>{currentCard.front}</h1>
      </article>

      {session.answerMode === "typed" && (
        <label className="learning-field">
          <span>{t("methods.yourAnswer")}</span>
          <textarea
            rows={5}
            maxLength={4_000}
            value={answer}
            onChange={(event) => changeAnswer(event.target.value)}
            placeholder={t("methods.session.placeholder")}
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
          {t("methods.session.reveal")}
        </button>
      ) : (
        <>
          {session.answerMode === "typed" && answer.trim() && (
            <article className="learning-answer learning-answer--own">
              <span>{t("methods.yourAnswer")}</span>
              <p>{answer}</p>
            </article>
          )}
          <article className="learning-answer">
            <span>{t("methods.modelAnswer")}</span>
            <p>{currentCard.back}</p>
          </article>
          <fieldset className="learning-ratings" ref={ratingsRef} tabIndex={-1}>
            <legend>{t("methods.session.ratePrompt")}</legend>
            {(Object.keys(ratingLabels) as ReviewRating[]).map((rating) => (
              <button
                key={rating}
                type="button"
                className={`learning-rating learning-rating--${rating}`}
                onClick={() => rate(rating)}
                disabled={isRating}
              >
                <strong>{t(ratingLabels[rating])}</strong>
                <span>{formatNextDue(currentCard, rating)}</span>
              </button>
            ))}
          </fieldset>
        </>
      )}
    </section>
  );
}
