/**
 * What each seat is allowed to see.
 *
 * The engine state holds every hand and must never reach a client as-is.
 * The blind round flips the usual rule:
 *
 *            normal round            blind round (1 card, forehead)
 *   own      full hand               hidden
 *   others   count only              their card, face up
 *
 * This happens on the server. A client that received its own card and simply
 * didn't draw it would still show it in the network tab.
 */

/**
 * @param state the full engine state
 * @param seat  the seat this view is for, or null for a spectator/server view
 */
export function viewFor(state, seat) {
  const blind = state.isBlindRound;

  const hands = state.hands.map((hand, i) => {
    const isOwn = i === seat;
    const visible = blind ? !isOwn : isOwn;

    return visible
      ? { seat: i, count: hand.length, cards: hand }
      : { seat: i, count: hand.length, cards: null };
  });

  return {
    playerCount: state.playerCount,
    seat,
    phase: state.phase,
    roundIndex: state.roundIndex,
    roundCount: state.roundPlan.length,
    handSize: state.handSize,
    isBlindRound: blind,

    trumpSuit: state.trumpSuit,
    trumpCard: state.trumpCard,

    firstBidderSeat: state.firstBidderSeat,
    currentSeat: state.currentSeat,
    bids: [...state.bids],
    tricksWon: [...state.tricksWon],

    trick: { leadSuit: state.trick.leadSuit, played: [...state.trick.played] },
    lastTrick: state.lastTrick,

    hands,
    totals: state.records.map((r) => r.total),

    // Bids and tricks are public, so each seat's run toward the ±10 bonus is too.
    streaks: state.records.map((r) => ({
      kind: r.streakKind,
      length: r.streakLength,
    })),

    history: state.history,
    winners: state.winners,
    winReason: state.winReason,
  };
}

/**
 * The full state with the cards removed. Hand sizes stay public, as they would
 * at a real table. The server writes this shape to `games.state`, the row every
 * client can read.
 */
export function publicState(state) {
  const { hands, ...rest } = state;
  return { ...rest, handCounts: hands.map((hand) => hand.length) };
}

/**
 * Builds the same shape as `viewFor` from what an online client receives: the
 * public state plus whichever hand rows RLS lets it read. Components can't tell
 * a local game from an online one.
 *
 * @param publicState the row from `games.state`
 * @param visible     { [seat]: cards }, whatever the hands table allowed
 * @param seat        this client's engine seat
 */
export function viewFromShared({ publicState, visible, seat }) {
  const counts = publicState.handCounts ?? [];

  const hands = counts.map((count, i) => ({
    seat: i,
    count,
    cards: visible[i] ?? null,
  }));

  return {
    playerCount: publicState.playerCount,
    seat,
    phase: publicState.phase,
    roundIndex: publicState.roundIndex,
    roundCount: publicState.roundPlan.length,
    handSize: publicState.handSize,
    isBlindRound: publicState.isBlindRound,

    trumpSuit: publicState.trumpSuit,
    trumpCard: publicState.trumpCard,

    firstBidderSeat: publicState.firstBidderSeat,
    currentSeat: publicState.currentSeat,
    bids: [...publicState.bids],
    tricksWon: [...publicState.tricksWon],

    trick: { leadSuit: publicState.trick.leadSuit, played: [...publicState.trick.played] },
    lastTrick: publicState.lastTrick,

    hands,
    totals: publicState.records.map((r) => r.total),
    streaks: publicState.records.map((r) => ({ kind: r.streakKind, length: r.streakLength })),
    history: publicState.history,
    winners: publicState.winners,
    winReason: publicState.winReason,
  };
}

/** Every card this view exposes, flattened. Used by the visibility tests. */
export function visibleCards(view) {
  return view.hands
    .filter((h) => h.cards !== null)
    .flatMap((h) => h.cards.map((c) => ({ seat: h.seat, card: c })));
}
