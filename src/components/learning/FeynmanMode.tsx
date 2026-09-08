import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../../i18n";
import { renderMethodMessage, type MethodMessage } from "./methodMessages";

const MAX_TOPIC_LENGTH = 200;
const MAX_EXPLANATION_LENGTH = 6_000;
const MAX_KNOWLEDGE_GAP_LENGTH = 1_000;
const MAX_GAP_ANSWER_LENGTH = 4_000;

export interface FeynmanDraft {
  topic: string;
  explanation: string;
  knowledgeGap: string;
  gapAnswer: string;
  simplifiedExplanation: string;
  deck: string;
}

export interface FeynmanEntry extends FeynmanDraft {
  id: string;
  createdAt: string;
}

export interface FeynmanCardDraft {
  front: string;
  back: string;
  deck: string;
}

export interface FeynmanModeProps {
  decks: string[];
  onSave: (entry: FeynmanEntry) => void;
  onCreateCard: (card: FeynmanCardDraft) => void;
  onClose: () => void;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function availableDecks(decks: string[]) {
  const normalizedDecks = decks
    .map((deck) => deck.trim())
    .filter((deck) => deck && deck !== "Alle Karten");
  return Array.from(new Set(normalizedDecks.length ? normalizedDecks : ["Allgemein"]));
}

export function FeynmanMode({
  decks,
  onSave,
  onCreateCard,
  onClose,
}: FeynmanModeProps) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const savedDraftRef = useRef("");
  const headingId = useId();
  const explanationHintId = useId();
  const knowledgeGapHintId = useId();
  const feedbackId = useId();
  const [entryId] = useState(createId);
  const [createdAt] = useState(() => new Date().toISOString());
  const deckOptions = useMemo(() => availableDecks(decks), [decks]);
  const isFallbackDeck = (deck: string) =>
    deck === "Allgemein" && !decks.some((candidate) => candidate.trim() === deck);
  const [draft, setDraft] = useState<FeynmanDraft>(() => ({
    topic: "",
    explanation: "",
    knowledgeGap: "",
    gapAnswer: "",
    simplifiedExplanation: "",
    deck: availableDecks(decks)[0],
  }));
  const [feedback, setFeedback] = useState<MethodMessage | null>(null);

  useEffect(() => {
    if (!deckOptions.includes(draft.deck)) {
      setDraft((current) => ({ ...current, deck: deckOptions[0] }));
    }
  }, [deckOptions, draft.deck]);

  const normalizedDraft = (): FeynmanDraft => ({
    topic: draft.topic.trim(),
    explanation: draft.explanation.trim(),
    knowledgeGap: draft.knowledgeGap.trim(),
    gapAnswer: draft.gapAnswer.trim(),
    simplifiedExplanation: draft.simplifiedExplanation.trim(),
    deck: draft.deck.trim() || "Allgemein",
  });

  const validateForm = () => {
    if (formRef.current?.reportValidity() === false) {
      setFeedback({ key: "methods.feynman.fillFields" });
      return false;
    }
    return true;
  };

