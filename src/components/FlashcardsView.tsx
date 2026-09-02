import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Flashcard, ObsidianSource } from "../types";
import {
  loadCollectionFile,
  mergeCollection,
  saveCollectionFile,
  type FokusDeckCollection,
} from "../lib/collection";
import { loadCsvFile } from "../lib/csv";
import { isTauriDesktop } from "../lib/obsidian";
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

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function FlashcardsView({
  cards,
  onCardsChange,
  onOpenObsidianSource,
}: FlashcardsViewProps) {
  const [selectedDeck, setSelectedDeck] = useState("Alle Karten");
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [deck, setDeck] = useState("Allgemein");
  const [isCollectionBusy, setIsCollectionBusy] = useState(false);
  const [collectionMessage, setCollectionMessage] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const isDesktop = isTauriDesktop();

  const decks = useMemo(
    () => ["Alle Karten", ...Array.from(new Set(cards.map((card) => card.deck)))],
    [cards],
  );

  const filteredCards = useMemo(
    () =>
      selectedDeck === "Alle Karten"
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
    setSelectedDeck("Alle Karten");
    const sourceText = pendingImport.source === "csv" ? " aus CSV importiert" : " geladen";
    setCollectionMessage(
      `${pendingImport.collection.name}: ${result.imported} ${result.imported === 1 ? "Karte" : "Karten"}${sourceText}` +
        (result.updated
          ? `, ${result.updated} ${result.updated === 1 ? "Lernstand" : "Lernstände"} aktualisiert`
          : "") +
        (result.skipped ? `, ${result.skipped} Dubletten übersprungen.` : "."),
    );
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
    setCollectionMessage("");
    setCollectionError("");
    try {
      const collection = await loadCollectionFile();
      if (!collection) return;
      setPendingImport({ collection, source: "collection" });
    } catch (error) {
      setCollectionError(
        error instanceof Error ? error.message : `Laden fehlgeschlagen: ${String(error)}`,
      );
    } finally {
      setIsCollectionBusy(false);
    }
  };

  const importCsv = async () => {
    setIsCollectionBusy(true);
    setCollectionMessage("");
    setCollectionError("");
    try {
      const collection = await loadCsvFile();
      if (!collection) return;
      setPendingImport({ collection, source: "csv" });
    } catch (error) {
      setCollectionError(
        error instanceof Error ? error.message : `CSV-Import fehlgeschlagen: ${String(error)}`,
      );
    } finally {
      setIsCollectionBusy(false);
    }
  };

  const saveCollection = async () => {
    setIsCollectionBusy(true);
    setCollectionMessage("");
    setCollectionError("");
    try {
      const collectionName =
        selectedDeck === "Alle Karten" ? "FokusDeck-Sammlung" : selectedDeck;
      const saved = await saveCollectionFile(filteredCards, collectionName);
      if (saved) {
        setCollectionMessage(
          `${filteredCards.length} ${filteredCards.length === 1 ? "Karte" : "Karten"} als ${collectionName} gespeichert.`,
        );
      }
    } catch (error) {
      setCollectionError(
        error instanceof Error ? error.message : `Speichern fehlgeschlagen: ${String(error)}`,
      );
    } finally {
      setIsCollectionBusy(false);
    }
  };

  return (
    <main className="page-content flashcards-page">
      <header className="page-intro page-intro--cards">
        <div>
          <p className="eyebrow">Wissen festigen</p>
          <h1>Deine Karteikarten</h1>
          <p>Aktives Abrufen macht aus Gelesenem langfristiges Wissen.</p>
        </div>
        <div className="collection-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void importCsv()}
            disabled={!isDesktop || isCollectionBusy}
            title={isDesktop ? "Karteikarten aus einer CSV-Datei importieren" : "Nur in der Desktop-App verfügbar"}
          >
            <CsvIcon />
            CSV importieren
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void loadCollection()}
            disabled={!isDesktop || isCollectionBusy}
            title={isDesktop ? "Eine FokusDeck-Sammlung dazuladen" : "Nur in der Desktop-App verfügbar"}
          >
            <LoadIcon />
            Sammlung laden
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void saveCollection()}
            disabled={!isDesktop || isCollectionBusy || filteredCards.length === 0}
            title={
              selectedDeck === "Alle Karten"
                ? "Alle Karten als Sammlung speichern"
                : `Den Stapel ${selectedDeck} als Sammlung speichern`
            }
          >
            <SaveIcon />
            Sammlung speichern
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowForm((current) => !current)}
          >
            <PlusIcon />
            Neue Karte
          </button>
        </div>
      </header>

      {(collectionMessage || collectionError) && (
        <p
          className={`collection-feedback ${collectionError ? "is-error" : "is-success"}`}
          role="status"
        >
          {collectionError || collectionMessage}
        </p>
      )}

      {showForm && (
        <form className="new-card-form" onSubmit={addCard}>
          <div className="section-heading section-heading--small">
            <div>
              <p className="eyebrow">Neue Lernkarte</p>
              <h2>Frage und Antwort eintragen</h2>
            </div>
          </div>
          <label>
            <span>Vorderseite / Frage</span>
            <textarea
              value={front}
              onChange={(event) => setFront(event.target.value)}
              placeholder="z. B. Was bedeutet Photosynthese?"
              maxLength={1_000}
              autoFocus
              required
            />
          </label>
          <label>
            <span>Rückseite / Antwort</span>
            <textarea
              value={back}
              onChange={(event) => setBack(event.target.value)}
              placeholder="Deine kurze, eindeutige Antwort"
              maxLength={4_000}
              required
            />
          </label>
          <label>
            <span>Stapel</span>
            <input
              value={deck}
              onChange={(event) => setDeck(event.target.value)}
              placeholder="Allgemein"
              maxLength={100}
              list="deck-options"
            />
            <datalist id="deck-options">
              {decks.slice(1).map((deckName) => (
                <option key={deckName} value={deckName} />
              ))}
            </datalist>
          </label>
          <div className="new-card-form__actions">
            <button type="button" className="text-button" onClick={() => setShowForm(false)}>
              Abbrechen
            </button>
            <button type="submit" className="primary-button">
              Karte speichern
            </button>
          </div>
        </form>
      )}

      <div className="cards-layout">
        <aside className="decks-panel">
          <div className="decks-panel__heading">
            <LayersIcon />
            <strong>Stapel</strong>
          </div>
          <div className="deck-list">
            {decks.map((deckName) => {
              const count =
                deckName === "Alle Karten"
                  ? cards.length
                  : cards.filter((card) => card.deck === deckName).length;
              return (
                <button
                  key={deckName}
                  type="button"
                  className={selectedDeck === deckName ? "is-active" : ""}
                  onClick={() => setSelectedDeck(deckName)}
                >
                  <span>{deckName}</span>
                  <small>{count}</small>
                </button>
              );
            })}
          </div>
          <div className="deck-progress">
            <div>
              <span>Heute fällig</span>
              <strong>{dueCount}/{filteredCards.length}</strong>
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
                  Karte {cardIndex + 1} von {filteredCards.length}
                </span>
              </div>
              <button
                type="button"
                className={`flashcard ${isFlipped ? "is-flipped" : ""}`}
                onClick={() => setIsFlipped((current) => !current)}
                aria-label={`${isFlipped ? "Antwort" : "Frage"}: ${isFlipped ? currentCard.back : currentCard.front}. Klicken zum ${isFlipped ? "Zurückdrehen" : "Aufdecken"}.`}
              >
                <span className="flashcard__label">
                  {isFlipped ? "ANTWORT" : "FRAGE"}
                </span>
                <strong>{isFlipped ? currentCard.back : currentCard.front}</strong>
                <span className="flashcard__hint">
                  Karte anklicken zum {isFlipped ? "Zurückdrehen" : "Aufdecken"}
                </span>
              </button>

              <div className="study-actions">
                <button
                  type="button"
                  className="study-action study-action--repeat"
                  onClick={() => updateMastery(false)}
                >
                  Nochmal
                </button>
                <button
                  type="button"
                  className="study-action study-action--known"
                  onClick={() => updateMastery(true)}
                >
                  <CheckIcon />
                  Gut
                </button>
                <button
                  type="button"
                  className="study-action study-action--next"
                  onClick={goToNextCard}
                >
                  Weiter
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
                  In Obsidian öffnen · {currentCard.source.relativePath}
                </button>
              ) : (
                <button
                  type="button"
                  className="delete-card-button"
                  onClick={deleteCurrentCard}
                >
                  <TrashIcon />
                  Karte löschen
                </button>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span><CardsIcon /></span>
              <h2>Noch keine Karten in diesem Stapel</h2>
              <p>Erstelle eine Karte und beginne direkt mit dem Abrufen.</p>
              <button type="button" className="primary-button" onClick={() => setShowForm(true)}>
                <PlusIcon />
                Erste Karte erstellen
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
