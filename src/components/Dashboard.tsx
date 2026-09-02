import type { Flashcard, TimerSettings } from "../types";
import type { useStudyTimer } from "../hooks/useStudyTimer";
import { CardsIcon, CheckIcon, ClockIcon, PinIcon } from "./Icons";
import { TimerCard } from "./TimerCard";
import { summarizeLearning } from "../lib/learning";

type StudyTimer = ReturnType<typeof useStudyTimer>;

interface DashboardProps {
  timer: StudyTimer;
  settings: TimerSettings;
  focusGoal: string;
  focusGoalLocked: boolean;
  cards: Flashcard[];
  onSettingsChange: (settings: TimerSettings) => void;
  onFocusGoalChange: (goal: string) => void;
  onTimerStart: () => void;
  onTimerReset: () => void;
  onTimerSkip: () => void;
  onOpenCards: () => void;
  onOpenLearning: () => void;
  onEnableOverlay: () => void;
}

export function Dashboard({
  timer,
  settings,
  focusGoal,
  focusGoalLocked,
  cards,
  onSettingsChange,
  onFocusGoalChange,
  onTimerStart,
  onTimerReset,
  onTimerSkip,
  onOpenCards,
  onOpenLearning,
  onEnableOverlay,
}: DashboardProps) {
  const learning = summarizeLearning(cards, new Date());

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
          phaseStarted={timer.phaseStarted}
          settings={settings}
          focusGoal={focusGoal}
          focusGoalLocked={focusGoalLocked}
          onStart={onTimerStart}
          onPause={timer.pause}
          onReset={onTimerReset}
          onSkip={onTimerSkip}
          onSettingsChange={onSettingsChange}
          onFocusGoalChange={onFocusGoalChange}
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
                  <strong>{learning.dueNow}</strong>
                  <span>heute fällige Karten</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-icon stat-icon--blue">
                  <CardsIcon />
                </span>
                <div>
                  <strong>{learning.matureCards}</strong>
                  <span>langfristig gefestigt</span>
                </div>
              </div>
            </div>
          </section>

          <button type="button" className="deck-shortcut" onClick={onOpenLearning}>
            <span>
              <small>Heute lernen</small>
              <strong>{cards.length ? `${learning.dueNow} Karten sind jetzt fällig` : "Erstelle deine erste Karte"}</strong>
            </span>
            <span className="deck-shortcut__cards" aria-hidden="true">
              <i />
              <i />
              <i>?</i>
            </span>
          </button>
          {cards.length === 0 && (
            <button type="button" className="text-button" onClick={onOpenCards}>
              Karteikarten anlegen
            </button>
          )}
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
