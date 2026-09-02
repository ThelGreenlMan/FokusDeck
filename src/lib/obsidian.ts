import type {
  Flashcard,
  ObsidianConnection,
  ObsidianSource,
} from "../types";

export interface VaultNote {
  relativePath: string;
  content: string;
  modifiedAt: number;
}

export interface VaultScanResult {
  vaultName: string;
  rootPath: string;
  notes: VaultNote[];
  scannedMarkdownFiles: number;
  scannedAt: number;
}

interface ParsedFrontmatter {
  values: Record<string, string>;
  body: string;
}

export function isTauriDesktop() {
  return Boolean(window.__TAURI_INTERNALS__);
}

function unquote(value: string) {
  const trimmed = value.trim();
  const isQuoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return isQuoted ? trimmed.slice(1, -1).trim() : trimmed;
}

function readFrontmatter(content: string): ParsedFrontmatter | null {
  const normalized = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return null;

  const endIndex = normalized.indexOf("\n---", 4);
  if (endIndex === -1) return null;

  const values: Record<string, string> = {};
  for (const line of normalized.slice(4, endIndex).split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = unquote(line.slice(separatorIndex + 1));
    if (key) values[key] = value;
  }

  const closingLength = normalized.startsWith("\n---\n", endIndex) ? 5 : 4;
  return {
    values,
    body: normalized.slice(endIndex + closingLength).trim(),
  };
}

function removeHtmlComments(markdown: string) {
  const visibleCharacters: string[] = [];
  let cursor = 0;

  while (cursor < markdown.length) {
    visibleCharacters.push(markdown[cursor]);
    cursor += 1;

    const length = visibleCharacters.length;
    const endsWithCommentStart =
      length >= 4 &&
      visibleCharacters[length - 4] === "<" &&
      visibleCharacters[length - 3] === "!" &&
      visibleCharacters[length - 2] === "-" &&
      visibleCharacters[length - 1] === "-";
    if (!endsWithCommentStart) continue;

    visibleCharacters.length -= 4;
    const endIndex = markdown.indexOf("-->", cursor);
    if (endIndex === -1) break;
    cursor = endIndex + 3;
  }

  return visibleCharacters.join("");
}

function cleanMarkdown(markdown: string) {
  const cleaned = markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/```[a-zA-Z0-9_-]*\n?/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1");

  return removeHtmlComments(cleaned)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fallbackDeck(relativePath: string) {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  return parts.length > 1 ? parts[0] : "Obsidian";
}

export function parseObsidianNote(
  note: VaultNote,
  vaultName: string,
  vaultPath: string,
): Flashcard | null {
  const frontmatter = readFrontmatter(note.content);
  if (!frontmatter) return null;

  const enabled = frontmatter.values.fokusdeck?.toLowerCase() === "true";
  if (!enabled) return null;

  const headingMatch = frontmatter.body.match(/^#\s+(.+)$/m);
  const front = cleanMarkdown(
    frontmatter.values.question || headingMatch?.[1] || "",
  );

  let answerSource = frontmatter.values.answer || frontmatter.body;
  if (!frontmatter.values.answer && headingMatch) {
    answerSource = frontmatter.body.replace(headingMatch[0], "").trim();
  }
  const back = cleanMarkdown(answerSource);

  if (!front || !back) return null;

  const source: ObsidianSource = {
    type: "obsidian",
    vaultName,
    vaultPath,
    relativePath: note.relativePath,
    modifiedAt: note.modifiedAt,
  };

  return {
    id: `obsidian:${encodeURIComponent(`${vaultPath}|${note.relativePath}`)}`,
    front: front.slice(0, 1_000),
    back: back.slice(0, 4_000),
    deck: frontmatter.values.deck || fallbackDeck(note.relativePath),
    mastered: false,
    createdAt: new Date(note.modifiedAt || Date.now()).toISOString(),
    source,
  };
}

export function cardsFromVaultScan(result: VaultScanResult) {
  return result.notes
    .map((note) =>
      parseObsidianNote(note, result.vaultName, result.rootPath),
    )
    .filter((card): card is Flashcard => card !== null);
}

export function mergeVaultCards(
  existingCards: Flashcard[],
  importedCards: Flashcard[],
  vaultPath: string,
) {
  const existingById = new Map(existingCards.map((card) => [card.id, card]));
  const cardsWithoutVault = existingCards.filter(
    (card) => card.source?.vaultPath !== vaultPath,
  );
  const cardsWithProgress = importedCards.map((card) => ({
    ...card,
    mastered: existingById.get(card.id)?.mastered ?? card.mastered,
    learning: existingById.get(card.id)?.learning ?? card.learning,
  }));
  return [...cardsWithoutVault, ...cardsWithProgress];
}

export function removeVaultCards(cards: Flashcard[], vaultPath: string) {
  return cards.filter((card) => card.source?.vaultPath !== vaultPath);
}

export async function chooseObsidianVault() {
  if (!isTauriDesktop()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Obsidian-Vault auswählen",
  });
  return typeof selected === "string" ? selected : null;
}

export async function scanObsidianVault(vaultPath: string) {
  if (!isTauriDesktop()) {
    throw new Error("Die Vault-Auswahl ist nur in der Desktop-App verfügbar.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<VaultScanResult>("scan_obsidian_vault", { vaultPath });
}

export async function openObsidianSource(source: ObsidianSource) {
  if (!isTauriDesktop()) {
    throw new Error("Obsidian-Links sind nur in der Desktop-App verfügbar.");
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  const file = source.relativePath.replace(/\.md$/i, "");
  const url = `obsidian://open?vault=${encodeURIComponent(source.vaultName)}&file=${encodeURIComponent(file)}`;
  await openUrl(url);
}

export function connectionFromScan(
  result: VaultScanResult,
  importedCards: number,
): ObsidianConnection {
  return {
    vaultName: result.vaultName,
    vaultPath: result.rootPath,
    lastSyncAt: result.scannedAt,
    scannedMarkdownFiles: result.scannedMarkdownFiles,
    importedCards,
  };
}
