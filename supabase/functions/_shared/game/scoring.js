/**
 * Scoring, streaks and win conditions.
 *
 *   bid matched exactly -> +5 + tricksWon
 *   missed              -> -|bid - tricksWon|
 *   5 exact in a row    -> +10
 *   5 missed in a row   -> -10
 *
 * A player who finishes on exactly 0 wins outright, whatever anyone else scored.
 */

export const STREAK_LENGTH = 5;
export const STREAK_BONUS = 10;
export const EXACT_BASE = 5;

/** Points for one seat in one round, before streak bonuses. */
export function roundScore(bid, tricksWon) {
  return bid === tricksWon ? EXACT_BASE + tricksWon : -Math.abs(bid - tricksWon);
}

/** Per-seat bookkeeping that persists across rounds. */
export function createSeatRecord() {
  return {
    total: 0,
    /** Current run used for the +-10 bonus; resets to 0 when a bonus is paid. */
    streakKind: null, // 'exact' | 'miss' | null
    streakLength: 0,
    /** Tiebreakers for the zero rule. A bonus payout doesn't reset these. */
    exactCount: 0,
    longestExactRun: 0,
    currentExactRun: 0,
  };
}

/** Apply one round to a seat record. Returns the new record and a breakdown for the scoreboard. */
export function applyRound(record, { bid, tricksWon, handSize }) {
  const exact = bid === tricksWon;
  const base = roundScore(bid, tricksWon);

  // 1-card rounds score normally, but they're mostly luck, so they neither
  // extend a streak nor break one.
  const countsTowardRun = handSize !== 1;

  let { streakKind, streakLength, currentExactRun } = record;
  let bonus = 0;

  if (countsTowardRun) {
    const kind = exact ? 'exact' : 'miss';
    streakLength = streakKind === kind ? streakLength + 1 : 1;
    streakKind = kind;

    if (streakLength >= STREAK_LENGTH) {
      bonus = exact ? STREAK_BONUS : -STREAK_BONUS;
      // Reset so ten in a row pays twice, not six times.
      streakLength = 0;
      streakKind = null;
    }

    currentExactRun = exact ? currentExactRun + 1 : 0;
  }

  const next = {
    total: record.total + base + bonus,
    streakKind,
    streakLength,
    // Every round counts here, 1-card rounds included. Used to break ties on zero.
    exactCount: record.exactCount + (exact ? 1 : 0),
    longestExactRun: Math.max(record.longestExactRun, currentExactRun),
    currentExactRun,
  };

  return {
    record: next,
    breakdown: {
      bid,
      tricksWon,
      exact,
      base,
      bonus,
      delta: base + bonus,
      total: next.total,
      countsTowardRun,
    },
  };
}

/**
 * Who won. Finishing on zero beats any points total. Ties on zero go to the
 * most exact bids, then the longest run of exact bids, and after that the win
 * is shared.
 *
 * `records` is indexed by seat.
 */
export function determineWinners(records) {
  const seats = records.map((_, seat) => seat);
  const zeroSeats = seats.filter((seat) => records[seat].total === 0);

  if (zeroSeats.length > 0) {
    return { winners: breakZeroTie(zeroSeats, records), reason: 'zero' };
  }

  const best = Math.max(...records.map((r) => r.total));
  return { winners: seats.filter((seat) => records[seat].total === best), reason: 'points' };
}

function breakZeroTie(zeroSeats, records) {
  if (zeroSeats.length === 1) return zeroSeats;

  const byExact = bestBy(zeroSeats, (seat) => records[seat].exactCount);
  if (byExact.length === 1) return byExact;

  const byRun = bestBy(byExact, (seat) => records[seat].longestExactRun);
  return byRun; // still tied -> shared
}

function bestBy(seats, metric) {
  const best = Math.max(...seats.map(metric));
  return seats.filter((seat) => metric(seat) === best);
}
