import { describe, expect, it } from "vitest";
import type { Flashcard } from "../types";
import {
  mergeVaultCards,
  parseObsidianNote,
  type VaultNote,
} from "./obsidian";
import { reviewLearningCard } from "./learning";

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
