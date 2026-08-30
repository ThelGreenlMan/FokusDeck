import type { Flashcard, TimerSettings } from "../types";
import type { useStudyTimer } from "../hooks/useStudyTimer";
import { CardsIcon, CheckIcon, ClockIcon, PinIcon } from "./Icons";
import { TimerCard } from "./TimerCard";

type StudyTimer = ReturnType<typeof useStudyTimer>;

interface DashboardProps {
  timer: StudyTimer;
  settings: TimerSettings;
  cards: Flashcard[];
  onSettingsChange: (settings: TimerSettings) => void;
  onOpenCards: () => void;
  onEnableOverlay: () => void;
}

export function Dashboard({
  timer,
  settings,
  cards,
  onSettingsChange,
  onOpenCards,
  onEnableOverlay,
}: DashboardProps) {
  const masteredCards = cards.filter((card) => card.mastered).length;
  const openCards = Math.max(0, cards.length - masteredCards);

  return (
    <main className="page-content">
      <header className="page-intro">
        <div>
          <p className="eyebrow">Dein Lernraum</p>
          <h1>Bereit für konzentriertes Lernen?</h1>
          <p>
            Stell deinen Rhythmus ein, blende Ablenkungen aus und festige dein
            Wissen Karte für Karte.
          </p>
        </div>
        <button type="button" className="overlay-button" onClick={onEnableOverlay}>
          <PinIcon />
          Overlay starten
        </button>
      </header>

      <div className="dashboard-grid">
        <TimerCard
          mode={timer.mode}
          remainingSeconds={timer.remainingSeconds}
          totalSeconds={timer.totalSeconds}
          isRunning={timer.isRunning}
          settings={settings}
          onStart={timer.start}
          onPause={timer.pause}
          onReset={timer.reset}
          onSkip={timer.skip}
          onSettingsChange={onSettingsChange}
        />

        <aside className="dashboard-side">
          <section className="stat-panel">
            <div className="section-heading section-heading--small">
              <div>
                <p className="eyebrow">Heute</p>
                <h2>Dein Fortschritt</h2>
              </div>
            </div>

            <div className="stat-list">
              <div className="stat-row">
                <span className="stat-icon stat-icon--green">
                  <ClockIcon />
                </span>
                <div>
                  <strong>{timer.completedSessions}</strong>
                  <span>Fokusphasen</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-icon stat-icon--yellow">
                  <CheckIcon />
                </span>
                <div>
                  <strong>{masteredCards}</strong>
                  <span>Karten gemeistert</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-icon stat-icon--blue">
                  <CardsIcon />
                </span>
                <div>
                  <strong>{openCards}</strong>
                  <span>Karten zum Wiederholen</span>
                </div>
              </div>
            </div>
          </section>

          <button type="button" className="deck-shortcut" onClick={onOpenCards}>
            <span>
              <small>Karteikarten</small>
              <strong>{cards.length ? `${cards.length} Karten warten auf dich` : "Erstelle deine erste Karte"}</strong>
            </span>
            <span className="deck-shortcut__cards" aria-hidden="true">
              <i />
              <i />
              <i>?</i>
            </span>
          </button>
        </aside>
      </div>

      <section className="focus-tip">
        <span className="focus-tip__icon">✦</span>
        <div>
          <strong>Ein kleiner Fokus-Tipp</strong>
          <p>
            Formuliere vor dem Start ein konkretes Lernziel. „Kapitel 3
            zusammenfassen“ ist leichter zu beginnen als „Mathe lernen“.
          </p>
        </div>
      </section>
    </main>
  );
}
