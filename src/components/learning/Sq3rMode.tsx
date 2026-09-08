import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { VaultNote } from "../../lib/obsidian";
import { formatNumber, useI18n } from "../../i18n";
import { renderMethodMessage, type MethodMessage } from "./methodMessages";

const MAX_SOURCE_LENGTH = 40_000;
const MAX_OVERVIEW_LENGTH = 4_000;
const MAX_QUESTIONS_LENGTH = 4_000;
const MAX_READING_NOTES_LENGTH = 6_000;
const MAX_RECITATION_LENGTH = 6_000;
const MAX_REVIEW_LENGTH = 4_000;
const MAX_CARD_FRONT_LENGTH = 1_000;
const MAX_CARD_BACK_LENGTH = 4_000;
const MAX_DECK_LENGTH = 100;

const SQ3R_STEPS = [
  { title: "methods.sq3r.step.survey", shortDescription: "methods.sq3r.stepHint.survey" },
  { title: "methods.sq3r.step.question", shortDescription: "methods.sq3r.stepHint.question" },
  { title: "methods.sq3r.step.read", shortDescription: "methods.sq3r.stepHint.read" },
  { title: "methods.sq3r.step.recite", shortDescription: "methods.sq3r.stepHint.recite" },
  { title: "methods.sq3r.step.review", shortDescription: "methods.sq3r.stepHint.review" },
] as const;

export interface Sq3rSource {
  type: "obsidian" | "text";
  label: string;
  text: string;
  relativePath?: string;
  modifiedAt?: number;
}

export interface Sq3rAnswers {
  overview: string;
  questions: string;
  readingNotes: string;
  recitation: string;
  review: string;
}

export interface Sq3rEntry {
  id: string;
  source: Sq3rSource;
  answers: Sq3rAnswers;
  currentStep: number;
  completed: boolean;
  updatedAt: string;
}

export interface Sq3rModeProps {
  notes: VaultNote[];
  savedDraft?: Sq3rEntry | null;
  onSave: (entry: Sq3rEntry) => void;
  onCreateCard: (card: { front: string; back: string; deck: string }) => void;
  onConnectObsidian: () => void;
  onClose: () => void;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function limitSourceText(text: string) {
  return text.slice(0, MAX_SOURCE_LENGTH);
}

function stepNumber(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(SQ3R_STEPS.length - 1, Math.trunc(value ?? 0)));
}

function deckFromSource(source: Sq3rSource | undefined) {
  if (source?.type !== "obsidian" || !source.relativePath) return "SQ3R";
  const parts = source.relativePath.replace(/\\/g, "/").split("/");
  return (parts.length > 1 ? parts[0] : "Obsidian").slice(0, MAX_DECK_LENGTH);
}

function initialAnswers(savedDraft?: Sq3rEntry | null): Sq3rAnswers {
  return {
    overview: savedDraft?.answers.overview ?? "",
    questions: savedDraft?.answers.questions ?? "",
    readingNotes: savedDraft?.answers.readingNotes ?? "",
    recitation: savedDraft?.answers.recitation ?? "",
    review: savedDraft?.answers.review ?? "",
  };
}

