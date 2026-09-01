import { useCallback, useEffect, useState } from "react";
import { Brand } from "./components/Brand";
import { Dashboard } from "./components/Dashboard";
import { FlashcardsView } from "./components/FlashcardsView";
import {
  CardsIcon,
  CloseIcon,
  HomeIcon,
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
} from "./lib/obsidian";
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
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [settings, setSettings] = usePersistentState<TimerSettings>(
    "fokusdeck:timer-settings",
    initialSettings,
  );
  const [cards, setCards] = usePersistentState<Flashcard[]>(
    "fokusdeck:flashcards",
    starterCards,
  );
  const [obsidianConnection, setObsidianConnection] =
    usePersistentState<ObsidianConnection | null>(
      "fokusdeck:obsidian-connection",
      null,
    );
  const [overlayMode, setOverlayMode] = useState(false);
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
        const importedCards = cardsFromVaultScan(result);
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

  if (overlayMode) {
    return (
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
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Hauptnavigation">
          <button
            type="button"
            className={activeView === "dashboard" ? "is-active" : ""}
            onClick={() => setActiveView("dashboard")}
          >
            <HomeIcon />
            Übersicht
          </button>
          <button
            type="button"
            className={activeView === "cards" ? "is-active" : ""}
            onClick={() => setActiveView("cards")}
          >
            <CardsIcon />
            Karteikarten
            <small>{cards.length}</small>
          </button>
          <button
            type="button"
            className={activeView === "settings" ? "is-active" : ""}
            onClick={() => setActiveView("settings")}
          >
            <SettingsIcon />
            Einstellungen
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
        {appError && (
          <div className="toast" role="status">
            {appError}
            <button type="button" onClick={() => setAppError("")}>
              <CloseIcon />
            </button>
          </div>
        )}

        {activeView === "dashboard" && (
          <Dashboard
            timer={timer}
            settings={settings}
            cards={cards}
            onSettingsChange={setSettings}
            onOpenCards={() => setActiveView("cards")}
            onEnableOverlay={() => void setOverlay(true)}
          />
        )}
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
  );
}

export default App;
