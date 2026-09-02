export interface DeckCard {
  id: string;
  deck: string;
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function compareBySeed(seed: string, first: string, second: string) {
  const difference =
    stableHash(seed + "\u001f" + first) - stableHash(seed + "\u001f" + second);
  return difference || first.localeCompare(second, "de-DE");
}

export function interleaveDecks<T extends DeckCard>(
  cards: readonly T[],
  seed = "fokusdeck",
  limit = cards.length,
): T[] {
  const maximum = Math.max(0, Math.floor(limit));
  if (maximum === 0 || cards.length === 0) return [];

  const groups = new Map<string, T[]>();
  for (const card of cards) {
    const deck = card.deck.trim() || "Ohne Stapel";
    const group = groups.get(deck) ?? [];
    group.push(card);
    groups.set(deck, group);
  }

  const queues = [...groups.entries()]
    .sort(([first], [second]) => compareBySeed(seed, first, second))
    .map(([deck, deckCards]) => ({
      deck,
      cards: [...deckCards].sort((first, second) =>
        compareBySeed(seed + "\u001f" + deck, first.id, second.id),
      ),
      index: 0,
    }));

  const result: T[] = [];
  const resultLimit = Math.min(maximum, cards.length);
  while (result.length < resultLimit) {
    let added = false;
    for (const queue of queues) {
      const card = queue.cards[queue.index];
      if (!card) continue;
      result.push(card);
      queue.index += 1;
      added = true;
      if (result.length >= resultLimit) break;
    }
    if (!added) break;
  }

  return result;
}
