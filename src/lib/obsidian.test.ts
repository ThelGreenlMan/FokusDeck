import { afterEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import { setLanguage } from "../i18n";
import germanSettings from "../i18n/locales/de/settings.json";
import englishSettings from "../i18n/locales/en/settings.json";
import type { Flashcard } from "../types";
import {
  mergeVaultCards,
  localizeNativeError,
  chooseObsidianVault,
  scanObsidianVault,
  parseObsidianNote,
  type VaultNote,
} from "./obsidian";
import { reviewLearningCard } from "./learning";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

afterEach(() => {
  setLanguage("de", { persist: false });
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const vaultName = "Lernwissen";
const vaultPath = "C:\\Notizen\\Lernwissen";

function note(content: string, relativePath = "Biologie/Photosynthese.md"): VaultNote {
  return {
    relativePath,
    content,
    modifiedAt: 1_700_000_000_000,
  };
}

describe("parseObsidianNote", () => {
  it("never translates note content, identifiers, paths or frontmatter when the display language changes", () => {
    const source = note("---\nfokusdeck: true\ndeck: Biologie\nquestion: Deutsche Frage\nanswer: Deutsche Antwort\n---");
    const germanCard = parseObsidianNote(source, vaultName, vaultPath);
    setLanguage("en", { persist: false });
    expect(parseObsidianNote(source, vaultName, vaultPath)).toEqual(germanCard);
    expect(germanCard).toMatchObject({ front: "Deutsche Frage", back: "Deutsche Antwort", deck: "Biologie" });
  });
  it("creates a card from a marked heading note", () => {
    const card = parseObsidianNote(
      note(`---
fokusdeck: true
deck: Biologie
---
# Was ist Photosynthese?

Pflanzen wandeln **Lichtenergie** in chemische Energie um.`),
      vaultName,
      vaultPath,
    );

    expect(card).toMatchObject({
      front: "Was ist Photosynthese?",
      back: "Pflanzen wandeln Lichtenergie in chemische Energie um.",
      deck: "Biologie",
      mastered: false,
    });
    expect(card?.source?.relativePath).toBe("Biologie/Photosynthese.md");
  });

  it("supports explicit question and answer properties", () => {
    const card = parseObsidianNote(
      note(`---
fokusdeck: "true"
question: "Was ist Active Recall?"
answer: "Aktives Abrufen aus dem Gedächtnis."
---`, "Lernmethoden/Active Recall.md"),
      vaultName,
      vaultPath,
    );

    expect(card?.front).toBe("Was ist Active Recall?");
    expect(card?.back).toBe("Aktives Abrufen aus dem Gedächtnis.");
    expect(card?.deck).toBe("Lernmethoden");
  });

  it("removes HTML comments even when their removal forms a new opener", () => {
    const card = parseObsidianNote(
      note(`---
fokusdeck: true
---
# Sichere Frage
Antwort <!<!-- verborgen -->-->weiter verborgen--> bleibt sichtbar.`),
      vaultName,
      vaultPath,
    );

    expect(card?.back).toBe("Antwort  bleibt sichtbar.");
    expect(card?.back).not.toContain("<!--");
  });

  it("removes comments formed while cleaning other Markdown", () => {
    const card = parseObsidianNote(
      note(`---
fokusdeck: true
---
# Sichere Frage
<!![--](bild.png) verborgen -->Antwort`),
      vaultName,
      vaultPath,
    );

    expect(card?.back).toBe("Antwort");
    expect(card?.back).not.toContain("<!--");
  });

  it("removes consecutive and unfinished comments", () => {
    const card = parseObsidianNote(
      note(`---
fokusdeck: true
---
# Sichere Frage
A<!-- eins --><!-- zwei -->B<!-- unvollständig`),
      vaultName,
      vaultPath,
    );

    expect(card?.back).toBe("AB");
  });

  it("ignores unmarked, disabled, or incomplete notes", () => {
    expect(
      parseObsidianNote(note("# Normale Notiz"), vaultName, vaultPath),
    ).toBeNull();
    expect(
      parseObsidianNote(
        note("---\nfokusdeck: false\n---\n# Frage\nAntwort"),
        vaultName,
        vaultPath,
      ),
    ).toBeNull();
    expect(
      parseObsidianNote(
        note("---\nfokusdeck: true\n---\n# Nur eine Frage"),
        vaultName,
        vaultPath,
      ),
    ).toBeNull();
  });
});

describe("localizeNativeError", () => {
  it("uses the active language in the native folder dialog without changing the selected path", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.mocked(open).mockResolvedValue(vaultPath);
    expect(await chooseObsidianVault()).toBe(vaultPath);
    expect(open).toHaveBeenLastCalledWith({ directory: true, multiple: false, title: "Obsidian-Vault auswählen" });
    setLanguage("en", { persist: false });
    expect(await chooseObsidianVault()).toBe(vaultPath);
    expect(open).toHaveBeenLastCalledWith({ directory: true, multiple: false, title: "Choose Obsidian vault" });
  });

  it("localizes browser-only failures after a language change", async () => {
    const error = await scanObsidianVault(vaultPath).catch((value: unknown) => value);
    expect(localizeNativeError(error)).toBe("Die Vault-Auswahl ist nur in der Desktop-App verfügbar.");
    setLanguage("en", { persist: false });
    expect(localizeNativeError(error)).toBe("Vault selection is only available in the desktop app.");
  });

  it("translates every known static native error and preserves German by default", () => {
    const messages = Object.entries(germanSettings).filter(([key, value]) =>
      key.startsWith("settings.native.") && typeof value === "string" && !value.includes("{path}"),
    );
    for (const [, message] of messages) expect(localizeNativeError(message)).toBe(message);
    setLanguage("en", { persist: false });
    for (const [key, message] of messages) {
      expect(localizeNativeError(message)).toBe(englishSettings[key as keyof typeof englishSettings]);
    }
  });

  it("preserves native backup paths exactly when translating recovery errors", () => {
    const path = "C:\\Notizen\\Meine Prüfung {path}\\Sicherung.fokusdeck.json";
    setLanguage("en", { persist: false });
    expect(localizeNativeError(`Die Sammlung konnte nicht ersetzt werden. Die vorhandenen Daten liegen weiterhin unter ${path}.`))
      .toBe(`The collection could not be replaced. The existing data is still available at ${path}.`);
    expect(localizeNativeError(`Die Sammlung wurde gespeichert, aber die temporäre Sicherung ${path} konnte nicht entfernt werden.`))
      .toBe(`The collection was saved, but the temporary backup at ${path} could not be removed.`);
  });

  it("keeps unknown diagnostics and renders errors using the current language", () => {
    const error = new Error("Der ausgewählte Vault-Ordner wurde nicht gefunden.");
    expect(localizeNativeError(error)).toBe(error.message);
    setLanguage("en", { persist: false });
    expect(localizeNativeError(error)).toBe("The selected vault folder was not found.");
    expect(localizeNativeError(new Error("EACCES /my/custom/path"))).toBe("EACCES /my/custom/path");
    expect(localizeNativeError(null)).toBe("Unknown error");
  });
});

describe("mergeVaultCards", () => {
  it("replaces imported content but keeps learning progress", () => {
    const imported = parseObsidianNote(
      note("---\nfokusdeck: true\n---\n# Aktualisierte Frage\nNeue Antwort"),
      vaultName,
      vaultPath,
    )!;
    const oldImported: Flashcard = reviewLearningCard({
      ...imported,
      front: "Alte Frage",
      mastered: true,
    }, "hard", "2026-09-01T10:00:00.000Z");
    const localCard: Flashcard = {
      id: "local",
      front: "Lokal",
      back: "Bleibt erhalten",
      deck: "Allgemein",
      mastered: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const merged = mergeVaultCards(
      [oldImported, localCard],
      [imported],
      vaultPath,
    );

    expect(merged).toHaveLength(2);
    expect(merged.find((card) => card.id === imported.id)).toMatchObject({
      front: "Aktualisierte Frage",
      mastered: false,
      learning: oldImported.learning,
    });
    expect(merged).toContainEqual(localCard);
  });
});
