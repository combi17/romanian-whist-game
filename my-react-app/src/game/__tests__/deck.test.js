import { describe, it, expect } from 'vitest';
import { deckFor, ranksFor, shuffle, seededRng, deal, rankValue, MAX_HAND_SIZE } from '../deck.js';

describe('deck trimming', () => {
  it.each([
    [3, 24, '9'],
    [4, 32, '7'],
    [5, 40, '5'],
    [6, 48, '3'],
  ])('%i players -> %i cards, lowest rank %s', (players, size, lowest) => {
    const deck = deckFor(players);
    expect(deck).toHaveLength(size);
    expect(ranksFor(players)[0]).toBe(lowest);
  });

  it('always has exactly enough cards for a full 8-card round', () => {
    // This is why the 8-card round has no trump: the deck runs out exactly.
    for (let n = 3; n <= 6; n++) {
      expect(deckFor(n)).toHaveLength(MAX_HAND_SIZE * n);
    }
  });

  it('never includes the 2', () => {
    for (let n = 3; n <= 6; n++) {
      expect(deckFor(n).some((c) => c.rank === '2')).toBe(false);
    }
  });

  it('rejects table sizes outside 3-6', () => {
    expect(() => deckFor(2)).toThrow(RangeError);
    expect(() => deckFor(7)).toThrow(RangeError);
    expect(() => deckFor(4.5)).toThrow(RangeError);
  });

  it('ranks A high, 3 low', () => {
    expect(rankValue({ rank: 'A' })).toBeGreaterThan(rankValue({ rank: 'K' }));
    expect(rankValue({ rank: 'K' })).toBeGreaterThan(rankValue({ rank: '10' }));
    expect(rankValue({ rank: '10' })).toBeGreaterThan(rankValue({ rank: '9' }));
    expect(rankValue({ rank: '4' })).toBeGreaterThan(rankValue({ rank: '3' }));
  });
});

describe('shuffle', () => {
  it('preserves every card', () => {
    const deck = deckFor(4);
    const shuffled = shuffle(deck, seededRng(1));
    expect(shuffled).toHaveLength(deck.length);
    expect([...shuffled].sort(byCard)).toEqual([...deck].sort(byCard));
  });

  it('does not mutate the input', () => {
    const deck = deckFor(4);
    const copy = [...deck];
    shuffle(deck, seededRng(2));
    expect(deck).toEqual(copy);
  });

  it('is deterministic for a given seed', () => {
    expect(shuffle(deckFor(4), seededRng(42))).toEqual(shuffle(deckFor(4), seededRng(42)));
  });

  it('actually reorders', () => {
    expect(shuffle(deckFor(4), seededRng(7))).not.toEqual(deckFor(4));
  });
});

describe('dealing', () => {
  it('gives every seat the same number of cards and leaves the rest', () => {
    const { hands, remaining } = deal(deckFor(4), 4, 5);
    expect(hands).toHaveLength(4);
    hands.forEach((h) => expect(h).toHaveLength(5));
    expect(remaining).toHaveLength(32 - 20);
  });

  it('leaves nothing over in an 8-card round', () => {
    for (let n = 3; n <= 6; n++) {
      const { remaining } = deal(deckFor(n), n, 8);
      expect(remaining).toHaveLength(0);
    }
  });

  it('deals no duplicates', () => {
    const { hands } = deal(shuffle(deckFor(6), seededRng(3)), 6, 8);
    const all = hands.flat().map((c) => `${c.rank}${c.suit}`);
    expect(new Set(all).size).toBe(all.length);
  });
});

function byCard(a, b) {
  return `${a.suit}${a.rank}`.localeCompare(`${b.suit}${b.rank}`);
}
