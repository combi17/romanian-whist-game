/**
 * The game engine: a pure state machine over the rules in ./rules.js.
 *
 * Each transition returns a new state with no I/O and no hidden randomness, so
 * the same module runs in the browser and in the Edge Function. A rejected move
 * returns `{ ok: false, error }` so the server can send the reason to the player.
 *
 * The state holds every hand. Clients get a view from views.js instead.
 */

import { assertPlayerCount, deckFor, shuffle, deal, cardsEqual } from './deck.js';
import { generateRoundPlan } from './roundPlan.js';
import {
  legalBids,
  forbiddenBid,
  legalPlays,
  playError,
  determineTrickWinner,
  nextSeat,
  seatOrder,
} from './rules.js';
import { createSeatRecord, applyRound, determineWinners } from './scoring.js';

export const PHASE = {
  BIDDING: 'bidding',
  PLAYING: 'playing',
  ROUND_END: 'round_end',
  FINISHED: 'finished',
};

const ok = (state) => ({ ok: true, state });
const fail = (state, error) => ({ ok: false, state, error });

/**
 * A game that has not dealt yet. Call startRound() to begin.
 *
 * @param playerCount  3..6
 * @param blindOneCard whether 1-card rounds are played on the forehead
 */
export function createGame({ playerCount, blindOneCard = false }) {
  assertPlayerCount(playerCount);

  return {
    playerCount,
    blindOneCard,
    roundPlan: generateRoundPlan(playerCount),
    roundIndex: -1,
    phase: PHASE.ROUND_END,

    firstBidderSeat: 0,
    currentSeat: null,

    handSize: 0,
    isBlindRound: false,
    trumpSuit: null,
    trumpCard: null,

    hands: Array.from({ length: playerCount }, () => []),
    bids: Array(playerCount).fill(null),
    tricksWon: Array(playerCount).fill(0),

    trick: { leadSuit: null, played: [] },
    trickIndex: 0,
    lastTrick: null,

    records: Array.from({ length: playerCount }, () => createSeatRecord()),
    history: [],
    winners: null,
    winReason: null,
  };
}

/**
 * Deal the next round. Kept apart from playCard so the game stays in ROUND_END
 * long enough for the table to show the round's scores.
 */
export function startRound(state, rng = Math.random) {
  if (state.phase === PHASE.FINISHED) {
    return fail(state, 'The game is over.');
  }
  if (state.roundIndex >= 0 && state.phase !== PHASE.ROUND_END) {
    return fail(state, 'The current round is still in progress.');
  }

  const roundIndex = state.roundIndex + 1;
  if (roundIndex >= state.roundPlan.length) {
    return ok(finish(state));
  }

  const handSize = state.roundPlan[roundIndex];
  const { hands, remaining } = deal(shuffle(deckFor(state.playerCount), rng), state.playerCount, handSize);

  // An 8-card round deals the whole deck, leaving no card to turn up for trump.
  const trumpCard = remaining.length > 0 ? remaining[remaining.length - 1] : null;

  // The first bidder moves one seat clockwise each round.
  const firstBidderSeat = roundIndex === 0 ? 0 : nextSeat(state.firstBidderSeat, state.playerCount);

  return ok({
    ...state,
    roundIndex,
    handSize,
    isBlindRound: state.blindOneCard && handSize === 1,
    phase: PHASE.BIDDING,
    firstBidderSeat,
    currentSeat: firstBidderSeat,
    trumpCard,
    trumpSuit: trumpCard ? trumpCard.suit : null,
    hands,
    bids: Array(state.playerCount).fill(null),
    tricksWon: Array(state.playerCount).fill(0),
    trick: { leadSuit: null, played: [] },
    trickIndex: 0,
    lastTrick: null,
  });
}

/** How many seats have bid this round. */
function bidsPlaced(state) {
  return state.bids.filter((b) => b !== null).length;
}

/** The bids so far, in bidding order. */
function bidsSoFar(state) {
  return seatOrder(state.firstBidderSeat, state.playerCount)
    .map((seat) => state.bids[seat])
    .filter((b) => b !== null);
}

/** The values `seat` may legally bid right now. */
export function legalBidsFor(state, seat) {
  if (state.phase !== PHASE.BIDDING || state.currentSeat !== seat) return [];
  return legalBids({
    handSize: state.handSize,
    bidsSoFar: bidsSoFar(state),
    isLastBidder: bidsPlaced(state) === state.playerCount - 1,
  });
}

