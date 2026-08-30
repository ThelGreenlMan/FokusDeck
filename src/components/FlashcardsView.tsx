import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Flashcard } from "../types";
import {
  CardsIcon,
  CheckIcon,
  ChevronIcon,
  LayersIcon,
  PlusIcon,
  TrashIcon,
} from "./Icons";

interface FlashcardsViewProps {
  cards: Flashcard[];
  onCardsChange: (cards: Flashcard[]) => void;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function FlashcardsView({ cards, onCardsChange }: FlashcardsViewProps) {
  const [selectedDeck, setSelectedDeck] = useState("Alle Karten");
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [deck, setDeck] = useState("Allgemein");

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
  const masteredCount = filteredCards.filter((card) => card.mastered).length;

  useEffect(() => {
    setCardIndex(0);
    setIsFlipped(false);
  }, [selectedDeck]);

  useEffect(() => {
    if (cardIndex >= filteredCards.length) {
      setCardIndex(Math.max(0, filteredCards.length - 1));
    }
  }, [cardIndex, filteredCards.length]);

  const goToNextCard = () => {
    if (!filteredCards.length) return;
    setCardIndex((current) => (current + 1) % filteredCards.length);
    setIsFlipped(false);
  };

  const updateMastery = (mastered: boolean) => {
    if (!currentCard) return;
    onCardsChange(
      cards.map((card) =>
        card.id === currentCard.id ? { ...card, mastered } : card,
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

  return (
    <main className="page-content flashcards-page">
      <header className="page-intro page-intro--cards">
        <div>
          <p className="eyebrow">Wissen festigen</p>
          <h1>Deine Karteikarten</h1>
          <p>Aktives Abrufen macht aus Gelesenem langfristiges Wissen.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setShowForm((current) => !current)}
        >
          <PlusIcon />
          Neue Karte
        </button>
      </header>

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
              required
            />
          </label>
          <label>
            <span>Stapel</span>
            <input
              value={deck}
              onChange={(event) => setDeck(event.target.value)}
              placeholder="Allgemein"
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
              <span>Gemeistert</span>
              <strong>{masteredCount}/{filteredCards.length}</strong>
            </div>
            <span className="progress-track">
              <span
                style={{
                  width: `${filteredCards.length ? (masteredCount / filteredCards.length) * 100 : 0}%`,
                }}
              />
            </span>
          </div>
        </aside>

        <section className="study-panel">
          {currentCard ? (
            <>
              <div className="study-panel__meta">
                <span>{currentCard.deck}</span>
                <span>
                  Karte {cardIndex + 1} von {filteredCards.length}
                </span>
              </div>
              <button
                type="button"
                className={`flashcard ${isFlipped ? "is-flipped" : ""}`}
                onClick={() => setIsFlipped((current) => !current)}
                aria-label={isFlipped ? "Antwort anzeigen. Klicken, um die Frage zu sehen." : "Frage anzeigen. Klicken, um die Antwort zu sehen."}
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
                  Noch einmal
                </button>
                <button
                  type="button"
                  className="study-action study-action--known"
                  onClick={() => updateMastery(true)}
                >
                  <CheckIcon />
                  Gewusst
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

              <button
                type="button"
                className="delete-card-button"
                onClick={deleteCurrentCard}
              >
                <TrashIcon />
                Karte löschen
              </button>
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
