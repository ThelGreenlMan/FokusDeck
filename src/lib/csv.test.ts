import { describe, expect, it } from "vitest";
import { parseCsvCollection } from "./csv";

describe("CSV flashcard import", () => {
  it("imports German semicolon-separated CSV files", () => {
    const collection = parseCsvCollection(
      "Frage;Antwort;Stapel;Gemeistert\nWas ist ATP?;Energieträger;Biologie;ja\n",
      "Biologie",
    );

    expect(collection.name).toBe("Biologie");
    expect(collection.cards).toMatchObject([
      {
        front: "Was ist ATP?",
        back: "Energieträger",
        deck: "Biologie",
        mastered: true,
      },
    ]);
  });

  it("supports comma-separated English headers and quoted multiline cells", () => {
    const collection = parseCsvCollection(
      'question,answer,deck\n"Why?","Line one\nLine two, with comma",General\n',
    );

    expect(collection.cards[0].front).toBe("Why?");
    expect(collection.cards[0].back).toBe("Line one\nLine two, with comma");
    expect(collection.cards[0].deck).toBe("General");
  });

  it("supports Excel separator declarations, BOMs and escaped quotes", () => {
    const collection = parseCsvCollection(
      '\uFEFFsep=;\r\nVorderseite;Rückseite\r\n"Begriff";"Ein ""Zitat"""\r\n',
    );

    expect(collection.cards[0].back).toBe('Ein "Zitat"');
    expect(collection.cards[0].deck).toBe("Allgemein");
  });

  it("rejects missing headers, invalid progress and incomplete cards", () => {
    expect(() => parseCsvCollection("Titel;Text\nA;B\n")).toThrow("Kopfzeile");
    expect(() => parseCsvCollection("Frage;Antwort;Gemeistert\nA;B;vielleicht\n")).toThrow(
      "ja/nein",
    );
    expect(() => parseCsvCollection("Frage;Antwort\n;B\n")).toThrow("Frage in CSV-Zeile 2 fehlt");
  });
});
