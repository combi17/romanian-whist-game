/**
 * Bot policy. The bot estimates its hand, bids that, then plays to make the
 * bid: it goes after tricks while it's short and ducks once it has enough.
 * A bot that played at random would make everyone else's bids meaningless.
 */

import { rankValue } from './deck.js';
import { legalPlays } from './rules.js';

/**
 * Roughly how many tricks this hand should take.
 *
 * Counts likely winners (high trumps, aces, kings) and rounds toward a low
 * bid, since an over-bid is harder to recover from.
 */
export function estimateTricks(hand, trumpSuit) {
  let estimate = 0;

  for (const card of hand) {
    const v = rankValue(card);
    const isTrump = trumpSuit && card.suit === trumpSuit;

    if (isTrump) {
      // trumps are strong: the ace and king are near-locks, low trumps often win late
      if (v >= rankValue({ rank: 'Q' })) estimate += 1;
      else estimate += 0.4;
    } else if (v >= rankValue({ rank: 'A' })) {
      estimate += 0.9;
    } else if (v >= rankValue({ rank: 'K' })) {
      estimate += 0.5;
    }
  }

  return Math.round(estimate);
}

/** Pick a bid: the estimate, nudged into whatever is legal. */
export function chooseBid({ hand, trumpSuit, legal }) {
  const wanted = Math.min(estimateTricks(hand, trumpSuit), hand.length);
  if (legal.includes(wanted)) return wanted;

  // The last-bidder rule ruled out the bid we wanted. Take the nearest legal
  // one, and the lower of two on a tie.
  return [...legal].sort((a, b) => {
    const da = Math.abs(a - wanted);
    const db = Math.abs(b - wanted);
    return da === db ? a - b : da - db;
  })[0];
}

/**
 * Pick a card, steering toward the bid.
 *
 * needsTricks > 0 -> try to win this trick as cheaply as possible
 * needsTricks = 0 -> try to lose it, dumping the most dangerous card safely
 */
export function chooseCard({ hand, trick, trumpSuit, bid, tricksWon }) {
  const legal = legalPlays({ hand, leadSuit: trick.leadSuit, trumpSuit });
  if (legal.length === 1) return legal[0];

  const needsTricks = bid - tricksWon;
  const winning = legal.filter((card) => wouldWin({ card, trick, trumpSuit }));
  const losing = legal.filter((card) => !wouldWin({ card, trick, trumpSuit }));

  if (needsTricks > 0) {
    // Win it, but spend as little as possible doing so.
    if (winning.length > 0) return cheapest(winning);
    // Cannot win: shed the least useful card.
    return cheapest(legal);
  }

  // Already on contract (or past it). Duck.
  if (losing.length > 0) return dearest(losing);
  // Forced to win. Do it with the biggest card so the small ones stay flexible.
  return dearest(legal);
}

/** Would this card currently be beating the trick? */
function wouldWin({ card, trick, trumpSuit }) {
  if (trick.played.length === 0) return true; // leading: assume it might hold

  const leadSuit = trick.leadSuit;
  const best = currentBest({ played: trick.played, leadSuit, trumpSuit });

  const cardIsTrump = trumpSuit && card.suit === trumpSuit;
  const bestIsTrump = trumpSuit && best.suit === trumpSuit;

  if (cardIsTrump && !bestIsTrump) return true;
  if (!cardIsTrump && bestIsTrump) return false;
  if (card.suit !== best.suit) return false; // off-suit discard never wins
  return rankValue(card) > rankValue(best);
}

function currentBest({ played, leadSuit, trumpSuit }) {
  const trumps = trumpSuit ? played.filter((p) => p.card.suit === trumpSuit) : [];
  const pool = trumps.length > 0 ? trumps : played.filter((p) => p.card.suit === leadSuit);
  if (pool.length === 0) return played[0].card;
  return pool.reduce((a, b) => (rankValue(a.card) > rankValue(b.card) ? a : b)).card;
}

const cheapest = (cards) => [...cards].sort((a, b) => rankValue(a) - rankValue(b))[0];
const dearest = (cards) => [...cards].sort((a, b) => rankValue(b) - rankValue(a))[0];
