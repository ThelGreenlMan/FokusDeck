import { useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "./components/Brand";
import { Dashboard } from "./components/Dashboard";
import { FlashcardsView } from "./components/FlashcardsView";
import { LearningView } from "./components/LearningView";
import {
  CardsIcon,
  CloseIcon,
  HomeIcon,
  LearnIcon,
  PinIcon,
  SettingsIcon,
} from "./components/Icons";
import { SettingsView } from "./components/SettingsView";
import { TimerCard } from "./components/TimerCard";
import { usePersistentState } from "./hooks/usePersistentState";
import { useStudyTimer } from "./hooks/useStudyTimer";
import {
  cardsFromVaultScan,
  chooseObsidianVault,
  connectionFromScan,
  isTauriDesktop,
  mergeVaultCards,
  openObsidianSource,
  removeVaultCards,
  scanObsidianVault,
  type VaultNote,
} from "./lib/obsidian";
import {
  normalizeLearningCards,
  normalizeLearningProgress,
  type LearningProgress,
} from "./lib/learning";
import type {
  AppView,
  Flashcard,
  ObsidianConnection,
  ObsidianSource,
  TimerSettings,
} from "./types";

const initialSettings: TimerSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
};

const starterCards: Flashcard[] = [
  {
    id: "starter-active-recall",
    front: "Was bedeutet Active Recall?",
    back: "Wissen aktiv aus dem Gedächtnis abrufen, statt es nur erneut zu lesen.",
    deck: "Lernmethoden",
    mastered: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "starter-spacing",
    front: "Warum sind verteilte Wiederholungen wirksam?",
    back: "Sie greifen kurz vor dem Vergessen ein und stärken dadurch die Erinnerung langfristig.",
    deck: "Lernmethoden",
    mastered: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "starter-pomodoro",
    front: "Was ist das Ziel einer Fokusphase?",
    back: "Eine klar definierte Aufgabe ohne Unterbrechung zu bearbeiten.",
    deck: "Fokus",
    mastered: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeMinutes(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(180, Math.max(1, Math.round(value)))
    : fallback;
}

function safeTimerSettings(value: unknown): TimerSettings {
  const stored = asRecord(value);
  return {
    focusMinutes: safeMinutes(stored?.focusMinutes, initialSettings.focusMinutes),
    breakMinutes: safeMinutes(stored?.breakMinutes, initialSettings.breakMinutes),
  };
}

function safeObsidianSource(value: unknown): ObsidianSource | undefined {
  const source = asRecord(value);
  if (
    source?.type !== "obsidian" ||
    typeof source.vaultName !== "string" ||
    typeof source.vaultPath !== "string" ||
    typeof source.relativePath !== "string" ||
    typeof source.modifiedAt !== "number" ||
    !Number.isFinite(source.modifiedAt)
  ) {
    return undefined;
  }
  return {
    type: "obsidian",
    vaultName: source.vaultName.slice(0, 200),
    vaultPath: source.vaultPath,
    relativePath: source.relativePath,
    modifiedAt: source.modifiedAt,
  };
}

function safeCards(value: unknown): Flashcard[] {
  if (!Array.isArray(value)) return normalizeLearningCards(starterCards, new Date());

  const cards: Flashcard[] = [];
  const usedIds = new Set<string>();
  for (const candidate of value.slice(0, 5_000)) {
    const stored = asRecord(candidate);
    if (
      !stored ||
      typeof stored.id !== "string" ||
      !stored.id.trim() ||
      typeof stored.front !== "string" ||
      !stored.front.trim() ||
      typeof stored.back !== "string" ||
      !stored.back.trim() ||
      typeof stored.deck !== "string" ||
      !stored.deck.trim()
    ) {
      continue;
    }

    const id = stored.id.trim().slice(0, 300);
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    const createdAt =
      typeof stored.createdAt === "string" &&
      Number.isFinite(Date.parse(stored.createdAt))
        ? stored.createdAt
        : new Date().toISOString();
    const source = safeObsidianSource(stored.source);
    cards.push({
      id,
      front: stored.front.trim().slice(0, 1_000),
      back: stored.back.trim().slice(0, 4_000),
      deck: stored.deck.trim().slice(0, 100),
      mastered: stored.mastered === true,
      createdAt,
      learning:
        stored.learning === undefined
          ? undefined
          : normalizeLearningProgress(stored.learning, createdAt),
      ...(source ? { source } : {}),
    });
  }
  return normalizeLearningCards(cards, new Date());
}

function safeObsidianConnection(value: unknown): ObsidianConnection | null {
  const stored = asRecord(value);
  if (
    !stored ||
    typeof stored.vaultName !== "string" ||
    typeof stored.vaultPath !== "string" ||
    !stored.vaultPath.trim()
  ) {
    return null;
  }
  const count = (entry: unknown) =>
    typeof entry === "number" && Number.isFinite(entry)
      ? Math.max(0, Math.floor(entry))
      : 0;
  return {
    vaultName: stored.vaultName.slice(0, 200),
    vaultPath: stored.vaultPath,
    lastSyncAt: count(stored.lastSyncAt),
    scannedMarkdownFiles: count(stored.scannedMarkdownFiles),
    importedCards: count(stored.importedCards),
  };
}

interface SavedObsidianProgress {
  mastered: boolean;
  learning?: LearningProgress;
}

function safeObsidianProgress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, SavedObsidianProgress>;
  }
  const result: Record<string, SavedObsidianProgress> = {};
  for (const [id, candidate] of Object.entries(value).slice(-5_000)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const stored = candidate as Record<string, unknown>;
    result[id] = {
      mastered: stored.mastered === true,
      learning:
        stored.learning === undefined
          ? undefined
          : normalizeLearningProgress(stored.learning, new Date()),
    };
  }
  return result;
}

