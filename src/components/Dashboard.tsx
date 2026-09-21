import type { Flashcard, TimerSettings } from "../types";
import type { useStudyTimer } from "../hooks/useStudyTimer";
import { CardsIcon, CheckIcon, ClockIcon, PinIcon } from "./Icons";
import { TimerCard } from "./TimerCard";
import { summarizeLearning } from "../lib/learning";
import { useI18n } from "../i18n";

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
  const { t, formatNumber } = useI18n();
  const learning = summarizeLearning(cards, new Date());

  return (
    <main className="page-content">
      <header className="page-intro">
        <div>
          <p className="eyebrow">{t("dashboard.eyebrow")}</p>
          <h1>{t("dashboard.heading")}</h1>
          <p>{t("dashboard.intro")}</p>
        </div>
        <button type="button" className="overlay-button" onClick={onEnableOverlay}>
          <PinIcon />
          {t("dashboard.startOverlay")}
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
                <p className="eyebrow">{t("dashboard.today")}</p>
                <h2>{t("dashboard.progress")}</h2>
              </div>
            </div>

            <div className="stat-list">
              <div className="stat-row">
                <span className="stat-icon stat-icon--green">
                  <ClockIcon />
                </span>
                <div>
                  <strong>{formatNumber(timer.completedSessions)}</strong>
                  <span>{t("dashboard.focusSessions")}</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-icon stat-icon--yellow">
                  <CheckIcon />
                </span>
                <div>
                  <strong>{formatNumber(learning.dueNow)}</strong>
                  <span>{t("dashboard.dueCards")}</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-icon stat-icon--blue">
                  <CardsIcon />
                </span>
                <div>
                  <strong>{formatNumber(learning.matureCards)}</strong>
                  <span>{t("dashboard.matureCards")}</span>
                </div>
              </div>
            </div>
          </section>

          <button type="button" className="deck-shortcut" onClick={onOpenLearning}>
            <span>
              <small>{t("app.nav.learning")}</small>
              <strong>{cards.length ? t("dashboard.cardsNow", { count: learning.dueNow }) : t("dashboard.firstCard")}</strong>
            </span>
            <span className="deck-shortcut__cards" aria-hidden="true">
              <i />
              <i />
              <i>?</i>
            </span>
          </button>
          {cards.length === 0 && (
            <button type="button" className="text-button" onClick={onOpenCards}>
              {t("dashboard.createCards")}
            </button>
          )}
        </aside>
      </div>

      <section className="focus-tip">
        <span className="focus-tip__icon">✦</span>
        <div>
          <strong>{t("dashboard.tipHeading")}</strong>
          <p>{t("dashboard.tip")}</p>
        </div>
      </section>
    </main>
  );
}
