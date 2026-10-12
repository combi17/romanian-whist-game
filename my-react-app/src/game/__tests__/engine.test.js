import { describe, it, expect } from 'vitest';
import {
  createGame,
  startRound,
  placeBid,
  playCard,
  legalPlaysFor,
  legalBidsFor,
  forbiddenBidFor,
  totals,
  PHASE,
} from '../engine.js';
import { seededRng } from '../deck.js';
import { viewFor, visibleCards } from '../views.js';

/** Deal a round deterministically. */
function dealt({ playerCount = 4, blindOneCard = false, seed = 1 } = {}) {
  const game = createGame({ playerCount, blindOneCard });
  const result = startRound(game, seededRng(seed));
  expect(result.ok).toBe(true);
  return result.state;
}

/** Everyone bids, in order, taking the first legal value from `wanted`. */
function bidAll(state, wanted) {
  let s = state;
  for (let i = 0; i < s.playerCount; i++) {
    const seat = s.currentSeat;
    const legal = legalBidsFor(s, seat);
    const bid = wanted?.[seat] !== undefined && legal.includes(wanted[seat]) ? wanted[seat] : legal[0];
    const out = placeBid(s, seat, bid);
    expect(out.ok).toBe(true);
    s = out.state;
  }
  return s;
}

/** Play the round out, always taking the first legal card. */
function playOutRound(state) {
  let s = state;
  let guard = 0;
  while (s.phase === PHASE.PLAYING) {
    if (guard++ > 500) throw new Error('round did not terminate');
    const seat = s.currentSeat;
    const legal = legalPlaysFor(s, seat);
    expect(legal.length).toBeGreaterThan(0);
    const out = playCard(s, seat, legal[0]);
    expect(out.ok).toBe(true);
    s = out.state;
  }
  return s;
}

describe('dealing a round', () => {
  it('deals the round-plan hand size to every seat', () => {
    const s = dealt();
    expect(s.handSize).toBe(1); // first round of a 4-player game
    s.hands.forEach((h) => expect(h).toHaveLength(1));
    expect(s.phase).toBe(PHASE.BIDDING);
  });

  it('flips a trump card when the deck has cards left', () => {
    const s = dealt();
    expect(s.trumpCard).not.toBeNull();
    expect(s.trumpSuit).toBe(s.trumpCard.suit);
  });

  it('plays fara atu in the 8-card round', () => {
    let s = dealt();
    // 4 players: rounds 0-3 are 1 card, 4-9 are 2..7, 10-13 are 8 cards.
    for (let i = 0; i < 10; i++) {
      s = playOutRound(bidAll(s));
      s = startRound(s, seededRng(i + 2)).state;
    }
    expect(s.handSize).toBe(8);
    expect(s.trumpCard).toBeNull();
    expect(s.trumpSuit).toBeNull();
  });

  it('rotates the first bidder one seat per round', () => {
    let s = dealt();
    expect(s.firstBidderSeat).toBe(0);
    s = playOutRound(bidAll(s));
    s = startRound(s, seededRng(9)).state;
    expect(s.firstBidderSeat).toBe(1);
    s = playOutRound(bidAll(s));
    s = startRound(s, seededRng(10)).state;
    expect(s.firstBidderSeat).toBe(2);
  });

  it('refuses to deal over a round in progress', () => {
    const s = dealt();
    const out = startRound(s, seededRng(1));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/still in progress/);
  });
});

describe('bidding', () => {
  it('goes in seat order from the first bidder', () => {
    let s = dealt();
    expect(s.currentSeat).toBe(0);
    s = placeBid(s, 0, 0).state;
    expect(s.currentSeat).toBe(1);
    s = placeBid(s, 1, 0).state;
    expect(s.currentSeat).toBe(2);
  });

  it('rejects a bid out of turn', () => {
    const s = dealt();
    const out = placeBid(s, 2, 1);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/not your turn/i);
  });

  it('enforces the "nu se poate" rule on the last bidder', () => {
    let s = dealt(); // 1-card round, 4 players
    s = placeBid(s, 0, 0).state;
    s = placeBid(s, 1, 0).state;
    s = placeBid(s, 2, 0).state;

    expect(forbiddenBidFor(s, 3)).toBe(1);
    expect(legalBidsFor(s, 3)).toEqual([0]);

    const out = placeBid(s, 3, 1);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/add up to 1/);
  });

  it('moves to playing once everyone has bid, with the first bidder leading', () => {
    const s = bidAll(dealt());
    expect(s.phase).toBe(PHASE.PLAYING);
    expect(s.currentSeat).toBe(s.firstBidderSeat);
  });

  it('rejects a bid larger than the hand', () => {
    const s = dealt();
    expect(placeBid(s, 0, 5).ok).toBe(false);
  });
});

