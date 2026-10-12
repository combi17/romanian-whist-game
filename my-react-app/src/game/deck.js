/**
 * Cards and decks.
 *
 * The deck is trimmed to the table: 2 × playerCount ranks in each of 4 suits,
 * so 8 × playerCount cards. An 8-card round deals out all of them, which is
 * why those rounds are played without trump.
 */

export const SUITS = ['♠', '♥', '♦', '♣'];

/** Low to high. With 3 or more players the 2s are always trimmed off. */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const MAX_HAND_SIZE = 8;

export function assertPlayerCount(playerCount) {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new RangeError(
      `playerCount must be an integer ${MIN_PLAYERS}-${MAX_PLAYERS}, got ${playerCount}`,
    );
  }
}

/** The ranks in play for this table size, low to high. */
export function ranksFor(playerCount) {
  assertPlayerCount(playerCount);
  return RANKS.slice(RANKS.length - 2 * playerCount);
}

/** An ordered (unshuffled) deck for this table size. */
export function deckFor(playerCount) {
  const ranks = ranksFor(playerCount);
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Strength of a rank, for comparing two cards of the same suit. */
export function rankValue(card) {
  return RANKS.indexOf(card.rank);
}

export function cardsEqual(a, b) {
  return a.suit === b.suit && a.rank === b.rank;
}

/**
 * Display order for a hand: grouped by suit with the colours alternating,
 * highest rank first. Trump stays in its usual place so its position in the
 * fan gives nothing away.
 */
const HAND_SUIT_ORDER = ['♠', '♥', '♣', '♦'];

export function sortHand(cards) {
  return [...cards].sort((a, b) => {
    const suitDelta = HAND_SUIT_ORDER.indexOf(a.suit) - HAND_SUIT_ORDER.indexOf(b.suit);
    if (suitDelta !== 0) return suitDelta;
    return rankValue(b) - rankValue(a); // descending
  });
}

export function cardToString(card) {
  return `${card.rank}${card.suit}`;
}

/** Fisher-Yates on a copy. The RNG is a parameter so tests can seed it. */
export function shuffle(deck, rng = Math.random) {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deterministic RNG for tests and reproducible deals (mulberry32). */
export function seededRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deal `cardsPerPlayer` to each seat, round-robin.
 * Returns the hands plus whatever is left, the top of which becomes trump.
 */
export function deal(deck, playerCount, cardsPerPlayer) {
  const remaining = [...deck];
  const hands = Array.from({ length: playerCount }, () => []);

  for (let i = 0; i < cardsPerPlayer; i++) {
    for (let seat = 0; seat < playerCount; seat++) {
      hands[seat].push(remaining.pop());
    }
  }

  return { hands, remaining };
}