async function configureDesktopOverlay(enabled: boolean) {
  if (!window.__TAURI_INTERNALS__) return;

  const [{ getCurrentWindow }, { LogicalSize }] = await Promise.all([
    import("@tauri-apps/api/window"),
    import("@tauri-apps/api/dpi"),
  ]);
  const appWindow = getCurrentWindow();

  await appWindow.setAlwaysOnTop(enabled);
  if (enabled) {
    await appWindow.setMinSize(new LogicalSize(360, 220));
    await appWindow.setSize(new LogicalSize(420, 300));
  } else {
    await appWindow.setSize(new LogicalSize(1180, 760));
    await appWindow.setMinSize(new LogicalSize(960, 640));
  }
}

function App() {
  const [activeView, setActiveView] = useState<AppView>("learning");
  const [settings, setSettings] = usePersistentState<TimerSettings>(
    "fokusdeck:timer-settings",
    initialSettings,
    safeTimerSettings,
  );
  const [cards, setCards, cardsStorageError] = usePersistentState<Flashcard[]>(
    "fokusdeck:flashcards",
    starterCards,
    safeCards,
  );
  const [obsidianConnection, setObsidianConnection] =
    usePersistentState<ObsidianConnection | null>(
      "fokusdeck:obsidian-connection",
      null,
      safeObsidianConnection,
    );
  const [storedObsidianProgress, setStoredObsidianProgress] =
    usePersistentState<Record<string, SavedObsidianProgress> | null>(
      "fokusdeck:obsidian-learning-progress-v1",
      {},
      safeObsidianProgress,
    );
  const obsidianProgressRef = useRef(safeObsidianProgress(storedObsidianProgress));
  obsidianProgressRef.current = safeObsidianProgress(storedObsidianProgress);
  const [overlayMode, setOverlayMode] = useState(false);
  const [vaultNotes, setVaultNotes] = useState<VaultNote[]>([]);
  const [appError, setAppError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const timer = useStudyTimer(settings);
  const isDesktop = isTauriDesktop();

  const syncVault = useCallback(
    async (
      vaultPath: string,
      options: { announce?: boolean; replaceVaultPath?: string } = {},
    ) => {
      setIsSyncing(true);
      setSyncError("");
      if (options.announce !== false) setSyncMessage("");

      try {
        const result = await scanObsidianVault(vaultPath);
        setVaultNotes(result.notes);
        const importedCards = cardsFromVaultScan(result).map((card) => {
          const saved = obsidianProgressRef.current[card.id];
          return saved ? { ...card, ...saved } : card;
        });
        setCards((currentCards) => {
          const baseCards =
            options.replaceVaultPath && options.replaceVaultPath !== result.rootPath
              ? removeVaultCards(currentCards, options.replaceVaultPath)
              : currentCards;
          return mergeVaultCards(baseCards, importedCards, result.rootPath);
        });
        setObsidianConnection(connectionFromScan(result, importedCards.length));
        if (options.announce !== false) {
          setSyncMessage(
            `${importedCards.length} ${importedCards.length === 1 ? "Karte" : "Karten"} aus ${result.vaultName} synchronisiert.`,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error || "Unbekannter Fehler");
        setSyncError(`Synchronisierung fehlgeschlagen: ${message}`);
      } finally {
        setIsSyncing(false);
      }
    },
    [setCards, setObsidianConnection],
  );

  useEffect(() => {
    const vaultPath = obsidianConnection?.vaultPath;
    if (!vaultPath || !isDesktop) return;

    void syncVault(vaultPath, { announce: false });
    const syncOnFocus = () => void syncVault(vaultPath, { announce: false });
    const interval = window.setInterval(syncOnFocus, 60_000);
    window.addEventListener("focus", syncOnFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncOnFocus);
    };
  }, [isDesktop, obsidianConnection?.vaultPath, syncVault]);

  const connectObsidianVault = async () => {
    setSyncError("");
    const selectedPath = await chooseObsidianVault();
    if (!selectedPath) return;
    await syncVault(selectedPath, {
      replaceVaultPath: obsidianConnection?.vaultPath,
    });
  };

  const disconnectObsidianVault = () => {
    if (obsidianConnection) {
      setCards((currentCards) =>
        removeVaultCards(currentCards, obsidianConnection.vaultPath),
      );
    }
    setObsidianConnection(null);
    setVaultNotes([]);
    setSyncMessage("Obsidian-Verbindung getrennt.");
    setSyncError("");
  };

  const showObsidianSource = async (source: ObsidianSource) => {
    try {
      await openObsidianSource(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAppError(`Die Obsidian-Notiz konnte nicht geöffnet werden: ${message}`);
    }
  };

  const setOverlay = async (enabled: boolean) => {
    setAppError("");
    setOverlayMode(enabled);
    try {
      await configureDesktopOverlay(enabled);
    } catch {
      setOverlayMode(false);
      setAppError(
        "Das native Overlay konnte nicht aktiviert werden. In der Browser-Vorschau steht nur die kompakte Ansicht zur Verfügung.",
      );
    }
  };

  useEffect(() => {
    setCards((currentCards) => normalizeLearningCards(currentCards, new Date()));
  }, [setCards]);

  useEffect(() => {
    const sourcedCards = cards.filter((card) => card.source);
    if (!sourcedCards.length) return;
    setStoredObsidianProgress((current) => {
      const next = safeObsidianProgress(current);
      for (const card of sourcedCards) {
        next[card.id] = { mastered: card.mastered, learning: card.learning };
      }
      return Object.fromEntries(Object.entries(next).slice(-5_000));
    });
  }, [cards, setStoredObsidianProgress]);

  return (
    <>
      {overlayMode && (
        <div className="overlay-shell">
          <header className="overlay-shell__header" data-tauri-drag-region>
            <Brand compact />
            <div className="overlay-shell__status">
              <PinIcon />
              Immer im Vordergrund
            </div>
            <button
              type="button"
              className="overlay-close"
              onClick={() => void setOverlay(false)}
              aria-label="Overlay schließen"
            >
              <CloseIcon />
            </button>
          </header>
          <TimerCard
            compact
            mode={timer.mode}
            remainingSeconds={timer.remainingSeconds}
            totalSeconds={timer.totalSeconds}
            isRunning={timer.isRunning}
            settings={settings}
            onStart={timer.start}
            onPause={timer.pause}
            onReset={timer.reset}
            onSkip={timer.skip}
          />
        </div>
      )}
      <div className="app-shell" hidden={overlayMode}>
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Hauptnavigation">
          <button
            type="button"
            className={activeView === "learning" ? "is-active" : ""}
            aria-current={activeView === "learning" ? "page" : undefined}
            onClick={() => setActiveView("learning")}
          >
            <LearnIcon />
            <span className="nav-label nav-label--long">Heute lernen</span>
            <span className="nav-label nav-label--short">Heute</span>
          </button>
          <button
            type="button"
            className={activeView === "dashboard" ? "is-active" : ""}
            aria-current={activeView === "dashboard" ? "page" : undefined}
            onClick={() => setActiveView("dashboard")}
          >
            <HomeIcon />
            <span className="nav-label nav-label--long">Übersicht</span>
            <span className="nav-label nav-label--short">Übersicht</span>
          </button>
          <button
            type="button"
            className={activeView === "cards" ? "is-active" : ""}
            aria-current={activeView === "cards" ? "page" : undefined}
            onClick={() => setActiveView("cards")}
          >
            <CardsIcon />
            <span className="nav-label nav-label--long">Karteikarten</span>
            <span className="nav-label nav-label--short">Karten</span>
            <small>{cards.length}</small>
          </button>
          <button
            type="button"
            className={activeView === "settings" ? "is-active" : ""}
            aria-current={activeView === "settings" ? "page" : undefined}
            onClick={() => setActiveView("settings")}
          >
            <SettingsIcon />
            <span className="nav-label nav-label--long">Einstellungen</span>
            <span className="nav-label nav-label--short">Optionen</span>
          </button>
        </nav>

        <div className="sidebar__bottom">
          <button type="button" onClick={() => void setOverlay(true)}>
            <PinIcon />
            Always-on-top
          </button>
          <p>
            <span />
            Daten lokal gespeichert
          </p>
        </div>
      </aside>

      <div className="app-main">
        {(appError || cardsStorageError) && (
          <div className="toast" role="alert">
            {appError || cardsStorageError}
            {appError && (
              <button type="button" onClick={() => setAppError("")}>
                <CloseIcon />
              </button>
            )}
          </div>
        )}

        {activeView === "dashboard" && (
          <Dashboard
            timer={timer}
            settings={settings}
            cards={cards}
            onSettingsChange={setSettings}
            onOpenCards={() => setActiveView("cards")}
            onOpenLearning={() => setActiveView("learning")}
            onEnableOverlay={() => void setOverlay(true)}
          />
        )}
        <div hidden={activeView !== "learning"}>
          <LearningView
            cards={cards}
            notes={vaultNotes}
            hasObsidian={Boolean(obsidianConnection)}
            isVisible={activeView === "learning" && !overlayMode}
            onCardsChange={setCards}
            onOpenCards={() => setActiveView("cards")}
            onOpenSettings={() => setActiveView("settings")}
          />
        </div>
        {activeView === "cards" && (
          <FlashcardsView
            cards={cards}
            onCardsChange={setCards}
            onOpenObsidianSource={(source) => void showObsidianSource(source)}
          />
        )}
        {activeView === "settings" && (
          <SettingsView
            timerSettings={settings}
            connection={obsidianConnection}
            isDesktop={isDesktop}
            isSyncing={isSyncing}
            syncMessage={syncMessage}
            syncError={syncError}
            onTimerSettingsChange={setSettings}
            onConnect={() => void connectObsidianVault()}
            onSync={() => {
              if (obsidianConnection) {
                void syncVault(obsidianConnection.vaultPath);
              }
            }}
            onDisconnect={disconnectObsidianVault}
          />
        )}
      </div>
      </div>
    </>
  );
}

export default App;
