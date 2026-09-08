import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import { useSessionCountdown } from "../../hooks/useSessionCountdown";
import {
  interleaveDecks,
  scoreExam,
  type ExamJudgement,
  type ExamScore,
  type ReviewRating,
} from "../../lib/learning";
import type { Flashcard } from "../../types";
import { formatNumber, t, useI18n } from "../../i18n";

const TIME_LIMITS = [5, 10, 20, 30] as const;
const MAX_EXAM_CARDS = 30;
const MAX_TYPED_ANSWER_LENGTH = 4_000;
let fallbackIdCounter = 0;

type ExamPhase = "configuration" | "running" | "complete";
type ExamRating = Extract<ReviewRating, "good" | "hard" | "again">;

export interface ExamAnswerEntry {
  position: number;
  cardId: string;
  deck: string;
  question: string;
  expectedAnswer: string;
  givenAnswer: string;
  judgement: ExamJudgement;
  answeredAt: string | null;
}

export interface ExamEntry {
  id: string;
  startedAt: string;
  completedAt: string;
  selectedDecks: string[];
  cardCount: number;
  timeLimitMinutes: number;
  mixedTopics: boolean;
  timedOut: boolean;
  answers: ExamAnswerEntry[];
  score: ExamScore;
}

export interface ExamModeProps {
  cards: Flashcard[];
  isVisible: boolean;
  onRateCard: (cardId: string, rating: ExamRating) => void;
  onSave: (entry: ExamEntry) => void;
  onClose: () => void;
}

interface ExamConfiguration {
  selectedDecks: string[];
  timeLimitMinutes: number;
  mixedTopics: boolean;
}

function createId() {
  const secureId = globalThis.crypto?.randomUUID?.();
  if (secureId) return secureId;

  fallbackIdCounter += 1;
  return `exam-${Date.now()}-${fallbackIdCounter}`;
}

function collectDecks(cards: readonly Flashcard[], locale: string) {
  return Array.from(
    new Set(cards.map((card) => card.deck.trim() || "Ohne Stapel")),
  ).sort((first, second) => first.localeCompare(second, locale));
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return formatNumber(minutes, { minimumIntegerDigits: 2, useGrouping: false }) + ":" + formatNumber(seconds, { minimumIntegerDigits: 2, useGrouping: false });
}

function judgementLabel(judgement: ExamJudgement) {
  if (judgement === "correct") return t("methods.exam.correct");
  if (judgement === "partial") return t("methods.exam.partial");
  if (judgement === "incorrect") return t("methods.exam.incorrect");
  return t("methods.exam.unanswered");
}

function ratingFor(judgement: Exclude<ExamJudgement, "unanswered">): ExamRating {
  if (judgement === "correct") return "good";
  if (judgement === "partial") return "hard";
  return "again";
}

