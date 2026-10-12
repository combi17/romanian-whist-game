import { describe, it, expect } from 'vitest';
import { generateRoundPlan, totalRounds } from '../roundPlan.js';

describe('round plan', () => {
  it('matches the known 4-player plan exactly', () => {
    expect(generateRoundPlan(4)).toEqual([
      1, 1, 1, 1,
      2, 3, 4, 5, 6, 7,
      8, 8, 8, 8,
      7, 6, 5, 4, 3, 2,
      1, 1, 1, 1,
    ]);
  });

  it('matches the known 3-player plan exactly', () => {
    expect(generateRoundPlan(3)).toEqual([
      1, 1, 1,
      2, 3, 4, 5, 6, 7,
      8, 8, 8,
      7, 6, 5, 4, 3, 2,
      1, 1, 1,
    ]);
  });

  it.each([[3, 21], [4, 24], [5, 27], [6, 30]])(
    '%i players -> %i rounds',
    (players, rounds) => {
      expect(generateRoundPlan(players)).toHaveLength(rounds);
      expect(totalRounds(players)).toBe(rounds);
    },
  );

  it.each([3, 4, 5, 6])('is structurally correct for %i players', (n) => {
    const plan = generateRoundPlan(n);

    // opens and closes with N ones
    expect(plan.slice(0, n)).toEqual(Array(n).fill(1));
    expect(plan.slice(-n)).toEqual(Array(n).fill(1));

    // N eights in the middle
    expect(plan.filter((c) => c === 8)).toHaveLength(n);

    // ascending 2..7 then N eights then descending 7..2
    expect(plan.slice(n, n + 6)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(plan.slice(n + 6, n + 6 + n)).toEqual(Array(n).fill(8));
    expect(plan.slice(n + 6 + n, n + 6 + n + 6)).toEqual([7, 6, 5, 4, 3, 2]);

    // never asks for more cards than a player can hold
    expect(Math.max(...plan)).toBe(8);
    expect(Math.min(...plan)).toBe(1);
  });

  it.each([3, 4, 5, 6])('is a palindrome for %i players', (n) => {
    const plan = generateRoundPlan(n);
    expect(plan).toEqual([...plan].reverse());
  });

  it.each([3, 4, 5, 6])('never deals more cards than the deck holds (%i players)', (n) => {
    for (const handSize of generateRoundPlan(n)) {
      expect(handSize * n).toBeLessThanOrEqual(8 * n);
    }
  });
});
