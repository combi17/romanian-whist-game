/** Numbers the rules page quotes, taken from the engine so the page can't drift from the game. */

export { MIN_PLAYERS, MAX_PLAYERS, MAX_HAND_SIZE } from './deck.js';
export { STREAK_LENGTH, STREAK_BONUS, EXACT_BASE } from './scoring.js';

import { STREAK_LENGTH } from './scoring.js';

export const STREAK_TEXT =
  `1-card rounds don't count toward the ${STREAK_LENGTH}-in-a-row bonus. ` +
  "They can't extend a run, and missing one can't break it either. They still " +
  'score normally.';