/** The one value the last bidder may not say, for the UI tooltip. Null otherwise. */
export function forbiddenBidFor(state, seat) {
  if (state.phase !== PHASE.BIDDING || state.currentSeat !== seat) return null;
  if (bidsPlaced(state) !== state.playerCount - 1) return null;
  return forbiddenBid({ handSize: state.handSize, bidsSoFar: bidsSoFar(state) });
}

export function placeBid(state, seat, bid) {
  if (state.phase !== PHASE.BIDDING) return fail(state, 'Not the bidding phase.');
  if (state.currentSeat !== seat) return fail(state, 'It is not your turn to bid.');

  const legal = legalBidsFor(state, seat);
  if (!legal.includes(bid)) {
    const forbidden = forbiddenBidFor(state, seat);
    if (forbidden === bid) {
      return fail(state, `You cannot bid ${bid}: the bids would add up to ${state.handSize}.`);
    }
    return fail(state, `Bid must be between 0 and ${state.handSize}.`);
  }

  const bids = [...state.bids];
  bids[seat] = bid;

  const everyoneBid = bids.every((b) => b !== null);

  return ok({
    ...state,
    bids,
    // The first bidder also leads the first trick.
    phase: everyoneBid ? PHASE.PLAYING : PHASE.BIDDING,
    currentSeat: everyoneBid ? state.firstBidderSeat : nextSeat(seat, state.playerCount),
  });
}

/** The cards `seat` may legally play right now. */
export function legalPlaysFor(state, seat) {
  if (state.phase !== PHASE.PLAYING || state.currentSeat !== seat) return [];
  return legalPlays({
    hand: state.hands[seat],
    leadSuit: state.trick.leadSuit,
    trumpSuit: state.trumpSuit,
  });
}

export function playCard(state, seat, card) {
  if (state.phase !== PHASE.PLAYING) return fail(state, 'Not the playing phase.');
  if (state.currentSeat !== seat) return fail(state, 'It is not your turn.');

  const error = playError({
    hand: state.hands[seat],
    card,
    leadSuit: state.trick.leadSuit,
    trumpSuit: state.trumpSuit,
  });
  if (error) return fail(state, error);

  const hands = state.hands.map((hand, i) =>
    i === seat ? hand.filter((c) => !cardsEqual(c, card)) : hand,
  );

  const played = [...state.trick.played, { seat, card }];
  const leadSuit = state.trick.leadSuit ?? card.suit;

  // Trick still in progress.
  if (played.length < state.playerCount) {
    return ok({
      ...state,
      hands,
      trick: { leadSuit, played },
      currentSeat: nextSeat(seat, state.playerCount),
    });
  }

  // Trick complete.
  const winner = determineTrickWinner({ played, leadSuit, trumpSuit: state.trumpSuit });
  const tricksWon = [...state.tricksWon];
  tricksWon[winner] += 1;

  const roundOver = hands.every((hand) => hand.length === 0);
  const afterTrick = {
    ...state,
    hands,
    tricksWon,
    lastTrick: { leadSuit, played, winner },
    trick: { leadSuit: null, played: [] },
    trickIndex: state.trickIndex + 1,
    // The winner leads the next trick.
    currentSeat: winner,
  };

  return ok(roundOver ? endRound(afterTrick) : afterTrick);
}

/** Score the round and wait in ROUND_END until startRound() is called. */
function endRound(state) {
  const results = state.records.map((record, seat) =>
    applyRound(record, {
      bid: state.bids[seat],
      tricksWon: state.tricksWon[seat],
      handSize: state.handSize,
    }),
  );

  const next = {
    ...state,
    phase: PHASE.ROUND_END,
    records: results.map((r) => r.record),
    history: [
      ...state.history,
      {
        roundIndex: state.roundIndex,
        handSize: state.handSize,
        trumpSuit: state.trumpSuit,
        isBlindRound: state.isBlindRound,
        seats: results.map((r) => r.breakdown),
      },
    ],
  };

  const wasLastRound = state.roundIndex === state.roundPlan.length - 1;
  return wasLastRound ? finish(next) : next;
}

function finish(state) {
  const { winners, reason } = determineWinners(state.records);
  return { ...state, phase: PHASE.FINISHED, currentSeat: null, winners, winReason: reason };
}

export function isGameOver(state) {
  return state.phase === PHASE.FINISHED;
}

export function totals(state) {
  return state.records.map((r) => r.total);
}
