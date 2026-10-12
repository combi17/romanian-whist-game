/**
 * An online game. Returns the same shape as `useLocalGame`, so <GameTable />
 * works unchanged in both modes. What differs:
 *
 *   - state arrives from Postgres over Realtime instead of from a reducer
 *   - moves are sent to the `game` Edge Function, which validates them
 *   - this client only ever receives its own cards
 *
 * The server resolves a finished trick at once and sends `lastTrick`. Each
 * client then animates it at a pace people can follow.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import supabase from '../../supabaseClient';
import { viewFromShared } from '../../game/views.js';
import { legalBids, forbiddenBid, legalPlays } from '../../game/rules.js';
import { cardsEqual } from '../../game/deck.js';
import { PHASE } from '../../game/engine.js';
import { TIMING } from './useLocalGame.js';
import { sfxDeal, sfxPlay, sfxTrick, sfxBid, sfxRoundEnd, sfxGameEnd, sfxDenied } from './sounds.js';

/**
 * How long to wait on a silent seat before asking the server to cover it.
 * A little over the server's 15s grace period, so the request isn't refused
 * for arriving early.
 */
const ABSENCE_PROBE_MS = 16_000;

export function useSharedGame({ roomId, userId }) {
  const [game, setGame] = useState(null); // the games row
  const [myCards, setMyCards] = useState({}); // { [seat]: cards }, whatever RLS allowed
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [resolvingTrick, setResolvingTrick] = useState(null);
  const [pending, setPending] = useState(false);

  const timers = useRef([]);
  const shownTrick = useRef(-1);
  const announced = useRef(null);
  const dealtRound = useRef(-1);

  /** Mirrors `myCards` so `refresh` can compare without a stale closure. */
  const cardsRef = useRef({});
  const fetchedGame = useRef(null);
  const fetchedRound = useRef(-1);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** Pull the row and whatever hands this client is allowed to see. */
  const refresh = useCallback(async () => {
    const { data: row, error } = await supabase
      .from('games')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    if (!row) {
      setGame(null);
      setLoading(false);
      return;
    }

    setGame(row);
    setLoading(false);

    // Only refetch cards when they could have changed: a new game, a new
    // round, or a local count that no longer matches the server's. Hands only
    // grow on a deal, and play() already removes played cards locally. The
    // count check also repairs any desync on the next update.
    const mySeat = row.seats.indexOf(userId);
    const held = cardsRef.current[mySeat]?.length ?? -1;
    const expected = row.state.handCounts?.[mySeat] ?? -1;

    const stale =
      row.id !== fetchedGame.current ||
      row.state.roundIndex !== fetchedRound.current ||
      // in a blind round you hold other players' cards, so the count check
      // doesn't work; it's one card each, so just refetch
      row.state.isBlindRound ||
      held !== expected;

    if (!stale) return;

    fetchedGame.current = row.id;
    fetchedRound.current = row.state.roundIndex;

    const { data: hands } = await supabase
      .from('hands')
      .select('seat, cards')
      .eq('game_id', row.id)
      .eq('round_index', row.state.roundIndex);

    const visible = {};
    for (const h of hands ?? []) visible[h.seat] = h.cards;
    cardsRef.current = visible;
    setMyCards(visible);
  }, [roomId, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Only the public game row is broadcast. Hands are read separately, through RLS.
  useEffect(() => {
    const channel = supabase
      .channel(`game:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `room_id=eq.${roomId}` },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  const seat = useMemo(
    () => (game ? game.seats.indexOf(userId) : -1),
    [game, userId],
  );

  const view = useMemo(() => {
    if (!game || seat === -1) return null;
    return viewFromShared({ publicState: game.state, visible: myCards, seat });
  }, [game, myCards, seat]);

  const phase = game?.state?.phase;
  const roundIndex = game?.state?.roundIndex ?? -1;
  const handSize = game?.state?.handSize ?? 0;
  const playerCount = game?.state?.playerCount ?? 0;
  const lastTrick = game?.state?.lastTrick ?? null;
  const trickIndex = game?.state?.trickIndex ?? 0;

  /* ---------------------------------------------------------------- intents */

  const inFlight = useRef(false);

  const send = useCallback(
    async (action, body = {}) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setPending(true);
      setMessage(null);
      const { data, error } = await supabase.functions.invoke('game', {
        body: { action, roomId, ...body },
      });
      inFlight.current = false;
      setPending(false);

      // A non-2xx comes back as FunctionsHttpError. The JSON body has the
      // engine's rejection message.
      if (error) {
        let text = error.message;
        try {
          const parsed = await error.context?.json?.();
          if (parsed?.error) text = parsed.error;
        } catch {
          /* keep the generic message */
        }
        setMessage(text);
        sfxDenied();
        return false;
      }
      if (data?.error) {
        setMessage(data.error);
        sfxDenied();
        return false;
      }
      return true;
    },
    [roomId],
  );

  const bid = useCallback(
    async (value) => {
      if (await send('bid', { bid: value })) sfxBid();
    },
    [send],
  );

  const play = useCallback(
    async (card) => {
      if (!(await send('play', { card }))) return;
      sfxPlay();

      // Remove the card locally as soon as the server accepts it.
      // `refresh` re-syncs if this ever drifts.
      setMyCards((prev) => {
        const mine = prev[seat];
        if (!mine) return prev;
        const next = { ...prev, [seat]: mine.filter((c) => !cardsEqual(c, card)) };
        cardsRef.current = next;
        return next;
      });
    },
    [send, seat],
  );

  const deal = useCallback(() => send('next_round'), [send]);

  /**
   * Ask the server to play the bot whose turn it is. The server picks the move;
   * the client only sets the pace, so bot cards land one at a time.
   *
   * Every seated client runs this so the table keeps going if the host leaves.
   * The first human seat goes first and the rest wait a little longer. If two
   * requests race, the version check in `persist` drops the second.
   */
  useEffect(() => {
    if (!game || seat === -1) return;
    if (resolvingTrick || pending) return;
    if (phase !== PHASE.BIDDING && phase !== PHASE.PLAYING) return;

    const current = game.state.currentSeat;
    if (current === null || current === seat) return;

    const isBot = String(game.seats[current] ?? '').startsWith('bot:');
    const amFirstHuman =
      game.seats.findIndex((id) => !String(id).startsWith('bot:')) === seat;

    // For a bot, wait a moment so it looks like it's thinking. For a quiet
    // human, wait out the 15s grace period and then ask. The server checks
    // `last_seen` itself and refuses if the player is still connected, so a
    // client can't take over someone's seat early.
    const base = isBot ? TIMING.botThink : ABSENCE_PROBE_MS;
    const delay = base + (amFirstHuman ? 0 : 2500);

    const timer = setTimeout(() => {
      supabase.functions.invoke('game', { body: { action: 'bot_step', roomId } });
    }, delay);

    return () => clearTimeout(timer);
  }, [game, seat, phase, resolvingTrick, pending, roomId]);

  /* --------------------------------------------------------------- theatre */

  // Hold a completed trick on the table, then sweep it. Same timing as
  // useLocalGame, and a layout effect for the same reason.
  useLayoutEffect(() => {
    if (!lastTrick) return;
    if (shownTrick.current === trickIndex) return;

    shownTrick.current = trickIndex;
    setResolvingTrick({ id: trickIndex, sweeping: false, ...lastTrick });

    const toSweep = later(() => {
      sfxTrick();
      setResolvingTrick((t) => (t ? { ...t, sweeping: true } : t));
    }, TIMING.trickSweep);
    const toClear = later(() => setResolvingTrick(null), TIMING.trickHold);

    return () => {
      clearTimeout(toSweep);
      clearTimeout(toClear);
    };
  }, [lastTrick, trickIndex, later]);

  // A new round arrived: play the deal.
  useEffect(() => {
    if (roundIndex < 0 || roundIndex === dealtRound.current) return;
    dealtRound.current = roundIndex;
    shownTrick.current = -1;
    setResolvingTrick(null);
    for (let i = 0; i < handSize * playerCount; i++) later(sfxDeal, i * TIMING.dealCard);
  }, [roundIndex, handSize, playerCount, later]);

  useEffect(() => {
    if (!phase) return;
    const key = `${phase}:${roundIndex}`;
    if (announced.current === key) return;
    announced.current = key;
    if (phase === PHASE.FINISHED) sfxGameEnd();
    else if (phase === PHASE.ROUND_END && roundIndex >= 0) sfxRoundEnd();
  }, [phase, roundIndex]);

  /* ------------------------------------------------------------- derived UI */

  // Not gated on `pending`, so the hand stays clickable while a request is in
  // flight. The guard in `send` prevents double submissions.
  const myTurn = Boolean(view) && view.currentSeat === seat && !resolvingTrick;
  const myHand = view?.hands?.[seat]?.cards ?? null;

  const bidsSoFar =
    view && view.phase === PHASE.BIDDING
      ? orderedBids(view)
      : [];
  const placed = view ? view.bids.filter((b) => b !== null).length : 0;

  return {
    loading,
    exists: Boolean(game),
    seat,
    /** user ids indexed by engine seat, so callers can map seats to profiles */
    seatsOrder: game?.seats ?? null,
    view,
    message,
    resolvingTrick,
    dealKey: roundIndex,
    yourTurn: myTurn,
    isBidding: phase === PHASE.BIDDING,
    isPlaying: phase === PHASE.PLAYING,
    // The last trick and the round's scoring happen in one engine step. Wait
    // for the trick animation to finish before showing the scoreboard.
    isRoundOver: phase === PHASE.ROUND_END && !resolvingTrick,
    isFinished: phase === PHASE.FINISHED && !resolvingTrick,

    // Only used to enable buttons and highlight cards. The server checks
    // every move again.
    legalBids:
      myTurn && phase === PHASE.BIDDING
        ? legalBids({
            handSize: view.handSize,
            bidsSoFar,
            isLastBidder: placed === view.playerCount - 1,
          })
        : [],
    forbidden:
      view && phase === PHASE.BIDDING && placed === view.playerCount - 1 && view.currentSeat === seat
        ? forbiddenBid({ handSize: view.handSize, bidsSoFar })
        : null,
    legalCards:
      myTurn && phase === PHASE.PLAYING && myHand
        ? legalPlays({
            hand: myHand,
            leadSuit: view.trick.leadSuit,
            trumpSuit: view.trumpSuit,
          })
        : [],

    deal,
    bid,
    play,
    refresh,
  };
}

/** Bids already placed this round, in bidding order. */
function orderedBids(view) {
  const out = [];
  for (let i = 0; i < view.playerCount; i++) {
    const s = (view.firstBidderSeat + i) % view.playerCount;
    if (view.bids[s] !== null) out.push(view.bids[s]);
  }
  return out;
}
