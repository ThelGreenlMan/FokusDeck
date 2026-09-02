import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

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
  const formRef = useRef<HTMLFormElement>(null);
  const savedDraftRef = useRef("");
  const headingId = useId();
  const explanationHintId = useId();
  const knowledgeGapHintId = useId();
  const feedbackId = useId();
  const [entryId] = useState(createId);
  const [createdAt] = useState(() => new Date().toISOString());
  const deckOptions = useMemo(() => availableDecks(decks), [decks]);
  const [draft, setDraft] = useState<FeynmanDraft>(() => ({
    topic: "",
    explanation: "",
    knowledgeGap: "",
    gapAnswer: "",
    simplifiedExplanation: "",
    deck: availableDecks(decks)[0],
  }));
  const [feedback, setFeedback] = useState("");

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
      setFeedback("Bitte fülle alle Felder aus, bevor du fortfährst.");
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
    setFeedback("Dein Feynman-Eintrag wurde gespeichert.");
  };

  const createCard = () => {
    const values = normalizedDraft();
    if (!values.topic || !values.explanation || !values.simplifiedExplanation) {
      setFeedback("Vervollständige zuerst Thema und beide Erklärungen.");
      return;
    }
    if (!values.knowledgeGap || !values.gapAnswer) {
      setFeedback("Formuliere für die Karte eine Wissenslücke und die passende Antwort.");
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
      `Die Wissenslücke wurde als Karte im Stapel „${values.deck}“ erstellt.`,
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
      !window.confirm("Feynman-Methode beenden und ungespeicherte Eingaben verwerfen?")
    ) {
      return;
    }
    onClose();
  };

  return (
    <section className="learning-mode" aria-labelledby={headingId}>
      <header className="learning-mode-header">
        <div className="learning-mode-heading">
          <p className="learning-eyebrow">Feynman-Methode</p>
          <h1 id={headingId}>Erkläre es mit deinen eigenen Worten</h1>
          <p>
            Schreibe so, als würdest du das Thema einer Person ohne Vorwissen
            erklären. Unklare Stellen hältst du anschließend als Wissenslücke fest.
          </p>
        </div>
        <button type="button" className="learning-close-button" onClick={closeMode}>
          Modus schließen
        </button>
      </header>

      <form ref={formRef} className="learning-form" onSubmit={saveEntry}>
        <label className="learning-field">
          <span>Thema</span>
          <input
            type="text"
            value={draft.topic}
            onChange={(event) => {
              setDraft((current) => ({ ...current, topic: event.target.value }));
              setFeedback("");
            }}
            maxLength={MAX_TOPIC_LENGTH}
            placeholder="z. B. Photosynthese"
            autoFocus
            required
          />
        </label>

        <label className="learning-field">
          <span>1. Erste Erklärung in einfachen Worten</span>
          <textarea
            value={draft.explanation}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                explanation: event.target.value,
              }));
              setFeedback("");
            }}
            maxLength={MAX_EXPLANATION_LENGTH}
            rows={9}
            placeholder="Erkläre das Thema ohne Fachsprache und in kurzen, verständlichen Schritten."
            aria-describedby={explanationHintId}
            required
          />
          <small id={explanationHintId}>
            Prüfe selbst, ob deine Erklärung vollständig und verständlich ist. FokusDeck
            bewertet deinen Text nicht automatisch.
          </small>
        </label>

        <label className="learning-field">
          <span>2. Gefundene Wissenslücke</span>
          <textarea
            value={draft.knowledgeGap}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                knowledgeGap: event.target.value,
              }));
              setFeedback("");
            }}
            maxLength={MAX_KNOWLEDGE_GAP_LENGTH}
            rows={4}
            placeholder="Formuliere als Frage, was dir noch unklar ist."
            aria-describedby={knowledgeGapHintId}
          />
          <small id={knowledgeGapHintId}>
            Wenn dir nichts mehr unklar ist, darf dieses Feld leer bleiben.
          </small>
        </label>

        <label className="learning-field">
          <span>3. Antwort auf die Wissenslücke</span>
          <textarea
            value={draft.gapAnswer}
            onChange={(event) => {
              setDraft((current) => ({ ...current, gapAnswer: event.target.value }));
              setFeedback("");
            }}
            maxLength={MAX_GAP_ANSWER_LENGTH}
            rows={5}
            placeholder="Arbeite die unklare Stelle nach und notiere die präzise Antwort."
          />
        </label>

        <label className="learning-field">
          <span>4. Noch einfacher neu erklären</span>
          <textarea
            value={draft.simplifiedExplanation}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                simplifiedExplanation: event.target.value,
              }));
              setFeedback("");
            }}
            maxLength={MAX_EXPLANATION_LENGTH}
            rows={7}
            placeholder="Schreibe deine verbesserte Erklärung noch einmal kurz und ohne unnötige Fachbegriffe."
            required
          />
        </label>

        <label className="learning-field">
          <span>Stapel für die neue Karte</span>
          <select
            value={draft.deck}
            onChange={(event) => {
              setDraft((current) => ({ ...current, deck: event.target.value }));
              setFeedback("");
            }}
          >
            {deckOptions.map((deck) => (
              <option key={deck} value={deck}>
                {deck}
              </option>
            ))}
          </select>
        </label>

        <div className="learning-form-actions">
          <button type="submit" className="learning-secondary-button">
            Eintrag speichern
          </button>
          <button
            type="button"
            className="learning-primary-button"
            onClick={createCard}
          >
            Wissenslücke als Karte erstellen
          </button>
        </div>

        <p
          id={feedbackId}
          className="learning-feedback"
          role="status"
          aria-live="polite"
        >
          {feedback}
        </p>
      </form>
    </section>
  );
}
