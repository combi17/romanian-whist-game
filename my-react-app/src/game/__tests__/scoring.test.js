import { describe, it, expect } from 'vitest';
import { roundScore, createSeatRecord, applyRound, determineWinners } from '../scoring.js';

/**
 * Run a sequence of {bid, tricksWon} through one seat record.
 * handSize defaults to a multi-card round, which is what counts toward the run.
 */
function play(rounds) {
  let record = createSeatRecord();
  const deltas = [];
  for (const r of rounds) {
    const out = applyRound(record, { handSize: 3, ...r });
    record = out.record;
    deltas.push(out.breakdown.delta);
  }
  return { record, deltas };
}

/** A record with a chosen total, for winner tests. */
function recordWith({ total, exactCount = 0, longestExactRun = 0 }) {
  return { ...createSeatRecord(), total, exactCount, longestExactRun };
}

describe('round score', () => {
  it('pays 5 + tricks for an exact bid', () => {
    expect(roundScore(0, 0)).toBe(5);
    expect(roundScore(3, 3)).toBe(8);
    expect(roundScore(8, 8)).toBe(13);
  });

  it('costs the difference when missed', () => {
    expect(roundScore(3, 1)).toBe(-2);
    expect(roundScore(1, 3)).toBe(-2);
    expect(roundScore(0, 4)).toBe(-4);
  });
});

describe('streak bonuses', () => {
  it('pays +10 on the fifth consecutive exact bid', () => {
    const { deltas } = play([
      { bid: 1, tricksWon: 1 }, // +6
      { bid: 1, tricksWon: 1 }, // +6
      { bid: 1, tricksWon: 1 }, // +6
      { bid: 1, tricksWon: 1 }, // +6
      { bid: 1, tricksWon: 1 }, // +6 +10
    ]);
    expect(deltas).toEqual([6, 6, 6, 6, 16]);
  });

  it('charges -10 on the fifth consecutive miss', () => {
    const { deltas } = play(Array(5).fill({ bid: 2, tricksWon: 0 }));
    expect(deltas).toEqual([-2, -2, -2, -2, -12]);
  });

  it('resets after paying, so ten in a row pays exactly twice', () => {
    const { deltas } = play(Array(10).fill({ bid: 0, tricksWon: 0 }));
    expect(deltas.filter((d) => d === 15)).toHaveLength(2); // 5 + 10 bonus
    expect(deltas).toEqual([5, 5, 5, 5, 15, 5, 5, 5, 5, 15]);
  });

  it('breaks a streak on the opposite result', () => {
    const { deltas } = play([
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 0 }, // miss resets
      { bid: 1, tricksWon: 1 },
    ]);
    expect(deltas).toEqual([6, 6, 6, 6, -1, 6]);
  });

  it('does not mix exact and miss into one streak', () => {
    const { record } = play([
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 0 },
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 0 },
      { bid: 1, tricksWon: 1 },
    ]);
    expect(record.total).toBe(6 - 1 + 6 - 1 + 6);
  });
});

describe('1-card rounds are invisible to the run', () => {
  it('does not extend a run', () => {
    const { record } = play([
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 1, handSize: 1 },
      { bid: 1, tricksWon: 1, handSize: 1 },
    ]);
    expect(record.streakLength).toBe(2); // not 4
  });

  it('does not break a run either', () => {
    const { deltas, record } = play([
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 0, handSize: 1 }, // missed, but a 1-card round, so ignored
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 1 }, // fifth *counting* round in a row
    ]);

    expect(record.streakKind).toBeNull(); // reset by paying out
    expect(deltas.at(-1)).toBe(16); // +6 and the +10 bonus
  });

  it('never pays the bonus on a 1-card round itself', () => {
    const { deltas } = play(Array(6).fill({ bid: 1, tricksWon: 1, handSize: 1 }));
    expect(deltas.every((d) => d === 6)).toBe(true);
  });

  it('still scores the round normally', () => {
    const { deltas } = play([
      { bid: 1, tricksWon: 1, handSize: 1 },
      { bid: 0, tricksWon: 1, handSize: 1 },
    ]);
    expect(deltas).toEqual([6, -1]);
  });

  it('still counts toward the zero-rule tiebreak', () => {
    const { record } = play([
      { bid: 1, tricksWon: 1, handSize: 1 },
      { bid: 1, tricksWon: 1, handSize: 1 },
    ]);
    expect(record.exactCount).toBe(2);
  });
});

describe('winning', () => {
  it('normally goes to the highest total', () => {
    const result = determineWinners([recordWith({ total: 40 }), recordWith({ total: 55 }), recordWith({ total: 12 })]);
    expect(result).toEqual({ winners: [1], reason: 'points' });
  });

  it('shares a tie on points', () => {
    const result = determineWinners([recordWith({ total: 55 }), recordWith({ total: 55 }), recordWith({ total: 12 })]);
    expect(result).toEqual({ winners: [0, 1], reason: 'points' });
  });

  it('gives the win to exactly 0, however far ahead the leader is', () => {
    const result = determineWinners([recordWith({ total: 120 }), recordWith({ total: 0 }), recordWith({ total: 60 })]);
    expect(result).toEqual({ winners: [1], reason: 'zero' });
  });

  it('lets zero be reached from below', () => {
    // -3 in the penultimate round, +3 in the last: lands on 0 and wins.
    let record = createSeatRecord();
    record = applyRound(record, { bid: 3, tricksWon: 0 }).record; // -3
    expect(record.total).toBe(-3);
    record = applyRound(record, { bid: 0, tricksWon: 3 }).record; // -3
    expect(record.total).toBe(-6);

    const climbed = { ...createSeatRecord(), total: 0 };
    expect(determineWinners([recordWith({ total: 90 }), climbed]).reason).toBe('zero');
  });

  it('does not fire for a total that merely passed through 0 mid-game', () => {
    // Only the final totals are inspected; nothing here is 0 at the end.
    const result = determineWinners([recordWith({ total: 4 }), recordWith({ total: -2 })]);
    expect(result).toEqual({ winners: [0], reason: 'points' });
  });

  it('breaks a zero tie on most exact bids', () => {
    const result = determineWinners([
      recordWith({ total: 0, exactCount: 7 }),
      recordWith({ total: 0, exactCount: 11 }),
      recordWith({ total: 200 }),
    ]);
    expect(result).toEqual({ winners: [1], reason: 'zero' });
  });

  it('falls through to the longest exact run when exact counts tie', () => {
    const result = determineWinners([
      recordWith({ total: 0, exactCount: 9, longestExactRun: 3 }),
      recordWith({ total: 0, exactCount: 9, longestExactRun: 6 }),
    ]);
    expect(result).toEqual({ winners: [1], reason: 'zero' });
  });

  it('shares the win when the history is identical too', () => {
    const result = determineWinners([
      recordWith({ total: 0, exactCount: 9, longestExactRun: 4 }),
      recordWith({ total: 0, exactCount: 9, longestExactRun: 4 }),
    ]);
    expect(result).toEqual({ winners: [0, 1], reason: 'zero' });
  });

  it('counts exact bids and runs as it goes', () => {
    const { record } = play([
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 1 },
      { bid: 1, tricksWon: 0 },
      { bid: 1, tricksWon: 1 },
    ]);
    expect(record.exactCount).toBe(3);
    expect(record.longestExactRun).toBe(2);
  });
});
