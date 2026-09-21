import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Flashcard, ObsidianSource } from "../types";
import { formatNumber, useI18n } from "../i18n";
import {
  loadCollectionFile,
  mergeCollection,
  saveCollectionFile,
  type FokusDeckCollection,
} from "../lib/collection";
import { loadCsvFile } from "../lib/csv";
import { isTauriDesktop, localizeNativeError } from "../lib/obsidian";
import { reviewLearningCard, summarizeLearning } from "../lib/learning";
import {
  CardsIcon,
  CheckIcon,
  ChevronIcon,
  CsvIcon,
  ExternalLinkIcon,
  LayersIcon,
  LoadIcon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
} from "./Icons";

interface FlashcardsViewProps {
  cards: Flashcard[];
  onCardsChange: (cards: Flashcard[]) => void;
  onOpenObsidianSource: (source: ObsidianSource) => void;
}

interface PendingImport {
  collection: FokusDeckCollection;
  source: "collection" | "csv";
}

type CollectionFeedback =
  | { kind: "saved"; name: string; count: number }
  | { kind: "import"; name: string; source: PendingImport["source"]; imported: number; updated: number; skipped: number };

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function FlashcardsView({
  cards,
  onCardsChange,
  onOpenObsidianSource,
}: FlashcardsViewProps) {
  const { t } = useI18n();
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [deck, setDeck] = useState("");
  const [isCollectionBusy, setIsCollectionBusy] = useState(false);
  const [collectionMessage, setCollectionMessage] = useState<CollectionFeedback | null>(null);
  const [collectionError, setCollectionError] = useState<{ key: string; error: unknown } | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const isDesktop = isTauriDesktop();

  const decks = useMemo(
    () => Array.from(new Set(cards.map((card) => card.deck))),
    [cards],
  );

  const filteredCards = useMemo(
    () =>
      selectedDeck === null
        ? cards
        : cards.filter((card) => card.deck === selectedDeck),
    [cards, selectedDeck],
  );

  const currentCard = filteredCards[cardIndex];
  const dueCount = summarizeLearning(filteredCards, new Date()).dueNow;

  useEffect(() => {
    setCardIndex(0);
    setIsFlipped(false);
  }, [selectedDeck]);

  useEffect(() => {
    if (cardIndex >= filteredCards.length) {
      setCardIndex(Math.max(0, filteredCards.length - 1));
    }
  }, [cardIndex, filteredCards.length]);

  useEffect(() => {
    if (!pendingImport) return;
    const result = mergeCollection(cards, pendingImport.collection);
    onCardsChange(result.cards);
    setSelectedDeck(null);
    setCollectionMessage({
      kind: "import", name: pendingImport.collection.name, source: pendingImport.source,
      imported: result.imported, updated: result.updated, skipped: result.skipped,
    });
    setPendingImport(null);
  }, [cards, onCardsChange, pendingImport]);

  const goToNextCard = () => {
    if (!filteredCards.length) return;
    setCardIndex((current) => (current + 1) % filteredCards.length);
    setIsFlipped(false);
  };

  const updateMastery = (mastered: boolean) => {
    if (!currentCard) return;
    onCardsChange(
      cards.map((card) =>
        card.id === currentCard.id
          ? reviewLearningCard(card, mastered ? "good" : "again", new Date())
          : card,
      ),
    );
    goToNextCard();
  };

  const addCard = (event: FormEvent) => {
    event.preventDefault();
    if (!front.trim() || !back.trim()) return;

    const nextCard: Flashcard = {
      id: createId(),
      front: front.trim(),
      back: back.trim(),
      // Keep the historical default stable across languages and CSV imports.
      deck: deck.trim() || "Allgemein",
      mastered: false,
      createdAt: new Date().toISOString(),
    };
    onCardsChange([...cards, nextCard]);
    setFront("");
    setBack("");
    setShowForm(false);
    setSelectedDeck(nextCard.deck);
  };

  const deleteCurrentCard = () => {
    if (!currentCard) return;
    onCardsChange(cards.filter((card) => card.id !== currentCard.id));
    setIsFlipped(false);
  };

  const loadCollection = async () => {
    setIsCollectionBusy(true);
    setCollectionMessage(null);
    setCollectionError(null);
    try {
      const collection = await loadCollectionFile();
      if (!collection) return;
      setPendingImport({ collection, source: "collection" });
    } catch (error) {
      setCollectionError({ key: "study.feedback.loadFailed", error });
    } finally {
      setIsCollectionBusy(false);
    }
  };

  const importCsv = async () => {
    setIsCollectionBusy(true);
    setCollectionMessage(null);
    setCollectionError(null);
    try {
      const collection = await loadCsvFile();
      if (!collection) return;
      setPendingImport({ collection, source: "csv" });
    } catch (error) {
      setCollectionError({ key: "study.feedback.csvFailed", error });
    } finally {
      setIsCollectionBusy(false);
    }
  };

  const saveCollection = async () => {
    setIsCollectionBusy(true);
    setCollectionMessage(null);
    setCollectionError(null);
    try {
      const collectionName =
        selectedDeck === null ? "FokusDeck-Sammlung" : selectedDeck;
      const saved = await saveCollectionFile(filteredCards, collectionName);
      if (saved) {
        setCollectionMessage({ kind: "saved", name: collectionName, count: filteredCards.length });
      }
    } catch (error) {
      setCollectionError({ key: "study.feedback.saveFailed", error });
    } finally {
      setIsCollectionBusy(false);
    }
  };

  return (
    <main className="page-content flashcards-page">
      <header className="page-intro page-intro--cards">
        <div>
          <p className="eyebrow">{t("study.cards.eyebrow")}</p>
          <h1>{t("study.cards.title")}</h1>
          <p>{t("study.cards.description")}</p>
        </div>
        <div className="collection-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void importCsv()}
            disabled={!isDesktop || isCollectionBusy}
            title={t(isDesktop ? "study.cards.csvHint" : "study.desktopOnly")}
          >
            <CsvIcon />
            {t("study.cards.importCsv")}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void loadCollection()}
            disabled={!isDesktop || isCollectionBusy}
            title={t(isDesktop ? "study.cards.loadHint" : "study.desktopOnly")}
          >
            <LoadIcon />
            {t("study.cards.load")}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void saveCollection()}
            disabled={!isDesktop || isCollectionBusy || filteredCards.length === 0}
            title={
              selectedDeck === null
                ? t("study.cards.saveAllHint")
                : t("study.cards.saveDeckHint", { name: selectedDeck })
            }
          >
            <SaveIcon />
            {t("study.cards.save")}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowForm((current) => !current)}
          >
            <PlusIcon />
            {t("study.cards.new")}
          </button>
        </div>
      </header>

      {(collectionMessage || collectionError) && (
        <p
          className={`collection-feedback ${collectionError ? "is-error" : "is-success"}`}
          role="status"
        >
          {collectionError
            ? t(collectionError.key, { error: localizeNativeError(collectionError.error) })
            : collectionMessage?.kind === "saved"
              ? t("study.feedback.saved", { name: collectionMessage.name, count: collectionMessage.count })
              : collectionMessage?.kind === "import"
                ? t(collectionMessage.source === "csv" ? "study.feedback.csvLoaded" : "study.feedback.loaded", { name: collectionMessage.name, count: collectionMessage.imported })
                  + (collectionMessage.updated ? t("study.feedback.updated", { count: collectionMessage.updated }) : "")
                  + (collectionMessage.skipped ? t("study.feedback.skipped", { count: collectionMessage.skipped }) : ".")
                : null}
        </p>
      )}

      {showForm && (
        <form className="new-card-form" onSubmit={addCard}>
          <div className="section-heading section-heading--small">
            <div>
              <p className="eyebrow">{t("study.cards.formEyebrow")}</p>
              <h2>{t("study.cards.formTitle")}</h2>
            </div>
          </div>
          <label>
            <span>{t("study.cards.frontLabel")}</span>
            <textarea
              value={front}
              onChange={(event) => setFront(event.target.value)}
              placeholder={t("study.cards.frontPlaceholder")}
              maxLength={1_000}
              autoFocus
              required
            />
          </label>
          <label>
            <span>{t("study.cards.backLabel")}</span>
            <textarea
              value={back}
              onChange={(event) => setBack(event.target.value)}
              placeholder={t("study.cards.backPlaceholder")}
              maxLength={4_000}
              required
            />
          </label>
          <label>
            <span>{t("study.deck")}</span>
            <input
              value={deck}
              onChange={(event) => setDeck(event.target.value)}
              placeholder={t("study.generalDeck")}
              maxLength={100}
              list="deck-options"
            />
            <datalist id="deck-options">
              {decks.map((deckName) => (
                <option key={deckName} value={deckName} />
              ))}
            </datalist>
          </label>
          <div className="new-card-form__actions">
            <button type="button" className="text-button" onClick={() => setShowForm(false)}>
              {t("study.cancel")}
            </button>
            <button type="submit" className="primary-button">
              {t("study.cards.saveCard")}
            </button>
          </div>
        </form>
      )}

      <div className="cards-layout">
        <aside className="decks-panel">
          <div className="decks-panel__heading">
            <LayersIcon />
            <strong>{t("study.decks")}</strong>
          </div>
          <div className="deck-list">
            {[null, ...decks].map((deckName) => {
              const count =
                deckName === null
                  ? cards.length
                  : cards.filter((card) => card.deck === deckName).length;
              return (
                <button
                  key={deckName === null ? "all" : `deck:${deckName}`}
                  type="button"
                  className={selectedDeck === deckName ? "is-active" : ""}
                  onClick={() => setSelectedDeck(deckName)}
                >
                  <span>{deckName ?? t("study.cards.allCards")}</span>
                  <small>{formatNumber(count)}</small>
                </button>
              );
            })}
          </div>
          <div className="deck-progress">
            <div>
              <span>{t("study.cards.dueToday")}</span>
              <strong>{formatNumber(dueCount)}/{formatNumber(filteredCards.length)}</strong>
            </div>
            <span className="progress-track">
              <span
                style={{
                  width: `${filteredCards.length ? (dueCount / filteredCards.length) * 100 : 0}%`,
                }}
              />
            </span>
          </div>
        </aside>

        <section className="study-panel">
          {currentCard ? (
            <>
              <div className="study-panel__meta">
                <span>
                  {currentCard.deck}
                  {currentCard.source && " · Obsidian"}
                </span>
                <span>
                  {t("study.cardPosition", { position: cardIndex + 1, total: filteredCards.length })}
                </span>
              </div>
              <button
                type="button"
                className={`flashcard ${isFlipped ? "is-flipped" : ""}`}
                onClick={() => setIsFlipped((current) => !current)}
                aria-label={t(isFlipped ? "study.cards.answerAria" : "study.cards.questionAria", { text: isFlipped ? currentCard.back : currentCard.front })}
              >
                <span className="flashcard__label">
                  {t(isFlipped ? "study.cards.answerLabel" : "study.cards.questionLabel")}
                </span>
                <strong>{isFlipped ? currentCard.back : currentCard.front}</strong>
                <span className="flashcard__hint">
                  {t(isFlipped ? "study.cards.flipBackHint" : "study.cards.revealHint")}
                </span>
              </button>

              <div className="study-actions">
                <button
                  type="button"
                  className="study-action study-action--repeat"
                  onClick={() => updateMastery(false)}
                >
                  {t("study.cards.again")}
                </button>
                <button
                  type="button"
                  className="study-action study-action--known"
                  onClick={() => updateMastery(true)}
                >
                  <CheckIcon />
                  {t("study.cards.good")}
                </button>
                <button
                  type="button"
                  className="study-action study-action--next"
                  onClick={goToNextCard}
                >
                  {t("study.cards.next")}
                  <ChevronIcon />
                </button>
              </div>

              {currentCard.source ? (
                <button
                  type="button"
                  className="source-card-button"
                  onClick={() => onOpenObsidianSource(currentCard.source!)}
                  title={currentCard.source.relativePath}
                >
                  <ExternalLinkIcon />
                  {t("study.cards.openObsidian", { path: currentCard.source.relativePath })}
                </button>
              ) : (
                <button
                  type="button"
                  className="delete-card-button"
                  onClick={deleteCurrentCard}
                >
                  <TrashIcon />
                  {t("study.cards.delete")}
                </button>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span><CardsIcon /></span>
              <h2>{t("study.cards.emptyTitle")}</h2>
              <p>{t("study.cards.emptyDescription")}</p>
              <button type="button" className="primary-button" onClick={() => setShowForm(true)}>
                <PlusIcon />
                {t("study.cards.createFirst")}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