  const saveEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) return;

    const values = normalizedDraft();
    onSave({
      ...values,
      id: entryId,
      createdAt,
    });
    savedDraftRef.current = JSON.stringify(values);
    setFeedback({ key: "methods.feynman.saved" });
  };

  const createCard = () => {
    const values = normalizedDraft();
    if (!values.topic || !values.explanation || !values.simplifiedExplanation) {
      setFeedback({ key: "methods.feynman.completeExplanations" });
      return;
    }
    if (!values.knowledgeGap || !values.gapAnswer) {
      setFeedback({ key: "methods.feynman.completeGap" });
      return;
    }

    onCreateCard({
      front: values.knowledgeGap,
      back: values.gapAnswer,
      deck: values.deck,
    });
    onSave({ ...values, id: entryId, createdAt });
    savedDraftRef.current = JSON.stringify(values);
    setFeedback(
      {
        key: "methods.gapCardCreated",
        params: { deck: values.deck },
        ...(isFallbackDeck(values.deck) ? { translatedParams: { deck: "methods.generalDeck" } } : {}),
      },
    );
  };

  const closeMode = () => {
    const values = normalizedDraft();
    const hasUnsavedWork = Boolean(
      draft.topic.trim() ||
        draft.explanation.trim() ||
        draft.knowledgeGap.trim() ||
        draft.gapAnswer.trim() ||
        draft.simplifiedExplanation.trim(),
    );
    if (
      hasUnsavedWork &&
      savedDraftRef.current !== JSON.stringify(values) &&
      !window.confirm(t("methods.feynman.confirmClose"))
    ) {
      return;
    }
    onClose();
  };

  return (
    <section className="learning-mode" aria-labelledby={headingId}>
      <header className="learning-mode-header">
        <div className="learning-mode-heading">
          <p className="learning-eyebrow">{t("methods.feynman.name")}</p>
          <h1 id={headingId}>{t("methods.feynman.heading")}</h1>
          <p>
            {t("methods.feynman.intro")}
          </p>
        </div>
        <button type="button" className="learning-close-button" onClick={closeMode}>
          {t("methods.close")}
        </button>
      </header>

      <form ref={formRef} className="learning-form" onSubmit={saveEntry}>
        <label className="learning-field">
          <span>{t("methods.topic")}</span>
          <input
            type="text"
            value={draft.topic}
            onChange={(event) => {
              setDraft((current) => ({ ...current, topic: event.target.value }));
              setFeedback(null);
            }}
            maxLength={MAX_TOPIC_LENGTH}
            placeholder={t("methods.feynman.topicPlaceholder")}
            autoFocus
            required
          />
        </label>

        <label className="learning-field">
          <span>{t("methods.feynman.first")}</span>
          <textarea
            value={draft.explanation}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                explanation: event.target.value,
              }));
              setFeedback(null);
            }}
            maxLength={MAX_EXPLANATION_LENGTH}
            rows={9}
            placeholder={t("methods.feynman.explanationPlaceholder")}
            aria-describedby={explanationHintId}
            required
          />
          <small id={explanationHintId}>
            {t("methods.feynman.selfAssessment")}
          </small>
        </label>

        <label className="learning-field">
          <span>{t("methods.feynman.gap")}</span>
          <textarea
            value={draft.knowledgeGap}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                knowledgeGap: event.target.value,
              }));
              setFeedback(null);
            }}
            maxLength={MAX_KNOWLEDGE_GAP_LENGTH}
            rows={4}
            placeholder={t("methods.feynman.gapPlaceholder")}
            aria-describedby={knowledgeGapHintId}
          />
          <small id={knowledgeGapHintId}>
            {t("methods.feynman.gapOptional")}
          </small>
        </label>

        <label className="learning-field">
          <span>{t("methods.feynman.answerGap")}</span>
          <textarea
            value={draft.gapAnswer}
            onChange={(event) => {
              setDraft((current) => ({ ...current, gapAnswer: event.target.value }));
              setFeedback(null);
            }}
            maxLength={MAX_GAP_ANSWER_LENGTH}
            rows={5}
            placeholder={t("methods.feynman.answerPlaceholder")}
          />
        </label>

        <label className="learning-field">
          <span>{t("methods.feynman.simplify")}</span>
          <textarea
            value={draft.simplifiedExplanation}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                simplifiedExplanation: event.target.value,
              }));
              setFeedback(null);
            }}
            maxLength={MAX_EXPLANATION_LENGTH}
            rows={7}
            placeholder={t("methods.feynman.simplifyPlaceholder")}
            required
          />
        </label>

        <label className="learning-field">
          <span>{t("methods.newCardDeck")}</span>
          <select
            value={draft.deck}
            onChange={(event) => {
              setDraft((current) => ({ ...current, deck: event.target.value }));
              setFeedback(null);
            }}
          >
            {deckOptions.map((deck) => (
              <option key={deck} value={deck}>
                {isFallbackDeck(deck) ? t("methods.generalDeck") : deck}
              </option>
            ))}
          </select>
        </label>

        <div className="learning-form-actions">
          <button type="submit" className="learning-secondary-button">
            {t("methods.feynman.save")}
          </button>
          <button
            type="button"
            className="learning-primary-button"
            onClick={createCard}
          >
            {t("methods.feynman.createCard")}
          </button>
        </div>

        <p
          id={feedbackId}
          className="learning-feedback"
          role="status"
          aria-live="polite"
        >
          {renderMethodMessage(feedback)}
        </p>
      </form>
    </section>
  );
}
