/**
 * Hand size for each round, with N players:
 *
 *   N rounds of 1  ->  2..7  ->  N rounds of 8  ->  7..2  ->  N rounds of 1
 *
 * 3N + 12 rounds in all: 21 at 3 players, 24 at 4, 27 at 5, 30 at 6.
 */

import { assertPlayerCount, MAX_HAND_SIZE } from './deck.js';

export function generateRoundPlan(playerCount) {
  assertPlayerCount(playerCount);

  const ones = Array(playerCount).fill(1);
  const ascending = [];
  for (let n = 2; n < MAX_HAND_SIZE; n++) ascending.push(n); // 2..7
  const maxes = Array(playerCount).fill(MAX_HAND_SIZE);
  const descending = [...ascending].reverse(); // 7..2

  return [...ones, ...ascending, ...maxes, ...descending, ...ones];
}

/** Total rounds in a game at this table size. */
export function totalRounds(playerCount) {
  assertPlayerCount(playerCount);
  return 3 * playerCount + 12;
}
