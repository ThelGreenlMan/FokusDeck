import type { Flashcard } from "../types";
import { isTauriDesktop } from "./obsidian";

const COLLECTION_FORMAT = "fokusdeck.collection";
const COLLECTION_VERSION = 1;
const MAX_COLLECTION_CARDS = 5_000;

interface CollectionCard {
  id: string;
  front: string;
  back: string;
  deck: string;
  mastered: boolean;
  createdAt: string;
}

export interface FokusDeckCollection {
  format: typeof COLLECTION_FORMAT;
  version: typeof COLLECTION_VERSION;
  name: string;
  exportedAt: string;
  cards: CollectionCard[];
}

export interface CollectionMergeResult {
  cards: Flashcard[];
  imported: number;
  skipped: number;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function requireString(
  value: unknown,
  label: string,
  maximumLength: number,
) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} fehlt oder ist ungültig.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new Error(`${label} ist länger als ${maximumLength} Zeichen.`);
  }
  return normalized;
}

function cardSignature(card: Pick<Flashcard, "front" | "back" | "deck">) {
  return [card.deck, card.front, card.back]
    .map((value) => value.trim().toLocaleLowerCase("de-DE"))
    .join("\u001f");
}

export function createCollectionDocument(
  cards: Flashcard[],
  name = "FokusDeck-Sammlung",
): FokusDeckCollection {
  if (cards.length > MAX_COLLECTION_CARDS) {
    throw new Error(`Eine Sammlung darf höchstens ${MAX_COLLECTION_CARDS} Karten enthalten.`);
  }

  return {
    format: COLLECTION_FORMAT,
    version: COLLECTION_VERSION,
    name: name.trim().slice(0, 100) || "FokusDeck-Sammlung",
    exportedAt: new Date().toISOString(),
    cards: cards.map((card, index) => ({
      id:
        typeof card.id === "string" && card.id.length <= 300
          ? card.id
          : `collection:${createId()}`,
      front: requireString(card.front, `Frage von Karte ${index + 1}`, 1_000),
      back: requireString(card.back, `Antwort von Karte ${index + 1}`, 4_000),
      deck: requireString(card.deck, `Stapel von Karte ${index + 1}`, 100),
      mastered: card.mastered,
      createdAt:
        typeof card.createdAt === "string" && !Number.isNaN(Date.parse(card.createdAt))
          ? card.createdAt
          : new Date().toISOString(),
    })),
  };
}

export function serializeCollection(cards: Flashcard[], name?: string) {
  return `${JSON.stringify(createCollectionDocument(cards, name), null, 2)}\n`;
}

export function parseCollection(rawContent: string): FokusDeckCollection {
  let value: unknown;
  try {
    value = JSON.parse(rawContent);
  } catch {
    throw new Error("Die Datei enthält kein gültiges JSON.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Die Datei ist keine FokusDeck-Sammlung.");
  }

  const document = value as Record<string, unknown>;
  if (
    document.format !== COLLECTION_FORMAT ||
    document.version !== COLLECTION_VERSION
  ) {
    throw new Error("Dieses Sammlungsformat wird nicht unterstützt.");
  }
  if (!Array.isArray(document.cards)) {
    throw new Error("Die Sammlung enthält keine Kartenliste.");
  }
  if (document.cards.length > MAX_COLLECTION_CARDS) {
    throw new Error(`Eine Sammlung darf höchstens ${MAX_COLLECTION_CARDS} Karten enthalten.`);
  }

  const cards = document.cards.map((value, index): CollectionCard => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Karte ${index + 1} ist ungültig.`);
    }
    const card = value as Record<string, unknown>;
    const createdAt =
      typeof card.createdAt === "string" && !Number.isNaN(Date.parse(card.createdAt))
        ? card.createdAt
        : new Date().toISOString();
    return {
      id:
        typeof card.id === "string" && card.id.length <= 300
          ? card.id
          : `collection:${createId()}`,
      front: requireString(card.front, `Frage von Karte ${index + 1}`, 1_000),
      back: requireString(card.back, `Antwort von Karte ${index + 1}`, 4_000),
      deck: requireString(card.deck, `Stapel von Karte ${index + 1}`, 100),
      mastered: card.mastered === true,
      createdAt,
    };
  });

  return {
    format: COLLECTION_FORMAT,
    version: COLLECTION_VERSION,
    name:
      typeof document.name === "string" && document.name.trim()
        ? document.name.trim().slice(0, 100)
        : "Importierte Sammlung",
    exportedAt:
      typeof document.exportedAt === "string" &&
      !Number.isNaN(Date.parse(document.exportedAt))
        ? document.exportedAt
        : new Date().toISOString(),
    cards,
  };
}

export function mergeCollection(
  existingCards: Flashcard[],
  collection: FokusDeckCollection,
): CollectionMergeResult {
  const signatures = new Set(existingCards.map(cardSignature));
  const usedIds = new Set(existingCards.map((card) => card.id));
  const importedCards: Flashcard[] = [];
  let skipped = 0;

  for (const card of collection.cards) {
    const signature = cardSignature(card);
    if (signatures.has(signature)) {
      skipped += 1;
      continue;
    }

    let id = card.id;
    if (!id || usedIds.has(id)) id = `collection:${createId()}`;
    usedIds.add(id);
    signatures.add(signature);
    importedCards.push({ ...card, id });
  }

  return {
    cards: [...existingCards, ...importedCards],
    imported: importedCards.length,
    skipped,
  };
}

function safeFileName(name: string) {
  const normalized = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return normalized || "FokusDeck-Sammlung";
}

export async function saveCollectionFile(cards: Flashcard[], name: string) {
  if (!isTauriDesktop()) {
    throw new Error("Sammlungen können nur in der Desktop-App gespeichert werden.");
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    title: "FokusDeck-Sammlung speichern",
    defaultPath: `${safeFileName(name)}.fokusdeck.json`,
    filters: [{ name: "FokusDeck-Sammlung", extensions: ["json"] }],
  });
  if (!path) return false;
  const collectionPath = path.toLocaleLowerCase("de-DE").endsWith(".fokusdeck.json")
    ? path
    : `${path.replace(/\.json$/i, "")}.fokusdeck.json`;

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_collection_file", {
    path: collectionPath,
    content: serializeCollection(cards, name),
  });
  return true;
}

export async function loadCollectionFile() {
  if (!isTauriDesktop()) {
    throw new Error("Sammlungen können nur in der Desktop-App geladen werden.");
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({
    title: "FokusDeck-Sammlung laden",
    directory: false,
    multiple: false,
    filters: [{ name: "FokusDeck-Sammlung", extensions: ["json"] }],
  });
  if (typeof path !== "string") return null;

  const { invoke } = await import("@tauri-apps/api/core");
  const content = await invoke<string>("read_collection_file", { path });
  return parseCollection(content);
}
