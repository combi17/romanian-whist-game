import { describe, it, expect } from 'vitest';
import { createGame, startRound, placeBid, legalBidsFor } from '../engine.js';
import { seededRng } from '../deck.js';
import { viewFor, viewFromShared, publicState, visibleCards } from '../views.js';

/**
 * An online client gets `games.state` plus whichever `hands` rows RLS allows.
 * Rebuilt into a view, that must match what the offline table shows for the
 * seat, and must never include a card the seat shouldn't see.
 */

/** What the server stores, and what each client is allowed to fetch. */
function shard(state) {
  return {
    published: publicState(state),
    handsTable: state.hands.map((cards, seat) => ({ seat, cards })),
  };
}

/** The rows RLS would release to `seat` (migration 0004's policy, in JS). */
function rowsVisibleTo(handsTable, seat, isBlindRound) {
  return handsTable.filter((row) => (isBlindRound ? row.seat !== seat : row.seat === seat));
}

function clientView(state, seat) {
  const { published, handsTable } = shard(state);
  const visible = {};
  for (const row of rowsVisibleTo(handsTable, seat, state.isBlindRound)) {
    visible[row.seat] = row.cards;
  }
  return viewFromShared({ publicState: published, visible, seat });
}

function dealt({ playerCount = 4, blindOneCard = false, seed = 7 } = {}) {
  const game = createGame({ playerCount, blindOneCard });
  const result = startRound(game, seededRng(seed));
  expect(result.ok).toBe(true);
  return result.state;
}

describe('public state', () => {
  it('carries no card that is in anybody’s hand', () => {
    const state = dealt();
    const published = publicState(state);
    const wire = JSON.stringify(published);

    expect(published.hands).toBeUndefined();

    // The trump card is public. No card in anyone's hand should be.
    for (const hand of state.hands) {
      for (const card of hand) {
        expect(wire).not.toContain(JSON.stringify(card));
      }
    }
  });

  it('keeps every seat’s card count', () => {
    const state = dealt({ playerCount: 5 });
    expect(publicState(state).handCounts).toEqual(state.hands.map((h) => h.length));
  });

  it('keeps the trump card, which is face up on the table', () => {
    const state = dealt();
    expect(publicState(state).trumpCard).toEqual(state.trumpCard);
  });
});

describe('the client view matches the offline view', () => {
  it.each([3, 4, 5, 6])('for every seat at %i players', (playerCount) => {
    const state = dealt({ playerCount, seed: playerCount * 13 });

    for (let seat = 0; seat < playerCount; seat++) {
      expect(clientView(state, seat)).toEqual(viewFor(state, seat));
    }
  });

  it('through bidding and into play', () => {
    let state = dealt({ playerCount: 4, seed: 21 });

    for (let i = 0; i < 4; i++) {
      const seat = state.currentSeat;
      const result = placeBid(state, seat, legalBidsFor(state, seat)[0]);
      expect(result.ok).toBe(true);
      state = result.state;

      for (let s = 0; s < 4; s++) {
        expect(clientView(state, s)).toEqual(viewFor(state, s));
      }
    }
  });

  it('in a blind round, where visibility is inverted', () => {
    const state = dealt({ playerCount: 4, blindOneCard: true, seed: 5 });
    expect(state.isBlindRound).toBe(true);

    for (let seat = 0; seat < 4; seat++) {
      expect(clientView(state, seat)).toEqual(viewFor(state, seat));
    }
  });
});

describe('what a client can never obtain', () => {
  it('sees only its own cards in a normal round', () => {
    const state = dealt({ playerCount: 5, seed: 33 });

    for (let seat = 0; seat < 5; seat++) {
      const seen = visibleCards(clientView(state, seat));
      expect(seen.every((c) => c.seat === seat)).toBe(true);
      expect(seen).toHaveLength(state.hands[seat].length);
    }
  });

  it('cannot see its own card in a blind round', () => {
    const state = dealt({ playerCount: 4, blindOneCard: true, seed: 9 });

    for (let seat = 0; seat < 4; seat++) {
      const seen = visibleCards(clientView(state, seat));
      expect(seen.some((c) => c.seat === seat)).toBe(false);
      expect(seen).toHaveLength(3);
    }
  });

  it('gets nothing extra even if the hands table leaks a row it should not have', () => {
    // viewFromShared must not reveal anything beyond what it was given.
    const state = dealt({ playerCount: 4, seed: 44 });
    const view = viewFromShared({
      publicState: publicState(state),
      visible: {},
      seat: 2,
    });

    expect(visibleCards(view)).toHaveLength(0);
    expect(view.hands.every((h) => h.cards === null)).toBe(true);
    // counts still render the opponents' fans
    expect(view.hands.map((h) => h.count)).toEqual(state.hands.map((h) => h.length));
  });
});
