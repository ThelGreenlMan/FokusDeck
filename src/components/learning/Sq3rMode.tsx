import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { VaultNote } from "../../lib/obsidian";

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
  { title: "Überblick", shortDescription: "Struktur und Kerngedanken erfassen" },
  { title: "Fragen", shortDescription: "Eigene Leitfragen formulieren" },
  { title: "Lesen", shortDescription: "Gezielt lesen und Notizen machen" },
  { title: "Wiedergeben", shortDescription: "Ohne Vorlage aus dem Gedächtnis erklären" },
  { title: "Wiederholen", shortDescription: "Vergleichen und Wissenslücken schließen" },
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
  const [feedback, setFeedback] = useState("");
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

  const updateAnswer = (key: keyof Sq3rAnswers, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value }));
    setFeedback("");
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
    setFeedback(
      sourceType === "obsidian"
        ? "Wähle zuerst eine Obsidian-Notiz oder verwende einen eingefügten Text."
        : "Füge zuerst den Text ein, mit dem du arbeiten möchtest.",
    );
    return false;
  };

  const saveDraft = () => {
    if (completed) return;
    onSave(createEntry(false));
    setFeedback("Dein SQ3R-Zwischenstand wurde gespeichert.");
  };

  const goBack = () => {
    setCurrentStep((step) => Math.max(0, step - 1));
    setFeedback("");
  };

  const goForward = () => {
    if (!validateSource()) return;
    if (formRef.current?.reportValidity() === false) {
      setFeedback("Bitte bearbeite den aktuellen Schritt, bevor du weitergehst.");
      return;
    }
    setCurrentStep((step) => Math.min(SQ3R_STEPS.length - 1, step + 1));
    setFeedback("");
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
        `Bitte vervollständige zuerst den Schritt „${SQ3R_STEPS[missingStep].title}“.`,
      );
      return;
    }

    onSave({ ...createEntry(true), currentStep: SQ3R_STEPS.length - 1 });
    setCompleted(true);
    setFeedback("SQ3R abgeschlossen und Lernfortschritt gespeichert.");
  };

  const createGapCard = () => {
    const front = gapQuestion.trim();
    const back = gapAnswer.trim();
    const deck = cardDeck.trim() || deckFromSource(activeSource);
    if (!front || !back) {
      setFeedback("Trage für die neue Karte eine Frage und eine Antwort ein.");
      return;
    }

    onCreateCard({ front, back, deck });
    setGapQuestion("");
    setGapAnswer("");
    setFeedback(`Die Wissenslücke wurde als Karte im Stapel „${deck}“ erstellt.`);
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
    setFeedback("");
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
        <p className="learning-eyebrow">SQ3R abgeschlossen</p>
        <h1 id={headingId}>Text systematisch durchgearbeitet</h1>
        <p>
          Dein Ergebnis wurde lokal gespeichert. Du kannst Wissenslücken jetzt in
          deiner nächsten Tagesrunde wiederholen.
        </p>
        <dl className="learning-summary-grid">
          <div><dt>Quelle</dt><dd className="learning-summary-text">{activeSource.label}</dd></div>
          <div><dt>Schritte</dt><dd>5/5</dd></div>
        </dl>
        <div className="learning-form-actions">
          <button type="button" className="learning-primary-button" onClick={closeMode}>
            Fertig
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="learning-mode" aria-labelledby={headingId}>
      <header className="learning-mode-header">
        <div className="learning-mode-heading">
          <p className="learning-eyebrow">SQ3R</p>
          <h1 id={headingId}>Einen Text in fünf Schritten durcharbeiten</h1>
          <p>
            FokusDeck liest ausgewählte Obsidian-Notizen ausschließlich. Deine
            Notizen im Vault werden niemals verändert.
          </p>
        </div>
        <button type="button" className="learning-close-button" onClick={closeMode}>
          Modus schließen
        </button>
      </header>

      <ol className="learning-step-list" aria-label="SQ3R-Fortschritt">
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
              <span className="learning-step-number">{index + 1}</span>
              <span className="learning-step-copy">
                <strong>{step.title}</strong>
                <small>{step.shortDescription}</small>
              </span>
            </li>
          );
        })}
      </ol>

      <form ref={formRef} className="learning-form" onSubmit={completeSq3r}>
        {currentStep === 0 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>Schritt 1 von 5</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>Überblick gewinnen</h3>
              <p>Wähle deine Quelle und notiere zunächst Aufbau und Kerngedanken.</p>
            </div>

            <fieldset className="learning-source-picker" aria-describedby={sourceHintId}>
              <legend id={sourceLegendId}>Quelle</legend>
              <label className="learning-radio-option" htmlFor={obsidianSourceId}>
                <input
                  id={obsidianSourceId}
                  type="radio"
                  name="sq3r-source"
                  checked={sourceType === "obsidian"}
                  onChange={() => {
                    setSourceType("obsidian");
                    setCardDeck(deckFromSource(activeObsidianSource ?? undefined));
                    setFeedback("");
                  }}
                />
                Obsidian-Notiz verwenden
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
                    setFeedback("");
                  }}
                />
                Eigenen Text einfügen
              </label>
              <small id={sourceHintId}>
                Eingefügter Text steht immer als Alternative zur Verfügung.
              </small>
            </fieldset>

            {sourceType === "obsidian" ? (
              <div className="learning-source-controls">
                {notes.length || activeObsidianSource ? (
                  <label className="learning-field">
                    <span>Obsidian-Notiz</span>
                    <select
                      value={effectiveNotePath}
                      onChange={(event) => selectNote(event.target.value)}
                    >
                      {activeObsidianSource &&
                        !notes.some(
                          (note) => note.relativePath === activeObsidianSource.relativePath,
                        ) && (
                          <option value={activeObsidianSource.relativePath}>
                            {activeObsidianSource.label} (gespeicherter Stand)
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
                    Es ist noch keine Obsidian-Notiz verfügbar.
                  </p>
                )}
                <button
                  type="button"
                  className="learning-secondary-button"
                  onClick={onConnectObsidian}
                >
                  {notes.length ? "Anderen Vault verbinden" : "Obsidian verbinden"}
                </button>
                <p className="learning-readonly-note">
                  Nur Lesen: FokusDeck nimmt keine Änderungen an deinem Vault vor.
                </p>
              </div>
            ) : (
              <label className="learning-field">
                <span>Text zum Bearbeiten</span>
                <textarea
                  value={pastedText}
                  onChange={(event) => {
                    setPastedText(event.target.value);
                    setFeedback("");
                  }}
                  maxLength={MAX_SOURCE_LENGTH}
                  rows={10}
                  placeholder="Füge hier deinen Lerntext ein."
                  required
                />
                <small>Maximal {MAX_SOURCE_LENGTH.toLocaleString("de-DE")} Zeichen.</small>
              </label>
            )}

            {sourceType === "obsidian" && activeSource.text && (
              <div className="learning-source-preview" aria-label="Vorschau der Obsidian-Notiz">
                <strong>{activeSource.label}</strong>
                <pre>{activeSource.text}</pre>
              </div>
            )}

            <label className="learning-field">
              <span>Mein Überblick</span>
              <textarea
                value={answers.overview}
                onChange={(event) => updateAnswer("overview", event.target.value)}
                maxLength={MAX_OVERVIEW_LENGTH}
                rows={5}
                placeholder="Welche Überschriften, Abschnitte und Kerngedanken erkennst du?"
                required
              />
            </label>
          </div>
        )}

        {currentStep === 1 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>Schritt 2 von 5</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>Fragen formulieren</h3>
              <p>Formuliere Fragen, die der Text nach dem Lesen beantworten soll.</p>
            </div>
            <label className="learning-field">
              <span>Meine Leitfragen</span>
              <textarea
                value={answers.questions}
                onChange={(event) => updateAnswer("questions", event.target.value)}
                maxLength={MAX_QUESTIONS_LENGTH}
                rows={9}
                placeholder="Eine Frage pro Zeile, zum Beispiel: Warum ist dieser Vorgang wichtig?"
                autoFocus
                required
              />
            </label>
          </div>
        )}

        {currentStep === 2 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>Schritt 3 von 5</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>Gezielt lesen</h3>
              <p>Suche im Quelltext nach Antworten auf deine Leitfragen.</p>
            </div>
            <div className="learning-source-preview" aria-label="Quelltext">
              <strong>{activeSource.label}</strong>
              <pre>{activeSource.text}</pre>
            </div>
            <label className="learning-field">
              <span>Notizen beim Lesen</span>
              <textarea
                value={answers.readingNotes}
                onChange={(event) => updateAnswer("readingNotes", event.target.value)}
                maxLength={MAX_READING_NOTES_LENGTH}
                rows={7}
                placeholder="Halte kurze Antworten und wichtige Zusammenhänge fest."
                required
              />
            </label>
          </div>
        )}

        {currentStep === 3 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>Schritt 4 von 5</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>Aus dem Gedächtnis wiedergeben</h3>
              <p>
                Der Quelltext ist jetzt verdeckt. Beantworte deine Fragen ohne
                nachzusehen.
              </p>
            </div>
            <div className="learning-question-reference">
              <strong>Deine Leitfragen</strong>
              <p>{answers.questions}</p>
            </div>
            <label className="learning-field">
              <span>Meine Wiedergabe</span>
              <textarea
                value={answers.recitation}
                onChange={(event) => updateAnswer("recitation", event.target.value)}
                maxLength={MAX_RECITATION_LENGTH}
                rows={10}
                placeholder="Schreibe die Antworten vollständig aus deinem Gedächtnis auf."
                autoFocus
                required
              />
            </label>
          </div>
        )}

        {currentStep === 4 && (
          <div className="learning-step-panel">
            <div className="learning-step-heading">
              <span>Schritt 5 von 5</span>
              <h3 ref={stepHeadingRef} tabIndex={-1}>Vergleichen und wiederholen</h3>
              <p>
                Vergleiche deine Wiedergabe selbst mit dem Quelltext. FokusDeck
                bewertet deine Formulierungen nicht automatisch.
              </p>
            </div>
            <div className="learning-comparison">
              <section className="learning-comparison-panel" aria-label="Eigene Wiedergabe">
                <strong>Meine Wiedergabe</strong>
                <p>{answers.recitation}</p>
              </section>
              <section className="learning-comparison-panel" aria-label="Quelltext">
                <strong>{activeSource.label}</strong>
                <pre>{activeSource.text}</pre>
              </section>
            </div>
            <label className="learning-field">
              <span>Erkenntnisse und nächste Wiederholung</span>
              <textarea
                value={answers.review}
                onChange={(event) => updateAnswer("review", event.target.value)}
                maxLength={MAX_REVIEW_LENGTH}
                rows={6}
                placeholder="Was saß bereits gut? Was möchtest du noch einmal wiederholen?"
                required
              />
            </label>

            <fieldset className="learning-gap-card">
              <legend>Optional: Wissenslücke als Karte speichern</legend>
              <label className="learning-field">
                <span>Frage</span>
                <textarea
                  value={gapQuestion}
                  onChange={(event) => {
                    setGapQuestion(event.target.value);
                    setFeedback("");
                  }}
                  maxLength={MAX_CARD_FRONT_LENGTH}
                  rows={3}
                  placeholder="Welche Frage möchtest du später wiederholen?"
                />
              </label>
              <label className="learning-field">
                <span>Antwort</span>
                <textarea
                  value={gapAnswer}
                  onChange={(event) => {
                    setGapAnswer(event.target.value);
                    setFeedback("");
                  }}
                  maxLength={MAX_CARD_BACK_LENGTH}
                  rows={4}
                  placeholder="Trage die richtige, kurze Antwort ein."
                />
              </label>
              <label className="learning-field">
                <span>Stapel</span>
                <input
                  type="text"
                  value={cardDeck}
                  onChange={(event) => {
                    setCardDeck(event.target.value);
                    setFeedback("");
                  }}
                  maxLength={MAX_DECK_LENGTH}
                  placeholder="SQ3R"
                />
              </label>
              <button
                type="button"
                className="learning-secondary-button"
                onClick={createGapCard}
              >
                Karte erstellen
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
            Zurück
          </button>
          <button
            type="button"
            className="learning-secondary-button"
            onClick={saveDraft}
          >
            Zwischenstand speichern
          </button>
          {currentStep < SQ3R_STEPS.length - 1 ? (
            <button
              type="button"
              className="learning-primary-button"
              onClick={goForward}
            >
              Weiter
            </button>
          ) : (
            <button type="submit" className="learning-primary-button">
              SQ3R abschließen
            </button>
          )}
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
