/**
 * Which bids and cards are legal, and who takes a trick. The server uses these
 * to validate moves and the client uses the same code to grey out cards.
 */

import { cardsEqual, rankValue } from './deck.js';

/**
 * The bids a seat may legally make.
 *
 * Anyone may bid 0..handSize, except that the last bidder can't make the bids
 * add up to handSize, so at least one player has to miss.
 */
export function legalBids({ handSize, bidsSoFar, isLastBidder }) {
  const all = [];
  for (let n = 0; n <= handSize; n++) all.push(n);
  if (!isLastBidder) return all;

  const sum = bidsSoFar.reduce((acc, b) => acc + b, 0);
  const forbidden = handSize - sum;
  return all.filter((n) => n !== forbidden);
}

/** The single value the last bidder may not say, or null if none is in range. */
export function forbiddenBid({ handSize, bidsSoFar }) {
  const sum = bidsSoFar.reduce((acc, b) => acc + b, 0);
  const forbidden = handSize - sum;
  return forbidden >= 0 && forbidden <= handSize ? forbidden : null;
}

/**
 * Which cards in `hand` may be played into the current trick:
 *   1. leading                      -> anything
 *   2. holding the lead suit        -> must follow it
 *   3. void in lead, holding trump  -> must play a trump, any trump
 *   4. void in both                 -> anything
 *
 * You have to trump, but you don't have to overtrump.
 */
export function legalPlays({ hand, leadSuit, trumpSuit }) {
  if (!leadSuit) return [...hand];

  const followers = hand.filter((c) => c.suit === leadSuit);
  if (followers.length > 0) return followers;

  if (trumpSuit) {
    const trumps = hand.filter((c) => c.suit === trumpSuit);
    if (trumps.length > 0) return trumps;
  }

  return [...hand];
}

/** Why a card can't be played, as a message for the player, or null if it's legal. */
export function playError({ hand, card, leadSuit, trumpSuit }) {
  if (!hand.some((c) => cardsEqual(c, card))) {
    return 'You do not hold that card.';
  }

  const legal = legalPlays({ hand, leadSuit, trumpSuit });
  if (legal.some((c) => cardsEqual(c, card))) return null;

  if (hand.some((c) => c.suit === leadSuit)) {
    return `You must follow ${leadSuit}.`;
  }
  return `You are void in ${leadSuit}, so you must play a trump (${trumpSuit}).`;
}

export function isLegalPlay(args) {
  return playError(args) === null;
}

/**
 * The seat that wins a completed trick: the highest trump if one was played,
 * otherwise the highest card of the lead suit.
 */
export function determineTrickWinner({ played, leadSuit, trumpSuit }) {
  if (played.length === 0) return null;

  const trumps = trumpSuit ? played.filter((p) => p.card.suit === trumpSuit) : [];
  const contenders = trumps.length > 0 ? trumps : played.filter((p) => p.card.suit === leadSuit);

  if (contenders.length === 0) return null;

  return contenders.reduce((best, p) => (rankValue(p.card) > rankValue(best.card) ? p : best))
    .seat;
}

/** Clockwise. */
export function nextSeat(seat, playerCount) {
  return (seat + 1) % playerCount;
}

/** The seats in bidding/playing order starting from `startSeat`. */
export function seatOrder(startSeat, playerCount) {
  return Array.from({ length: playerCount }, (_, i) => (startSeat + i) % playerCount);
}