export function ExamMode({
  cards,
  isVisible,
  onRateCard,
  onSave,
  onClose,
}: ExamModeProps) {
  const { t, locale } = useI18n();
  const headingId = useId();
  const deckHintId = useId();
  const answerHintId = useId();
  const decks = useMemo(() => collectDecks(cards, locale), [cards, locale]);
  const [phase, setPhase] = useState<ExamPhase>("configuration");
  const [selectedDecks, setSelectedDecks] = useState<string[]>(() =>
    collectDecks(cards, locale),
  );
  const [cardCount, setCardCount] = useState(() =>
    Math.min(10, Math.max(1, cards.length)),
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(10);
  const [mixedTopics, setMixedTopics] = useState(true);
  const [configurationError, setConfigurationError] = useState("");
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [answers, setAnswers] = useState<ExamAnswerEntry[]>([]);
  const [result, setResult] = useState<ExamEntry | null>(null);
  const phaseHeadingRef = useRef<HTMLHeadingElement>(null);
  const answerFieldRef = useRef<HTMLTextAreaElement>(null);
  const ratingsRef = useRef<HTMLFieldSetElement>(null);

  const countdown = useSessionCountdown(timeLimitMinutes * 60);
  const queueRef = useRef<Flashcard[]>([]);
  const currentIndexRef = useRef(0);
  const typedAnswerRef = useRef("");
  const answersRef = useRef<ExamAnswerEntry[]>([]);
  const startedAtRef = useRef("");
  const sessionIdRef = useRef("");
  const configurationRef = useRef<ExamConfiguration>({
    selectedDecks: [],
    timeLimitMinutes: 10,
    mixedTopics: true,
  });
  const finalizedRef = useRef(false);
  const ratedCardIdsRef = useRef(new Set<string>());
  const savedSessionIdsRef = useRef(new Set<string>());
  const pausedForVisibilityRef = useRef(false);

  useEffect(() => {
    setSelectedDecks((current) =>
      current.filter((deck) => decks.includes(deck)),
    );
  }, [decks]);

  const availableCards = useMemo(() => {
    const selected = new Set(selectedDecks);
    const seen = new Set<string>();
    return cards.filter((card) => {
      const deck = card.deck.trim() || "Ohne Stapel";
      if (!selected.has(deck) || !card.id.trim() || seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
  }, [cards, selectedDecks]);

  const maximumCardCount = Math.min(MAX_EXAM_CARDS, availableCards.length);
  const currentCard = queue[currentIndex];
  const progress = queue.length
    ? Math.round((answers.length / queue.length) * 100)
    : 0;

  useEffect(() => {
    setCardCount((current) =>
      Math.min(Math.max(1, current), Math.max(1, maximumCardCount)),
    );
  }, [maximumCardCount]);

  const rateOnce = useCallback(
    (cardId: string, rating: ExamRating) => {
      if (ratedCardIdsRef.current.has(cardId)) return false;
      ratedCardIdsRef.current.add(cardId);
      onRateCard(cardId, rating);
      return true;
    },
    [onRateCard],
  );

  const finishExam = useCallback(
    (finalAnswers: ExamAnswerEntry[], timedOut: boolean) => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      countdown.pause();

      const completedAt = new Date().toISOString();
      const activeConfiguration = configurationRef.current;
      for (const answer of finalAnswers) {
        rateOnce(
          answer.cardId,
          answer.judgement === "unanswered"
            ? "again"
            : ratingFor(answer.judgement),
        );
      }
      const score = scoreExam(
        finalAnswers.map((answer) => ({
          cardId: answer.cardId,
          judgement: answer.judgement,
        })),
      );
      const entry: ExamEntry = {
        id: sessionIdRef.current,
        startedAt: startedAtRef.current,
        completedAt,
        selectedDecks: activeConfiguration.selectedDecks,
        cardCount: queueRef.current.length,
        timeLimitMinutes: activeConfiguration.timeLimitMinutes,
        mixedTopics: activeConfiguration.mixedTopics,
        timedOut,
        answers: finalAnswers,
        score,
      };

      answersRef.current = finalAnswers;
      setAnswers(finalAnswers);
      setResult(entry);
      setPhase("complete");

      if (!savedSessionIdsRef.current.has(entry.id)) {
        savedSessionIdsRef.current.add(entry.id);
        onSave(entry);
      }
    },
    [countdown, onSave, rateOnce],
  );

  const finishAfterTimeout = useCallback(() => {
    if (finalizedRef.current || queueRef.current.length === 0) return;

    const existingAnswers = answersRef.current;
    const answeredIds = new Set(existingAnswers.map((answer) => answer.cardId));
    const activeIndex = currentIndexRef.current;
    const unfinished = queueRef.current
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => !answeredIds.has(card.id))
      .map(({ card, index }): ExamAnswerEntry => {
        return {
          position: index + 1,
          cardId: card.id,
          deck: card.deck,
          question: card.front,
          expectedAnswer: card.back,
          givenAnswer:
            index === activeIndex
              ? typedAnswerRef.current.trim().slice(0, MAX_TYPED_ANSWER_LENGTH)
              : "",
          judgement: "unanswered",
          answeredAt: null,
        };
      });

    finishExam([...existingAnswers, ...unfinished], true);
  }, [finishExam]);

  useEffect(() => {
    if (phase === "running" && countdown.isFinished) {
      finishAfterTimeout();
    }
  }, [countdown.isFinished, finishAfterTimeout, phase]);

  useEffect(() => {
    if (phase !== "running") {
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

  useEffect(() => {
    if (phase === "running" && !isRevealed) answerFieldRef.current?.focus();
  }, [currentIndex, isRevealed, phase]);

  useEffect(() => {
    if (phase === "running" && isRevealed) ratingsRef.current?.focus();
  }, [isRevealed, phase]);

  useEffect(() => {
    if (phase !== "running") phaseHeadingRef.current?.focus();
  }, [phase]);

  const toggleDeck = (deck: string, checked: boolean) => {
    setSelectedDecks((current) =>
      checked
        ? decks.filter((candidate) => candidate === deck || current.includes(candidate))
        : current.filter((candidate) => candidate !== deck),
    );
    setConfigurationError("");
  };

  const startExam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedDecks.length === 0) {
      setConfigurationError("methods.exam.selectDeckError");
      return;
    }
    if (availableCards.length === 0) {
      setConfigurationError("methods.exam.noCardsError");
      return;
    }

    const selectedInDeckOrder = decks.filter((deck) => selectedDecks.includes(deck));
    const requestedCardCount = Math.min(
      Math.max(1, Math.floor(cardCount)),
      maximumCardCount,
    );
    const startedAt = new Date().toISOString();
    const seed =
      "exam:" +
      startedAt +
      ":" +
      selectedInDeckOrder.join("|") +
      ":" +
      requestedCardCount;
    const nextQueue = mixedTopics
      ? interleaveDecks(availableCards, seed, requestedCardCount)
      : selectedInDeckOrder
          .flatMap((deck) =>
            interleaveDecks(
              availableCards.filter(
                (card) => (card.deck.trim() || "Ohne Stapel") === deck,
              ),
              seed + ":" + deck,
            ),
          )
          .slice(0, requestedCardCount);

    const sessionId = createId();
    const activeConfiguration: ExamConfiguration = {
      selectedDecks: selectedInDeckOrder,
      timeLimitMinutes,
      mixedTopics,
    };

    queueRef.current = nextQueue;
    currentIndexRef.current = 0;
    typedAnswerRef.current = "";
    answersRef.current = [];
    startedAtRef.current = startedAt;
    sessionIdRef.current = sessionId;
    configurationRef.current = activeConfiguration;
    finalizedRef.current = false;
    ratedCardIdsRef.current.clear();

    setConfigurationError("");
    setQueue(nextQueue);
    setCurrentIndex(0);
    setTypedAnswer("");
    setIsRevealed(false);
    setAnswers([]);
    setResult(null);
    setPhase("running");
    countdown.start();
  };

  const assessCurrentAnswer = (
    judgement: Exclude<ExamJudgement, "unanswered">,
  ) => {
    const activeCard = queueRef.current[currentIndexRef.current];
    if (!activeCard || !isRevealed || finalizedRef.current) return;
    if (answersRef.current.some((answer) => answer.cardId === activeCard.id)) return;

    const answeredAt = new Date().toISOString();
    const answer: ExamAnswerEntry = {
      position: currentIndexRef.current + 1,
      cardId: activeCard.id,
      deck: activeCard.deck,
      question: activeCard.front,
      expectedAnswer: activeCard.back,
      givenAnswer: typedAnswerRef.current
        .trim()
        .slice(0, MAX_TYPED_ANSWER_LENGTH),
      judgement,
      answeredAt,
    };
    const nextAnswers = [...answersRef.current, answer];
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);

    if (nextAnswers.length >= queueRef.current.length) {
      finishExam(nextAnswers, false);
      return;
    }

    const nextIndex = currentIndexRef.current + 1;
    currentIndexRef.current = nextIndex;
    typedAnswerRef.current = "";
    setCurrentIndex(nextIndex);
    setTypedAnswer("");
    setIsRevealed(false);
  };

  const changeTypedAnswer = (value: string) => {
    const limited = value.slice(0, MAX_TYPED_ANSWER_LENGTH);
    typedAnswerRef.current = limited;
    setTypedAnswer(limited);
  };

  const returnToConfiguration = () => {
    countdown.reset();
    queueRef.current = [];
    answersRef.current = [];
    typedAnswerRef.current = "";
    finalizedRef.current = false;
    ratedCardIdsRef.current.clear();
    setQueue([]);
    setAnswers([]);
    setTypedAnswer("");
    setIsRevealed(false);
    setCurrentIndex(0);
    setResult(null);
    setPhase("configuration");
  };

  const closeMode = () => {
    countdown.pause();
    onClose();
  };

  if (phase === "configuration") {
    return (
      <section className="learning-exam" aria-labelledby={headingId}>
        <header className="learning-mode-header">
          <div className="learning-mode-heading">
            <p className="learning-eyebrow">{t("methods.exam.name")}</p>
            <h1 id={headingId} ref={phaseHeadingRef} tabIndex={-1}>{t("methods.exam.configure")}</h1>
            <p>
              {t("methods.exam.intro")}
            </p>
          </div>
          <button
            type="button"
            className="learning-close-button"
            onClick={closeMode}
          >
            {t("methods.close")}
          </button>
        </header>

        {cards.length === 0 ? (
          <div className="learning-empty-state" role="status">
            <h3>{t("methods.exam.emptyHeading")}</h3>
            <p>{t("methods.exam.emptyHint")}</p>
          </div>
        ) : (
          <form className="learning-form" onSubmit={startExam}>
            <fieldset
              className="learning-deck-selection"
              aria-describedby={deckHintId}
            >
              <legend>{t("methods.exam.chooseDecks")}</legend>
              <p id={deckHintId}>
                {t("methods.exam.deckHint")}
              </p>
              <div className="learning-selection-actions">
                <button
                  type="button"
                  className="learning-text-button"
                  onClick={() => {
                    setSelectedDecks(decks);
                    setConfigurationError("");
                  }}
                >
                  {t("methods.selectAll")}
                </button>
                <button
                  type="button"
                  className="learning-text-button"
                  onClick={() => setSelectedDecks([])}
                >
                  {t("methods.deselectAll")}
                </button>
              </div>
              <div className="learning-deck-options">
                {decks.map((deck) => {
                  const deckCardCount = cards.filter(
                    (card) => (card.deck.trim() || "Ohne Stapel") === deck,
                  ).length;
                  return (
                    <label className="learning-check-option" key={deck}>
                      <input
                        type="checkbox"
                        checked={selectedDecks.includes(deck)}
                        onChange={(event) => toggleDeck(deck, event.target.checked)}
                      />
                      <span>{deck === "Ohne Stapel" && !cards.some((card) => card.deck.trim() === deck)
                        ? t("methods.noDeck")
                        : deck}</span>
                      <small>
                        {t("methods.cards", { count: deckCardCount })}
                      </small>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="learning-exam-options">
              <label className="learning-field">
                <span>{t("methods.exam.cardCount")}</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, maximumCardCount)}
                  step={1}
                  value={cardCount}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setCardCount(
                      Number.isFinite(value)
                        ? Math.min(
                            Math.max(1, maximumCardCount),
                            Math.max(1, Math.floor(value)),
                          )
                        : 1,
                    );
                    setConfigurationError("");
                  }}
                  required
                />
                <small>
                  {t("methods.exam.availableCards", { count: availableCards.length, max: MAX_EXAM_CARDS })}
                </small>
              </label>

              <label className="learning-field">
                <span>{t("methods.exam.timeLimit")}</span>
                <select
                  value={timeLimitMinutes}
                  onChange={(event) =>
                    setTimeLimitMinutes(Number(event.target.value))
                  }
                >
                  {TIME_LIMITS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {t("methods.minutes", { count: minutes })}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="learning-check-option learning-check-option--wide">
              <input
                type="checkbox"
                checked={mixedTopics}
                onChange={(event) => setMixedTopics(event.target.checked)}
              />
              <span>
                <strong>{t("methods.exam.mix")}</strong>
                <small>
                  {t("methods.exam.mixHint")}
                </small>
              </span>
            </label>

            {configurationError && (
              <p className="learning-form-error" role="alert">
                {t(configurationError)}
              </p>
            )}

            <div className="learning-form-actions">
              <button
                type="submit"
                className="learning-primary-button"
                disabled={availableCards.length === 0}
              >
                {t("methods.exam.start")}
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  if (phase === "complete" && result) {
    const errorAnswers = result.answers.filter(
      (answer) => answer.judgement !== "correct",
    );
    return (
      <section className="learning-exam learning-exam--complete" aria-labelledby={headingId}>
        <header className="learning-mode-header">
          <div className="learning-mode-heading">
            <p className="learning-eyebrow">{t("methods.exam.complete")}</p>
            <h1 id={headingId} ref={phaseHeadingRef} tabIndex={-1}>
              {result.score.passed ? t("methods.exam.passed") : t("methods.exam.keepPractising")}
            </h1>
            <p role="status">
              {t("methods.exam.score", { earned: result.score.earnedPoints, maximum: result.score.maximumPoints, percentage: result.score.percentage })}
            </p>
          </div>
          <button
            type="button"
            className="learning-close-button"
            onClick={closeMode}
          >
            {t("methods.close")}
          </button>
        </header>

        {result.timedOut && (
          <p className="learning-timeout-notice" role="status">
            {t("methods.exam.timedOut")}
          </p>
        )}

        <dl className="learning-summary-grid">
          <div>
            <dt>{t("methods.exam.correct")}</dt>
            <dd>{formatNumber(result.score.correct)}</dd>
          </div>
          <div>
            <dt>{t("methods.exam.partialShort")}</dt>
            <dd>{formatNumber(result.score.partial)}</dd>
          </div>
          <div>
            <dt>{t("methods.exam.incorrect")}</dt>
            <dd>{formatNumber(result.score.incorrect)}</dd>
          </div>
          <div>
            <dt>{t("methods.exam.remaining")}</dt>
            <dd>{formatNumber(result.score.unanswered)}</dd>
          </div>
        </dl>

        <section className="learning-error-analysis" aria-labelledby={headingId + "-errors"}>
          <h3 id={headingId + "-errors"}>{t("methods.exam.errors")}</h3>
          {errorAnswers.length === 0 ? (
            <p>{t("methods.exam.allCorrect")}</p>
          ) : (
            <ol className="learning-answer-list">
              {errorAnswers.map((answer) => (
                <li
                  className="learning-answer-review learning-answer-review--error"
                  key={answer.cardId}
                >
                  <header>
                    <strong>{answer.question}</strong>
                    <span>{judgementLabel(answer.judgement)}</span>
                  </header>
                  <p>
                    <b>{t("methods.yourAnswerColon")}</b>{" "}
                    {answer.givenAnswer || t("methods.exam.noAnswer")}
                  </p>
                  <p>
                    <b>{t("methods.exam.modelAnswerColon")}</b> {answer.expectedAnswer}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <details className="learning-all-answers">
          <summary>{t("methods.exam.showAll")}</summary>
          <ol className="learning-answer-list">
            {result.answers.map((answer) => (
              <li className="learning-answer-review" key={answer.cardId}>
                <header>
                  <strong>
                    {formatNumber(answer.position)}. {answer.question}
                  </strong>
                  <span>{judgementLabel(answer.judgement)}</span>
                </header>
                <p>
                  <b>{t("methods.yourAnswerColon")}</b>{" "}
                  {answer.givenAnswer || t("methods.exam.noAnswer")}
                </p>
                <p>
                  <b>{t("methods.exam.modelAnswerColon")}</b> {answer.expectedAnswer}
                </p>
              </li>
            ))}
          </ol>
        </details>

        <p className="learning-save-confirmation">
          {t("methods.exam.saved")}
        </p>
        <div className="learning-form-actions">
          <button
            type="button"
            className="learning-secondary-button"
            onClick={returnToConfiguration}
          >
            {t("methods.exam.new")}
          </button>
          <button
            type="button"
            className="learning-primary-button"
            onClick={closeMode}
          >
            {t("methods.done")}
          </button>
        </div>
      </section>
    );
  }

  if (!currentCard) return null;

  return (
    <section className="learning-exam learning-exam--running" aria-labelledby={headingId}>
      <header className="learning-session-header">
        <div>
          <p className="learning-eyebrow">{t("methods.exam.name")}</p>
          <h1 id={headingId}>{t("methods.exam.position", { position: currentIndex + 1, total: queue.length })}</h1>
        </div>
        <div className="learning-exam-clock">
          <span>{t("methods.exam.timeRemaining")}</span>
          <time role="timer" aria-live="off">
            {formatTime(countdown.remainingSeconds)}
          </time>
        </div>
      </header>

      <progress
        className="learning-progress"
        value={progress}
        max="100"
        aria-label={t("methods.exam.progress", { count: progress })}
      />

      <article className="learning-question-card">
        <span className="learning-card-label">{currentCard.deck}</span>
        <h3>{currentCard.front}</h3>
      </article>

      <label className="learning-field">
        <span>{t("methods.yourAnswer")}</span>
        <textarea
          ref={answerFieldRef}
          value={typedAnswer}
          onChange={(event) => changeTypedAnswer(event.target.value)}
          maxLength={MAX_TYPED_ANSWER_LENGTH}
          rows={7}
          placeholder={t("methods.exam.placeholder")}
          readOnly={isRevealed}
          aria-describedby={answerHintId}
          autoFocus
          required
        />
        <small id={answerHintId}>
          {t("methods.characters", { count: typedAnswer.length, max: MAX_TYPED_ANSWER_LENGTH })}
        </small>
      </label>

      {!isRevealed ? (
        <button
          type="button"
          className="learning-primary-button learning-reveal-button"
          onClick={() => setIsRevealed(true)}
          disabled={!typedAnswer.trim() || countdown.isFinished}
        >
          {t("methods.exam.reveal")}
        </button>
      ) : (
        <>
          <article className="learning-answer learning-answer--own">
            <span>{t("methods.yourAnswer")}</span>
            <p>{typedAnswer}</p>
          </article>
          <article className="learning-answer">
            <span>{t("methods.exam.modelAnswer")}</span>
            <p>{currentCard.back}</p>
          </article>

          <fieldset className="learning-ratings" ref={ratingsRef} tabIndex={-1}>
            <legend>{t("methods.exam.ratePrompt")}</legend>
            <button
              type="button"
              className="learning-rating learning-rating--good"
              onClick={() => assessCurrentAnswer("correct")}
              disabled={countdown.isFinished}
            >
              <strong>{t("methods.exam.correct")}</strong>
              <span>{t("methods.exam.correctHint")}</span>
            </button>
            <button
              type="button"
              className="learning-rating learning-rating--hard"
              onClick={() => assessCurrentAnswer("partial")}
              disabled={countdown.isFinished}
            >
              <strong>{t("methods.exam.partial")}</strong>
              <span>{t("methods.exam.partialHint")}</span>
            </button>
            <button
              type="button"
              className="learning-rating learning-rating--again"
              onClick={() => assessCurrentAnswer("incorrect")}
              disabled={countdown.isFinished}
            >
              <strong>{t("methods.exam.incorrect")}</strong>
              <span>{t("methods.exam.incorrectHint")}</span>
            </button>
          </fieldset>
        </>
      )}

      <button
        type="button"
        className="learning-close-button"
        onClick={closeMode}
      >
        {t("methods.exam.cancel")}
      </button>
    </section>
  );
}