describe('playing', () => {
  it('rejects a play out of turn', () => {
    const s = bidAll(dealt());
    const wrongSeat = (s.currentSeat + 1) % s.playerCount;
    const out = playCard(s, wrongSeat, s.hands[wrongSeat][0]);
    expect(out.ok).toBe(false);
  });

  it('passes the lead to the trick winner', () => {
    let s = bidAll(dealt({ playerCount: 4, seed: 5 }));
    s = playOutRound(s);
    // 1-card round: exactly one trick, and its winner is on the board
    expect(s.tricksWon.reduce((a, b) => a + b, 0)).toBe(1);
    expect(s.lastTrick.winner).toBe(s.tricksWon.findIndex((t) => t === 1));
  });

  it('never lets a player hold a card twice or lose one', () => {
    let s = bidAll(dealt({ playerCount: 5, seed: 11 }));
    const before = s.hands.flat().length;
    s = playOutRound(s);
    expect(s.hands.flat()).toHaveLength(0);
    expect(before).toBe(5 * s.handSize);
  });

  it('awards every trick in the round to somebody', () => {
    let s = dealt({ playerCount: 4, seed: 21 });
    for (let i = 0; i < 6; i++) {
      s = playOutRound(bidAll(s));
      const handSize = s.history.at(-1).handSize;
      expect(s.tricksWon.reduce((a, b) => a + b, 0)).toBe(handSize);
      s = startRound(s, seededRng(30 + i)).state;
    }
  });

  it('waits in round_end so a scoreboard can be shown', () => {
    const s = playOutRound(bidAll(dealt()));
    expect(s.phase).toBe(PHASE.ROUND_END);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].seats).toHaveLength(4);
  });
});

describe('a full game', () => {
  it.each([3, 4, 5, 6])('completes for %i players', (playerCount) => {
    let s = createGame({ playerCount });
    let round = 0;

    while (s.phase !== PHASE.FINISHED) {
      const out = startRound(s, seededRng(round + 1));
      expect(out.ok).toBe(true);
      s = out.state;
      if (s.phase === PHASE.FINISHED) break;
      s = playOutRound(bidAll(s));
      round++;
      if (round > 40) throw new Error('game did not terminate');
    }

    expect(round).toBe(3 * playerCount + 12);
    expect(s.history).toHaveLength(3 * playerCount + 12);
    expect(s.winners.length).toBeGreaterThan(0);
    expect(['zero', 'points']).toContain(s.winReason);
    expect(totals(s)).toHaveLength(playerCount);
  });

  it('refuses to start another round once finished', () => {
    let s = createGame({ playerCount: 3 });
    let round = 0;
    while (s.phase !== PHASE.FINISHED) {
      s = startRound(s, seededRng(++round)).state;
      if (s.phase === PHASE.FINISHED) break;
      s = playOutRound(bidAll(s));
    }
    const out = startRound(s, seededRng(99));
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/over/i);
  });
});

describe('purity', () => {
  it('does not mutate the state passed in', () => {
    const s = dealt();
    const snapshot = JSON.stringify(s);
    placeBid(s, 0, 0);
    playCard(s, 0, s.hands[0][0]);
    startRound(s, seededRng(4));
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('per-seat views', () => {
  it('shows a player their own hand and nobody else\'s', () => {
    const s = dealt({ playerCount: 4, seed: 8 });
    const view = viewFor(s, 2);

    expect(view.hands[2].cards).toEqual(s.hands[2]);
    [0, 1, 3].forEach((seat) => {
      expect(view.hands[seat].cards).toBeNull();
      expect(view.hands[seat].count).toBe(s.hands[seat].length);
    });
  });

  it('leaks nothing across the wire in a normal round', () => {
    const s = dealt({ playerCount: 5, seed: 12 });
    for (let seat = 0; seat < 5; seat++) {
      const seen = visibleCards(viewFor(s, seat));
      expect(seen.every((x) => x.seat === seat)).toBe(true);
    }
  });

  it('INVERTS visibility in a blind round', () => {
    const s = dealt({ playerCount: 4, blindOneCard: true, seed: 3 });
    expect(s.isBlindRound).toBe(true);

    const view = viewFor(s, 1);
    // your own card is withheld...
    expect(view.hands[1].cards).toBeNull();
    // ...and everyone else's is face up
    [0, 2, 3].forEach((seat) => {
      expect(view.hands[seat].cards).toEqual(s.hands[seat]);
    });
  });

  it('never lets a player obtain their own card in a blind round', () => {
    const s = dealt({ playerCount: 4, blindOneCard: true, seed: 6 });
    for (let seat = 0; seat < 4; seat++) {
      const seen = visibleCards(viewFor(s, seat));
      expect(seen.some((x) => x.seat === seat)).toBe(false);
      expect(seen).toHaveLength(3);
    }
  });

  it('only goes blind in 1-card rounds, and only when enabled', () => {
    const off = dealt({ playerCount: 4, blindOneCard: false });
    expect(off.isBlindRound).toBe(false);

    let s = dealt({ playerCount: 4, blindOneCard: true });
    expect(s.isBlindRound).toBe(true); // round 0, 1 card

    for (let i = 0; i < 4; i++) {
      s = playOutRound(bidAll(s));
      s = startRound(s, seededRng(40 + i)).state;
    }
    expect(s.handSize).toBe(2);
    expect(s.isBlindRound).toBe(false); // 2-card round is never blind
  });
});