export function Sq3rMode({
  notes,
  savedDraft,
  onSave,
  onCreateCard,
  onConnectObsidian,
  onClose,
}: Sq3rModeProps) {
  const { t } = useI18n();
  const headingId = useId();
  const sourceLegendId = useId();
  const obsidianSourceId = useId();
  const textSourceId = useId();
  const sourceHintId = useId();
  const feedbackId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const initialSource = savedDraft?.source;
  const firstNote = notes[0];
  const [entryId] = useState(() => savedDraft?.id || createId());
  const [sourceType, setSourceType] = useState<"obsidian" | "text">(
    initialSource?.type ?? (firstNote ? "obsidian" : "text"),
  );
  const [selectedNotePath, setSelectedNotePath] = useState(
    initialSource?.type === "obsidian"
      ? initialSource.relativePath ?? ""
      : firstNote?.relativePath ?? "",
  );
  const [noteSnapshot, setNoteSnapshot] = useState<Sq3rSource | null>(() => {
    if (initialSource?.type === "obsidian") return initialSource;
    if (!firstNote) return null;
    return {
      type: "obsidian",
      label: firstNote.relativePath,
      relativePath: firstNote.relativePath,
      modifiedAt: firstNote.modifiedAt,
      text: limitSourceText(firstNote.content),
    };
  });
  const [pastedText, setPastedText] = useState(
    initialSource?.type === "text" ? initialSource.text : "",
  );
  const [answers, setAnswers] = useState<Sq3rAnswers>(() =>
    initialAnswers(savedDraft),
  );
  const [currentStep, setCurrentStep] = useState(() =>
    stepNumber(savedDraft?.currentStep),
  );
  const [feedback, setFeedback] = useState<MethodMessage | null>(null);
  const [completed, setCompleted] = useState(savedDraft?.completed === true);
  const [gapQuestion, setGapQuestion] = useState("");
  const [gapAnswer, setGapAnswer] = useState("");
  const [cardDeck, setCardDeck] = useState(() => deckFromSource(initialSource));
  const effectiveNotePath = selectedNotePath || notes[0]?.relativePath || "";

  const selectedNote = useMemo(
    () => notes.find((note) => note.relativePath === effectiveNotePath),
    [effectiveNotePath, notes],
  );

  const activeObsidianSource = useMemo<Sq3rSource | null>(() => {
    if (selectedNote) {
      return {
        type: "obsidian",
        label: selectedNote.relativePath,
        relativePath: selectedNote.relativePath,
        modifiedAt: selectedNote.modifiedAt,
        text: limitSourceText(selectedNote.content),
      };
    }
    if (noteSnapshot?.relativePath === effectiveNotePath) return noteSnapshot;
    return null;
  }, [effectiveNotePath, noteSnapshot, selectedNote]);

  // Keep legacy system labels stable in saved entries; translate their display below.
  const activeSource: Sq3rSource =
    sourceType === "obsidian"
      ? activeObsidianSource ?? {
          type: "obsidian",
          label: effectiveNotePath || "Keine Obsidian-Notiz gewählt",
          relativePath: effectiveNotePath || undefined,
          text: "",
        }
      : {
          type: "text",
          label: "Eingefügter Text",
          text: pastedText,
        };

  const activeSourceLabel = sourceType === "text"
    ? t("methods.sq3r.pastedText")
    : activeSource.relativePath ? activeSource.label : t("methods.sq3r.noNoteSelected");

  const updateAnswer = (key: keyof Sq3rAnswers, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  };

  const createEntry = (completed: boolean): Sq3rEntry => ({
    id: entryId,
    source: {
      ...activeSource,
      text: limitSourceText(activeSource.text),
    },
    answers: {
      overview: answers.overview.trim(),
      questions: answers.questions.trim(),
      readingNotes: answers.readingNotes.trim(),
      recitation: answers.recitation.trim(),
      review: answers.review.trim(),
    },
    currentStep,
    completed,
    updatedAt: new Date().toISOString(),
  });

  const validateSource = () => {
    if (activeSource.text.trim()) return true;
    setCurrentStep(0);
    setFeedback({ key: sourceType === "obsidian"
      ? "methods.sq3r.chooseSourceError"
      : "methods.sq3r.pasteTextError",
    });
    return false;
  };

  const saveDraft = () => {
    if (completed) return;
    onSave(createEntry(false));
    setFeedback({ key: "methods.sq3r.draftSaved" });
  };

  const goBack = () => {
    setCurrentStep((step) => Math.max(0, step - 1));
    setFeedback(null);
  };

  const goForward = () => {
    if (!validateSource()) return;
    if (formRef.current?.reportValidity() === false) {
      setFeedback({ key: "methods.sq3r.completeStepError" });
      return;
    }
    setCurrentStep((step) => Math.min(SQ3R_STEPS.length - 1, step + 1));
    setFeedback(null);
  };

  const completeSq3r = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateSource()) return;

    const answerOrder: Array<keyof Sq3rAnswers> = [
      "overview",
      "questions",
      "readingNotes",
      "recitation",
      "review",
    ];
    const missingStep = answerOrder.findIndex((key) => !answers[key].trim());
    if (missingStep >= 0) {
      setCurrentStep(missingStep);
      setFeedback(
        { key: "methods.sq3r.missingStep", translatedParams: { step: SQ3R_STEPS[missingStep].title } },
      );
      return;
    }

    onSave({ ...createEntry(true), currentStep: SQ3R_STEPS.length - 1 });
    setCompleted(true);
    setFeedback({ key: "methods.sq3r.saved" });
  };

  const createGapCard = () => {
    const front = gapQuestion.trim();
    const back = gapAnswer.trim();
    const deck = cardDeck.trim() || deckFromSource(activeSource);
    if (!front || !back) {
      setFeedback({ key: "methods.sq3r.completeCardError" });
      return;
    }

    onCreateCard({ front, back, deck });
    setGapQuestion("");
    setGapAnswer("");
    setFeedback({ key: "methods.gapCardCreated", params: { deck } });
  };

  const selectNote = (relativePath: string) => {
    const note = notes.find((candidate) => candidate.relativePath === relativePath);
    setSelectedNotePath(relativePath);
    if (note) {
      const source: Sq3rSource = {
        type: "obsidian",
        label: note.relativePath,
        relativePath: note.relativePath,
        modifiedAt: note.modifiedAt,
        text: limitSourceText(note.content),
      };
      setNoteSnapshot(source);
      setCardDeck(deckFromSource(source));
    }
    setFeedback(null);
  };

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [currentStep]);

  const closeMode = () => {
    const hasDraftContent = Boolean(
      pastedText.trim() || Object.values(answers).some((value) => value.trim()),
    );
    if (!completed && hasDraftContent) onSave(createEntry(false));
    onClose();
  };

  if (completed) {
    return (
      <section className="learning-mode learning-completion" aria-labelledby={headingId}>
        <p className="learning-eyebrow">{t("methods.sq3r.complete")}</p>
        <h1 id={headingId}>{t("methods.sq3r.completeHeading")}</h1>
        <p>
          {t("methods.sq3r.completeHint")}
        </p>
        <dl className="learning-summary-grid">
          <div><dt>{t("methods.source")}</dt><dd className="learning-summary-text">{activeSourceLabel}</dd></div>
          <div><dt>{t("methods.sq3r.steps")}</dt><dd>{formatNumber(5)}/{formatNumber(5)}</dd></div>
        </dl>
        <div className="learning-form-actions">
          <button type="button" className="learning-primary-button" onClick={closeMode}>
            {t("methods.done")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="learning-mode" aria-labelledby={headingId}>
      <header className="learning-mode-header">
        <div className="learning-mode-heading">
          <p className="learning-eyebrow">{t("methods.sq3r.name")}</p>
          <h1 id={headingId}>{t("methods.sq3r.heading")}</h1>
          <p>
            {t("methods.sq3r.intro")}
          </p>
        </div>
        <button type="button" className="learning-close-button" onClick={closeMode}>
          {t("methods.close")}
        </button>
      </header>

      <ol className="learning-step-list" aria-label={t("methods.sq3r.progress")}>
        {SQ3R_STEPS.map((step, index) => {
          const stateClass =
            index === currentStep
              ? "learning-step-current"
              : index < currentStep
                ? "learning-step-complete"
                : "learning-step-pending";
          return (
            <li
              key={step.title}
              className={`learning-step ${stateClass}`}
              aria-current={index === currentStep ? "step" : undefined}
            >
              <span className="learning-step-number">{formatNumber(index + 1)}</span>
              <span className="learning-step-copy">
                <strong>{t(step.title)}</strong>
                <small>{t(step.shortDescription)}</small>
              </span>
            </li>
          );
        })}
      </ol>

      <form ref={formRef} className="learning-form" onSubmit={completeSq3r}>
        {currentStep === 0 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>{t("methods.sq3r.stepPosition", { position: 1, total: 5 })}</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>{t("methods.sq3r.surveyHeading")}</h3>
              <p>{t("methods.sq3r.surveyHint")}</p>
            </div>

            <fieldset className="learning-source-picker" aria-describedby={sourceHintId}>
              <legend id={sourceLegendId}>{t("methods.source")}</legend>
              <label className="learning-radio-option" htmlFor={obsidianSourceId}>
                <input
                  id={obsidianSourceId}
                  type="radio"
                  name="sq3r-source"
                  checked={sourceType === "obsidian"}
                  onChange={() => {
                    setSourceType("obsidian");
                    setCardDeck(deckFromSource(activeObsidianSource ?? undefined));
                    setFeedback(null);
                  }}
                />
                {t("methods.sq3r.useNote")}
              </label>
              <label className="learning-radio-option" htmlFor={textSourceId}>
                <input
                  id={textSourceId}
                  type="radio"
                  name="sq3r-source"
                  checked={sourceType === "text"}
                  onChange={() => {
                    setSourceType("text");
                    setCardDeck("SQ3R");
                    setFeedback(null);
                  }}
                />
                {t("methods.sq3r.useText")}
              </label>
              <small id={sourceHintId}>
                {t("methods.sq3r.sourceHint")}
              </small>
            </fieldset>

            {sourceType === "obsidian" ? (
              <div className="learning-source-controls">
                {notes.length || activeObsidianSource ? (
                  <label className="learning-field">
                    <span>{t("methods.sq3r.note")}</span>
                    <select
                      value={effectiveNotePath}
                      onChange={(event) => selectNote(event.target.value)}
                    >
                      {activeObsidianSource &&
                        !notes.some(
                          (note) => note.relativePath === activeObsidianSource.relativePath,
                        ) && (
                          <option value={activeObsidianSource.relativePath}>
                            {t("methods.sq3r.savedSource", { label: activeObsidianSource.label })}
                          </option>
                        )}
                      {notes.map((note) => (
                        <option key={note.relativePath} value={note.relativePath}>
                          {note.relativePath}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="learning-empty-source">
                    {t("methods.sq3r.noNotes")}
                  </p>
                )}
                <button
                  type="button"
                  className="learning-secondary-button"
                  onClick={onConnectObsidian}
                >
                  {notes.length ? t("methods.sq3r.changeVault") : t("methods.sq3r.connect")}
                </button>
                <p className="learning-readonly-note">
                  {t("methods.sq3r.readOnly")}
                </p>
              </div>
            ) : (
              <label className="learning-field">
                <span>{t("methods.sq3r.text")}</span>
                <textarea
                  value={pastedText}
                  onChange={(event) => {
                    setPastedText(event.target.value);
                    setFeedback(null);
                  }}
                  maxLength={MAX_SOURCE_LENGTH}
                  rows={10}
                  placeholder={t("methods.sq3r.textPlaceholder")}
                  required
                />
                <small>{t("methods.sq3r.maxCharacters", { count: MAX_SOURCE_LENGTH })}</small>
              </label>
            )}

            {sourceType === "obsidian" && activeSource.text && (
              <div className="learning-source-preview" aria-label={t("methods.sq3r.notePreview")}>
                <strong>{activeSourceLabel}</strong>
                <pre>{activeSource.text}</pre>
              </div>
            )}

            <label className="learning-field">
              <span>{t("methods.sq3r.overview")}</span>
              <textarea
                value={answers.overview}
                onChange={(event) => updateAnswer("overview", event.target.value)}
                maxLength={MAX_OVERVIEW_LENGTH}
                rows={5}
                placeholder={t("methods.sq3r.overviewPlaceholder")}
                required
              />
            </label>
          </div>
        )}

        {currentStep === 1 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>{t("methods.sq3r.stepPosition", { position: 2, total: 5 })}</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>{t("methods.sq3r.questionHeading")}</h3>
              <p>{t("methods.sq3r.questionHint")}</p>
            </div>
            <label className="learning-field">
              <span>{t("methods.sq3r.myQuestions")}</span>
              <textarea
                value={answers.questions}
                onChange={(event) => updateAnswer("questions", event.target.value)}
                maxLength={MAX_QUESTIONS_LENGTH}
                rows={9}
                placeholder={t("methods.sq3r.questionsPlaceholder")}
                autoFocus
                required
              />
            </label>
          </div>
        )}

        {currentStep === 2 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>{t("methods.sq3r.stepPosition", { position: 3, total: 5 })}</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>{t("methods.sq3r.readHeading")}</h3>
              <p>{t("methods.sq3r.readHint")}</p>
            </div>
            <div className="learning-source-preview" aria-label={t("methods.sq3r.sourceText")}>
              <strong>{activeSourceLabel}</strong>
              <pre>{activeSource.text}</pre>
            </div>
            <label className="learning-field">
              <span>{t("methods.sq3r.readingNotes")}</span>
              <textarea
                value={answers.readingNotes}
                onChange={(event) => updateAnswer("readingNotes", event.target.value)}
                maxLength={MAX_READING_NOTES_LENGTH}
                rows={7}
                placeholder={t("methods.sq3r.readingPlaceholder")}
                required
              />
            </label>
          </div>
        )}

        {currentStep === 3 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>{t("methods.sq3r.stepPosition", { position: 4, total: 5 })}</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>{t("methods.sq3r.reciteHeading")}</h3>
              <p>
                {t("methods.sq3r.reciteHint")}
              </p>
            </div>
            <div className="learning-question-reference">
              <strong>{t("methods.sq3r.yourQuestions")}</strong>
              <p>{answers.questions}</p>
            </div>
            <label className="learning-field">
              <span>{t("methods.sq3r.recitation")}</span>
              <textarea
                value={answers.recitation}
                onChange={(event) => updateAnswer("recitation", event.target.value)}
                maxLength={MAX_RECITATION_LENGTH}
                rows={10}
                placeholder={t("methods.sq3r.recallPlaceholder")}
                autoFocus
                required
              />
            </label>
          </div>
        )}

        {currentStep === 4 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>{t("methods.sq3r.stepPosition", { position: 5, total: 5 })}</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>{t("methods.sq3r.reviewHeading")}</h3>
              <p>
                {t("methods.sq3r.reviewHint")}
              </p>
            </div>
            <div className="learning-comparison">
              <section className="learning-comparison-panel" aria-label={t("methods.sq3r.yourRecall")}>
                <strong>{t("methods.sq3r.recitation")}</strong>
                <p>{answers.recitation}</p>
              </section>
              <section className="learning-comparison-panel" aria-label={t("methods.sq3r.sourceText")}>
                <strong>{activeSourceLabel}</strong>
                <pre>{activeSource.text}</pre>
              </section>
            </div>
            <label className="learning-field">
              <span>{t("methods.sq3r.review")}</span>
              <textarea
                value={answers.review}
                onChange={(event) => updateAnswer("review", event.target.value)}
                maxLength={MAX_REVIEW_LENGTH}
                rows={6}
                placeholder={t("methods.sq3r.reviewPlaceholder")}
                required
              />
            </label>

            <fieldset className="learning-gap-card">
              <legend>{t("methods.sq3r.gapCard")}</legend>
              <label className="learning-field">
                <span>{t("methods.question")}</span>
                <textarea
                  value={gapQuestion}
                  onChange={(event) => {
                    setGapQuestion(event.target.value);
                    setFeedback(null);
                  }}
                  maxLength={MAX_CARD_FRONT_LENGTH}
                  rows={3}
                  placeholder={t("methods.sq3r.gapQuestionPlaceholder")}
                />
              </label>
              <label className="learning-field">
                <span>{t("methods.answer")}</span>
                <textarea
                  value={gapAnswer}
                  onChange={(event) => {
                    setGapAnswer(event.target.value);
                    setFeedback(null);
                  }}
                  maxLength={MAX_CARD_BACK_LENGTH}
                  rows={4}
                  placeholder={t("methods.sq3r.gapAnswerPlaceholder")}
                />
              </label>
              <label className="learning-field">
                <span>{t("methods.deck")}</span>
                <input
                  type="text"
                  value={cardDeck}
                  onChange={(event) => {
                    setCardDeck(event.target.value);
                    setFeedback(null);
                  }}
                  maxLength={MAX_DECK_LENGTH}
                  placeholder={t("methods.sq3r.name")}
                />
              </label>
              <button
                type="button"
                className="learning-secondary-button"
                onClick={createGapCard}
              >
                {t("methods.createCard")}
              </button>
            </fieldset>
          </div>
        )}

        <div className="learning-navigation">
          <button
            type="button"
            className="learning-secondary-button"
            onClick={goBack}
            disabled={currentStep === 0}
          >
            {t("methods.back")}
          </button>
          <button
            type="button"
            className="learning-secondary-button"
            onClick={saveDraft}
          >
            {t("methods.sq3r.saveDraft")}
          </button>
          {currentStep < SQ3R_STEPS.length - 1 ? (
            <button
              type="button"
              className="learning-primary-button"
              onClick={goForward}
            >
              {t("methods.next")}
            </button>
          ) : (
            <button type="submit" className="learning-primary-button">
              {t("methods.sq3r.finish")}
            </button>
          )}
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
