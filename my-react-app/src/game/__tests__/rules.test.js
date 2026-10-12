import { describe, it, expect } from 'vitest';
import { legalBids, forbiddenBid, legalPlays, playError, determineTrickWinner } from '../rules.js';

const c = (rank, suit) => ({ rank, suit });
const names = (cards) => cards.map((x) => `${x.rank}${x.suit}`).sort();

describe('bidding: the last-bidder rule', () => {
  it('lets everyone but the last bidder say anything in range', () => {
    expect(legalBids({ handSize: 3, bidsSoFar: [1], isLastBidder: false })).toEqual([0, 1, 2, 3]);
  });

  it('forbids the last bidder the value that would total the hand size', () => {
    // 4 players, 3 cards each, bids so far 1 + 1 + 0 = 2 -> 1 is forbidden
    expect(legalBids({ handSize: 3, bidsSoFar: [1, 1, 0], isLastBidder: true })).toEqual([0, 2, 3]);
    expect(forbiddenBid({ handSize: 3, bidsSoFar: [1, 1, 0] })).toBe(1);
  });

  it('forbids nothing when the shortfall is out of range', () => {
    // already over-bid: 5 > 3, so no legal value could reach the total anyway
    expect(legalBids({ handSize: 3, bidsSoFar: [2, 2, 1], isLastBidder: true })).toEqual([0, 1, 2, 3]);
    expect(forbiddenBid({ handSize: 3, bidsSoFar: [2, 2, 1] })).toBeNull();
  });

  it('forbids 0 when the others have already bid the whole hand', () => {
    expect(legalBids({ handSize: 3, bidsSoFar: [1, 1, 1], isLastBidder: true })).toEqual([1, 2, 3]);
  });

  it('handles the 1-card round', () => {
    expect(legalBids({ handSize: 1, bidsSoFar: [0, 0, 0], isLastBidder: true })).toEqual([0]);
    expect(legalBids({ handSize: 1, bidsSoFar: [1, 0, 0], isLastBidder: true })).toEqual([1]);
  });
});

describe('legal plays', () => {
  const hand = [c('K', '♥'), c('3', '♥'), c('9', '♠'), c('3', '♠'), c('A', '♦')];

  it('allows anything when leading', () => {
    expect(legalPlays({ hand, leadSuit: null, trumpSuit: '♠' })).toHaveLength(5);
  });

  it('forces following suit when able', () => {
    expect(names(legalPlays({ hand, leadSuit: '♥', trumpSuit: '♠' }))).toEqual(['3♥', 'K♥']);
  });

  it('forces a trump when void in the lead suit', () => {
    expect(names(legalPlays({ hand, leadSuit: '♣', trumpSuit: '♠' }))).toEqual(['3♠', '9♠']);
  });

  it('does NOT force overtrumping — any trump is legal', () => {
    // You must trump, but any trump will do, so the 3♠ under a 7♠ is legal.
    const legal = legalPlays({ hand, leadSuit: '♣', trumpSuit: '♠' });
    expect(names(legal)).toContain('3♠');
  });

  it('allows anything when void in both lead and trump', () => {
    const poor = [c('K', '♥'), c('A', '♦')];
    expect(legalPlays({ hand: poor, leadSuit: '♣', trumpSuit: '♠' })).toHaveLength(2);
  });

  it('does not force a trump in a no-trump round', () => {
    expect(legalPlays({ hand, leadSuit: '♣', trumpSuit: null })).toHaveLength(5);
  });
});

describe('play errors', () => {
  const hand = [c('K', '♥'), c('9', '♠'), c('3', '♠')];

  it('names the suit you must follow', () => {
    expect(playError({ hand, card: c('9', '♠'), leadSuit: '♥', trumpSuit: '♦' })).toMatch(/follow ♥/);
  });

  it('explains the trump obligation', () => {
    expect(playError({ hand, card: c('K', '♥'), leadSuit: '♣', trumpSuit: '♠' })).toMatch(/must play a trump/);
  });

  it('rejects a card you do not hold', () => {
    expect(playError({ hand, card: c('2', '♣'), leadSuit: null, trumpSuit: '♠' })).toMatch(/do not hold/);
  });

  it('returns null for a legal play', () => {
    expect(playError({ hand, card: c('K', '♥'), leadSuit: '♥', trumpSuit: '♠' })).toBeNull();
    expect(playError({ hand, card: c('3', '♠'), leadSuit: '♣', trumpSuit: '♠' })).toBeNull();
  });
});

describe('trick winner', () => {
  it('highest card of the lead suit when no trump is played', () => {
    const played = [
      { seat: 0, card: c('9', '♥') },
      { seat: 1, card: c('K', '♥') },
      { seat: 2, card: c('3', '♥') },
      { seat: 3, card: c('A', '♦') },
    ];
    expect(determineTrickWinner({ played, leadSuit: '♥', trumpSuit: '♠' })).toBe(1);
  });

  it('any trump beats the highest card of the lead suit', () => {
    // The A♥ is the highest card played, but the 3♠ is trump.
    const played = [
      { seat: 0, card: c('A', '♥') },
      { seat: 1, card: c('3', '♠') },
      { seat: 2, card: c('K', '♥') },
      { seat: 3, card: c('Q', '♥') },
    ];
    expect(determineTrickWinner({ played, leadSuit: '♥', trumpSuit: '♠' })).toBe(1);
  });

  it('highest trump wins when several are played', () => {
    const played = [
      { seat: 0, card: c('A', '♥') },
      { seat: 1, card: c('3', '♠') },
      { seat: 2, card: c('9', '♠') },
      { seat: 3, card: c('7', '♠') },
    ];
    expect(determineTrickWinner({ played, leadSuit: '♥', trumpSuit: '♠' })).toBe(2);
  });

  it('an off-suit discard never wins', () => {
    const played = [
      { seat: 0, card: c('3', '♥') },
      { seat: 1, card: c('A', '♦') },
      { seat: 2, card: c('A', '♣') },
    ];
    expect(determineTrickWinner({ played, leadSuit: '♥', trumpSuit: '♠' })).toBe(0);
  });

  it('resolves a no-trump round on the lead suit alone', () => {
    const played = [
      { seat: 0, card: c('9', '♥') },
      { seat: 1, card: c('A', '♠') },
      { seat: 2, card: c('J', '♥') },
    ];
    expect(determineTrickWinner({ played, leadSuit: '♥', trumpSuit: null })).toBe(2);
  });

  it('a trump lead is resolved as a trump trick', () => {
    const played = [
      { seat: 0, card: c('9', '♠') },
      { seat: 1, card: c('K', '♠') },
      { seat: 2, card: c('A', '♥') },
    ];
    expect(determineTrickWinner({ played, leadSuit: '♠', trumpSuit: '♠' })).toBe(1);
  });
});
