/**
 * Runs a whole game in the browser with no server, for the practice table.
 * You sit at seat 0 and bots take the other seats. Returns the same shape as
 * useSharedGame.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  createGame,
  startRound,
  placeBid,
  playCard,
  legalBidsFor,
  legalPlaysFor,
  forbiddenBidFor,
  PHASE,
} from '../../game/engine.js';
import { viewFor } from '../../game/views.js';
import { chooseBid, chooseCard } from '../../game/policy.js';
import {
  sfxDeal,
  sfxPlay,
  sfxTrick,
  sfxBid,
  sfxRoundEnd,
  sfxGameEnd,
  sfxDenied,
} from './sounds.js';

export const YOU = 0;

/**
 * Pauses that let a person follow the play. Bots could move instantly, but
 * then you couldn't see who played what.
 */
export const TIMING = {
  dealCard: 55, // stagger between dealt cards
  botThink: 1150, // pause before a bot acts, so its turn is visible
  trickHold: 3000, // the completed trick sits on the felt this long
  trickSweep: 2200, // ...and starts being swept up at this point
  roundBanner: 1600,
};

const ACTIONS = {
  SET: 'set',
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET:
      return action.state;
    default:
      return state;
  }
}

export function useLocalGame({ playerCount = 4, blindOneCard = false, seed } = {}) {
  const [state, dispatch] = useReducer(reducer, null, () =>
    createGame({ playerCount, blindOneCard }),
  );

  /** Set while a finished trick is shown, before it is swept away. */
  const [resolvingTrick, setResolvingTrick] = useState(null);
  const [dealKey, setDealKey] = useState(0);
  const [message, setMessage] = useState(null);
  const timers = useRef([]);

  /**
   * The last trick index whose animation has been shown. A ref so that
   * clearing `resolvingTrick` doesn't re-run the effect that set it.
   */
  const shownTrick = useRef(-1);

  const rng = useMemo(() => (seed === undefined ? Math.random : makeSeeded(seed)), [seed]);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const apply = useCallback((result) => {
    if (result.ok) {
      dispatch({ type: ACTIONS.SET, state: result.state });
      return true;
    }
    setMessage(result.error);
    sfxDenied();
    return false;
  }, []);

  /** Deal the next round. */
  const deal = useCallback(() => {
    setMessage(null);
    setResolvingTrick(null);
    shownTrick.current = -1;
    const result = startRound(state, rng);
    if (result.ok) {
      setDealKey((k) => k + 1);
      // one sound per card, in step with the deal animation
      const cards = result.state.handSize * result.state.playerCount;
      for (let i = 0; i < cards; i++) later(sfxDeal, i * TIMING.dealCard);
    }
    apply(result);
  }, [state, rng, apply, later]);

  const bid = useCallback(
    (value) => {
      setMessage(null);
      if (apply(placeBid(state, state.currentSeat, value))) sfxBid();
    },
    [state, apply],
  );

  const play = useCallback(
    (card) => {
      setMessage(null);
      if (apply(playCard(state, state.currentSeat, card))) sfxPlay();
    },
    [state, apply],
  );


  /**
   * Hold a completed trick on the table, then sweep it to the winner.
   *
   * The last card clears `trick.played` in the same update that sets
   * `lastTrick`. A layout effect runs before paint, so the table never shows a
   * frame with the trick missing.
   */
  useLayoutEffect(() => {
    if (!state.lastTrick) return;
    if (shownTrick.current === state.trickIndex) return;

    shownTrick.current = state.trickIndex;
    setResolvingTrick({ id: state.trickIndex, sweeping: false, ...state.lastTrick });

    const toSweep = later(() => {
      sfxTrick();
      setResolvingTrick((t) => (t ? { ...t, sweeping: true } : t));
    }, TIMING.trickSweep);

    const toClear = later(() => setResolvingTrick(null), TIMING.trickHold);

    return () => {
      clearTimeout(toSweep);
      clearTimeout(toClear);
    };
  }, [state.lastTrick, state.trickIndex, later]);

  // Bots act, but only once the table has settled.
  useEffect(() => {
    if (resolvingTrick) return;
    if (state.currentSeat === null || state.currentSeat === YOU) return;
    if (state.phase !== PHASE.BIDDING && state.phase !== PHASE.PLAYING) return;

    const seat = state.currentSeat;
    const timer = later(() => {
      if (state.phase === PHASE.BIDDING) {
        const value = chooseBid({
          hand: state.hands[seat],
          trumpSuit: state.trumpSuit,
          legal: legalBidsFor(state, seat),
        });
        apply(placeBid(state, seat, value));
      } else {
        const card = chooseCard({
          hand: state.hands[seat],
          trick: state.trick,
          trumpSuit: state.trumpSuit,
          bid: state.bids[seat],
          tricksWon: state.tricksWon[seat],
        });
        apply(playCard(state, seat, card));
      }
    }, TIMING.botThink);

    return () => clearTimeout(timer);
  }, [state, resolvingTrick, apply, later]);

  // Scoreboard and game-over stings, fired once as the phase arrives.
  const announced = useRef(null);
  useEffect(() => {
    const key = `${state.phase}:${state.roundIndex}`;
    if (announced.current === key) return;
    announced.current = key;
    if (state.phase === PHASE.FINISHED) sfxGameEnd();
    else if (state.phase === PHASE.ROUND_END && state.roundIndex >= 0) sfxRoundEnd();
  }, [state.phase, state.roundIndex]);

  const view = useMemo(() => viewFor(state, YOU), [state]);

  const yourTurn = state.currentSeat === YOU && !resolvingTrick;

  return {
    state,
    view,
    dealKey,
    message,
    resolvingTrick,
    yourTurn,
    isBidding: state.phase === PHASE.BIDDING,
    isPlaying: state.phase === PHASE.PLAYING,
    // The last trick and the round's scoring happen in one engine step. Wait
    // for the trick animation to finish before showing the scoreboard.
    isRoundOver: state.phase === PHASE.ROUND_END && !resolvingTrick,
    isFinished: state.phase === PHASE.FINISHED && !resolvingTrick,
    legalBids: yourTurn && state.phase === PHASE.BIDDING ? legalBidsFor(state, YOU) : [],
    forbidden: state.phase === PHASE.BIDDING ? forbiddenBidFor(state, YOU) : null,
    legalCards: yourTurn && state.phase === PHASE.PLAYING ? legalPlaysFor(state, YOU) : [],
    deal,
    bid,
    play,
    dismissMessage: () => setMessage(null),
  };
}

function makeSeeded(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
