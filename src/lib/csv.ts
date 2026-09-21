import type { Flashcard } from "../types";
import { t } from "../i18n";
import { collectionError, createCollectionDocument } from "./collection";
import { isTauriDesktop } from "./obsidian";

const MAX_CSV_CARDS = 5_000;
const DELIMITERS = [";", ",", "\t"] as const;
// Persisted defaults participate in collection identity and must not follow UI language.
const DEFAULT_CSV_NAME = "CSV-Import";

const HEADER_ALIASES = {
  front: ["frage", "vorderseite", "front", "question", "term", "prompt"],
  back: ["antwort", "ruckseite", "rueckseite", "back", "answer", "definition"],
  deck: ["stapel", "deck", "kategorie", "category", "thema", "topic"],
  mastered: ["gemeistert", "mastered", "gewusst", "known"],
} as const;

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseRows(rawContent: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < rawContent.length; index += 1) {
    const character = rawContent[index];

    if (quoted) {
      if (character === '"') {
        if (rawContent[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && !field) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && rawContent[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw collectionError("study.csv.unclosedQuote");
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((values) => values.some((value) => value.trim()));
}

function headerIndex(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function detectTable(rawContent: string) {
  let content = rawContent.replace(/^\uFEFF/, "");
  const separatorDeclaration = content.match(/^sep=([;,\t])(?:\r?\n|\r)/i);
  const declaredDelimiter = separatorDeclaration?.[1];
  if (separatorDeclaration) content = content.slice(separatorDeclaration[0].length);

  const candidates = declaredDelimiter
    ? [declaredDelimiter]
    : DELIMITERS;

  for (const delimiter of candidates) {
    const rows = parseRows(content, delimiter);
    const headers = (rows[0] ?? []).map(normalizeHeader);
    if (
      headerIndex(headers, HEADER_ALIASES.front) >= 0 &&
      headerIndex(headers, HEADER_ALIASES.back) >= 0
    ) {
      return { rows, headers };
    }
  }

  throw collectionError("study.csv.missingHeaders");
}

function requiredCell(value: string | undefined, labelKey: string, rowNumber: number, limit: number) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw collectionError("study.csv.required", () => ({ label: t(labelKey), row: rowNumber }));
  }
  if (normalized.length > limit) {
    throw collectionError("study.csv.tooLong", () => ({ label: t(labelKey), row: rowNumber, limit }));
  }
  return normalized;
}

function parseMastered(value: string | undefined, rowNumber: number) {
  const normalized = normalizeHeader(value ?? "");
  if (!normalized || ["0", "false", "nein", "no", "offen", "unknown"].includes(normalized)) {
    return false;
  }
  if (["1", "true", "ja", "yes", "gemeistert", "gewusst", "known"].includes(normalized)) {
    return true;
  }
  throw collectionError("study.csv.invalidProgress", { row: rowNumber });
}

export function parseCsvCollection(rawContent: string, name = DEFAULT_CSV_NAME) {
  const { rows, headers } = detectTable(rawContent);
  const frontIndex = headerIndex(headers, HEADER_ALIASES.front);
  const backIndex = headerIndex(headers, HEADER_ALIASES.back);
  const deckIndex = headerIndex(headers, HEADER_ALIASES.deck);
  const masteredIndex = headerIndex(headers, HEADER_ALIASES.mastered);
  const dataRows = rows.slice(1);

  if (!dataRows.length) {
    throw collectionError("study.csv.noCards");
  }
  if (dataRows.length > MAX_CSV_CARDS) {
    throw collectionError("study.csv.tooMany", { count: MAX_CSV_CARDS });
  }

  const cards: Flashcard[] = dataRows.map((values, index) => {
    const rowNumber = index + 2;
    const deckValue = deckIndex >= 0 ? values[deckIndex]?.trim() : "";
    if (deckValue && deckValue.length > 100) {
      throw collectionError("study.csv.deckTooLong", { row: rowNumber });
    }

    return {
      id: `csv:${createId()}`,
      front: requiredCell(values[frontIndex], "study.question", rowNumber, 1_000),
      back: requiredCell(values[backIndex], "study.answer", rowNumber, 4_000),
      deck: deckValue || "Allgemein",
      mastered: masteredIndex >= 0 ? parseMastered(values[masteredIndex], rowNumber) : false,
      createdAt: new Date().toISOString(),
    };
  });

  return createCollectionDocument(cards, name);
}

function csvNameFromPath(path: string) {
  const fileName = path.split(/[\\/]/).pop() ?? DEFAULT_CSV_NAME;
  return fileName.replace(/\.csv$/i, "").trim().slice(0, 100) || DEFAULT_CSV_NAME;
}

export async function loadCsvFile() {
  if (!isTauriDesktop()) {
    throw collectionError("study.csv.desktopOnly");
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({
    title: t("study.csv.importTitle"),
    directory: false,
    multiple: false,
    filters: [{ name: t("study.csv.fileType"), extensions: ["csv"] }],
  });
  if (typeof path !== "string") return null;

  const { invoke } = await import("@tauri-apps/api/core");
  const content = await invoke<string>("read_csv_file", { path });
  return parseCsvCollection(content, csvNameFromPath(path));
}
