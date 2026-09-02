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

function collectDecks(cards: readonly Flashcard[]) {
  return Array.from(
    new Set(cards.map((card) => card.deck.trim() || "Ohne Stapel")),
  ).sort((first, second) => first.localeCompare(second, "de-DE"));
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function judgementLabel(judgement: ExamJudgement) {
  if (judgement === "correct") return "Richtig";
  if (judgement === "partial") return "Teilweise richtig";
  if (judgement === "incorrect") return "Falsch";
  return "Nicht beantwortet";
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
  const headingId = useId();
  const deckHintId = useId();
  const answerHintId = useId();
  const decks = useMemo(() => collectDecks(cards), [cards]);
  const [phase, setPhase] = useState<ExamPhase>("configuration");
  const [selectedDecks, setSelectedDecks] = useState<string[]>(() =>
    collectDecks(cards),
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
      setConfigurationError("Wähle mindestens einen Stapel aus.");
      return;
    }
    if (availableCards.length === 0) {
      setConfigurationError("Die gewählten Stapel enthalten keine nutzbaren Karten.");
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
            <p className="learning-eyebrow">Prüfungsmodus</p>
            <h1 id={headingId} ref={phaseHeadingRef} tabIndex={-1}>Prüfung zusammenstellen</h1>
            <p>
              Beantworte zufällige Karten schriftlich und bewerte dich anschließend
              ehrlich anhand der Musterlösung.
            </p>
          </div>
          <button
            type="button"
            className="learning-close-button"
            onClick={closeMode}
          >
            Modus schließen
          </button>
        </header>

        {cards.length === 0 ? (
          <div className="learning-empty-state" role="status">
            <h3>Noch keine Prüfung möglich</h3>
            <p>Lege zuerst Karteikarten an oder importiere eine Sammlung.</p>
          </div>
        ) : (
          <form className="learning-form" onSubmit={startExam}>
            <fieldset
              className="learning-deck-selection"
              aria-describedby={deckHintId}
            >
              <legend>Stapel auswählen</legend>
              <p id={deckHintId}>
                Du kannst einen oder mehrere Stapel in derselben Prüfung verwenden.
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
                  Alle auswählen
                </button>
                <button
                  type="button"
                  className="learning-text-button"
                  onClick={() => setSelectedDecks([])}
                >
                  Auswahl aufheben
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
                      <span>{deck}</span>
                      <small>
                        {deckCardCount} {deckCardCount === 1 ? "Karte" : "Karten"}
                      </small>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="learning-exam-options">
              <label className="learning-field">
                <span>Anzahl der Karten</span>
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
                  {availableCards.length} Karten in der aktuellen Auswahl verfügbar,
                  maximal {MAX_EXAM_CARDS} pro Prüfung.
                </small>
              </label>

              <label className="learning-field">
                <span>Zeitlimit</span>
                <select
                  value={timeLimitMinutes}
                  onChange={(event) =>
                    setTimeLimitMinutes(Number(event.target.value))
                  }
                >
                  {TIME_LIMITS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} Minuten
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
                <strong>Themen mischen</strong>
                <small>
                  Karten aus verschiedenen Stapeln wechseln sich möglichst ab.
                </small>
              </span>
            </label>

            {configurationError && (
              <p className="learning-form-error" role="alert">
                {configurationError}
              </p>
            )}

            <div className="learning-form-actions">
              <button
                type="submit"
                className="learning-primary-button"
                disabled={availableCards.length === 0}
              >
                Prüfung starten
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
            <p className="learning-eyebrow">Prüfung abgeschlossen</p>
            <h1 id={headingId} ref={phaseHeadingRef} tabIndex={-1}>
              {result.score.passed ? "Bestanden" : "Weiter üben"}
            </h1>
            <p role="status">
              {result.score.earnedPoints.toLocaleString("de-DE")} von{" "}
              {result.score.maximumPoints.toLocaleString("de-DE")} Punkten ·{" "}
              {result.score.percentage.toLocaleString("de-DE")} Prozent
            </p>
          </div>
          <button
            type="button"
            className="learning-close-button"
            onClick={closeMode}
          >
            Modus schließen
          </button>
        </header>

        {result.timedOut && (
          <p className="learning-timeout-notice" role="status">
            Das Zeitlimit ist abgelaufen. Offene Karten wurden als nicht beantwortet
            gewertet und für eine Wiederholung eingeplant.
          </p>
        )}

        <dl className="learning-summary-grid">
          <div>
            <dt>Richtig</dt>
            <dd>{result.score.correct}</dd>
          </div>
          <div>
            <dt>Teilweise</dt>
            <dd>{result.score.partial}</dd>
          </div>
          <div>
            <dt>Falsch</dt>
            <dd>{result.score.incorrect}</dd>
          </div>
          <div>
            <dt>Offen</dt>
            <dd>{result.score.unanswered}</dd>
          </div>
        </dl>

        <section className="learning-error-analysis" aria-labelledby={headingId + "-errors"}>
          <h3 id={headingId + "-errors"}>Fehleranalyse</h3>
          {errorAnswers.length === 0 ? (
            <p>Alle Antworten waren richtig. Sehr gut!</p>
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
                    <b>Deine Antwort:</b>{" "}
                    {answer.givenAnswer || "Keine Antwort eingegeben"}
                  </p>
                  <p>
                    <b>Musterlösung:</b> {answer.expectedAnswer}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <details className="learning-all-answers">
          <summary>Alle Antworten anzeigen</summary>
          <ol className="learning-answer-list">
            {result.answers.map((answer) => (
              <li className="learning-answer-review" key={answer.cardId}>
                <header>
                  <strong>
                    {answer.position}. {answer.question}
                  </strong>
                  <span>{judgementLabel(answer.judgement)}</span>
                </header>
                <p>
                  <b>Deine Antwort:</b>{" "}
                  {answer.givenAnswer || "Keine Antwort eingegeben"}
                </p>
                <p>
                  <b>Musterlösung:</b> {answer.expectedAnswer}
                </p>
              </li>
            ))}
          </ol>
        </details>

        <p className="learning-save-confirmation">
          Das Prüfungsergebnis wurde gespeichert.
        </p>
        <div className="learning-form-actions">
          <button
            type="button"
            className="learning-secondary-button"
            onClick={returnToConfiguration}
          >
            Neue Prüfung
          </button>
          <button
            type="button"
            className="learning-primary-button"
            onClick={closeMode}
          >
            Fertig
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
          <p className="learning-eyebrow">Prüfungsmodus</p>
          <h1 id={headingId}>Frage {currentIndex + 1} von {queue.length}</h1>
        </div>
        <div className="learning-exam-clock">
          <span>Verbleibende Zeit</span>
          <time role="timer" aria-live="off">
            {formatTime(countdown.remainingSeconds)}
          </time>
        </div>
      </header>

      <progress
        className="learning-progress"
        value={progress}
        max="100"
        aria-label={progress + " Prozent der Prüfung abgeschlossen"}
      />

      <article className="learning-question-card">
        <span className="learning-card-label">{currentCard.deck}</span>
        <h3>{currentCard.front}</h3>
      </article>

      <label className="learning-field">
        <span>Deine Antwort</span>
        <textarea
          ref={answerFieldRef}
          value={typedAnswer}
          onChange={(event) => changeTypedAnswer(event.target.value)}
          maxLength={MAX_TYPED_ANSWER_LENGTH}
          rows={7}
          placeholder="Schreibe deine Antwort aus dem Gedächtnis auf …"
          readOnly={isRevealed}
          aria-describedby={answerHintId}
          autoFocus
          required
        />
        <small id={answerHintId}>
          {typedAnswer.length} von {MAX_TYPED_ANSWER_LENGTH} Zeichen
        </small>
      </label>

      {!isRevealed ? (
        <button
          type="button"
          className="learning-primary-button learning-reveal-button"
          onClick={() => setIsRevealed(true)}
          disabled={!typedAnswer.trim() || countdown.isFinished}
        >
          Lösung aufdecken
        </button>
      ) : (
        <>
          <article className="learning-answer learning-answer--own">
            <span>Deine Antwort</span>
            <p>{typedAnswer}</p>
          </article>
          <article className="learning-answer">
            <span>Musterlösung</span>
            <p>{currentCard.back}</p>
          </article>

          <fieldset className="learning-ratings" ref={ratingsRef} tabIndex={-1}>
            <legend>Wie bewertest du deine Antwort?</legend>
            <button
              type="button"
              className="learning-rating learning-rating--good"
              onClick={() => assessCurrentAnswer("correct")}
              disabled={countdown.isFinished}
            >
              <strong>Richtig</strong>
              <span>Die Kernaussage stimmt.</span>
            </button>
            <button
              type="button"
              className="learning-rating learning-rating--hard"
              onClick={() => assessCurrentAnswer("partial")}
              disabled={countdown.isFinished}
            >
              <strong>Teilweise richtig</strong>
              <span>Ein wichtiger Teil fehlte.</span>
            </button>
            <button
              type="button"
              className="learning-rating learning-rating--again"
              onClick={() => assessCurrentAnswer("incorrect")}
              disabled={countdown.isFinished}
            >
              <strong>Falsch</strong>
              <span>Die Karte sollte bald wiederholt werden.</span>
            </button>
          </fieldset>
        </>
      )}

      <button
        type="button"
        className="learning-close-button"
        onClick={closeMode}
      >
        Prüfung abbrechen
      </button>
    </section>
  );
}
