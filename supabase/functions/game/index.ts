// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import {
  createGame,
  startRound,
  placeBid,
  playCard,
  PHASE,
} from '../_shared/game/engine.js';
import { publicState } from '../_shared/game/views.js';
import { chooseBid, chooseCard } from '../_shared/game/policy.js';
import { legalBidsFor } from '../_shared/game/engine.js';

/**
 * A seat's id in `games.seats`. People use their auth uid so RLS can compare
 * it to `auth.uid()`. Bots get `bot:<room_players.id>`, which never matches a
 * user, so no client can read a bot's hand.
 */
const botSeatId = (roomPlayerId: number | string) => `bot:${roomPlayerId}`;
const isBotSeat = (id: string) => typeof id === 'string' && id.startsWith('bot:');

const BOT_NAMES = ['Miruna', 'Andrei', 'Ioana', 'Tudor', 'Elena'];

/**
 * How long a seat waits for its player before a bot covers it. Long enough to
 * ride out a dropped connection; the player gets the seat back on return.
 */
const ABSENCE_GRACE_MS = 15_000;

/**
 * The game server. The shuffle, move validation, trick resolution and scoring
 * all happen here. Clients send moves ("bid 3", "play ♠9") and read back only
 * what RLS lets them see.
 *
 * It runs with the service role and bypasses RLS, so the caller's identity is
 * always taken from their JWT, never from the request body.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('Use POST.', 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Identity comes from the caller's token, never from the payload.
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return fail('Not signed in.', 401);

  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) return fail('Not signed in.', 401);
  const userId = auth.user.id;

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return fail('Malformed request.');
  }

  const { action, roomId } = payload ?? {};
  if (!action || !roomId) return fail('action and roomId are required.');

  try {
    switch (action) {
      case 'start':
        return await handleStart(admin, userId, roomId, payload);
      case 'bid':
        return await handleMove(admin, userId, roomId, (state, seat) =>
          placeBid(state, seat, payload.bid),
        );
      case 'play':
        return await handleMove(admin, userId, roomId, (state, seat) =>
          playCard(state, seat, payload.card),
        );
      case 'next_round':
        return await handleNextRound(admin, userId, roomId);
      case 'add_bot':
        return await handleAddBot(admin, userId, roomId);
      case 'remove_bot':
        return await handleRemoveBot(admin, userId, roomId, payload);
      case 'bot_step':
        return await handleBotStep(admin, userId, roomId);
      default:
        return fail(`Unknown action: ${action}`);
    }
  } catch (e) {
    console.error(action, e);
    return fail(e instanceof Error ? e.message : 'Something went wrong.', 500);
  }
});

async function handleStart(admin: any, userId: string, roomId: number, payload: any) {
  const { data: room } = await admin.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!room) return fail('No such room.', 404);
  if (room.created_by !== userId) return fail('Only the host can start the game.', 403);

  const { data: seated } = await admin
    .from('room_players')
    .select('id, user_id, seat_number, is_bot')
    .eq('room_id', roomId)
    .order('seat_number', { ascending: true });

  const players = seated ?? [];
  if (players.length < 3 || players.length > 6) {
    return fail('A game needs between 3 and 6 players.');
  }

  // Compact the seating into engine seats 0..n-1, in seat_number order.
  const seats = players.map((p: any) => (p.is_bot ? botSeatId(p.id) : p.user_id));

  if (!seats.some((id: string) => !isBotSeat(id))) {
    return fail('A table needs at least one person at it.');
  }

  let state = createGame({
    playerCount: seats.length,
    blindOneCard: Boolean(room.blind_one_card),
  });

  const dealt = startRound(state, Math.random);
  if (!dealt.ok) return fail(dealt.error);
  state = dealt.state;

  // Replace any previous game in this room.
  await admin.from('games').delete().eq('room_id', roomId);

  const { data: game, error: insertError } = await admin
    .from('games')
    .insert({ room_id: roomId, seats, state: publicState(state), version: 1 })
    .select('id')
    .single();

  if (insertError) return fail(insertError.message, 500);

  await writeHands(admin, game.id, state);
  await admin.from('rooms').update({ status: 'playing' }).eq('id', roomId);

  return json({ ok: true, gameId: game.id });
}

async function handleMove(
  admin: any,
  userId: string,
  roomId: number,
  apply: (state: any, seat: number) => any,
) {
  const loaded = await loadGame(admin, roomId);
  if ('error' in loaded) return fail(loaded.error, loaded.status);

  const { game, state } = loaded;
  const seat = game.seats.indexOf(userId);
  if (seat === -1) return fail('You are not seated at this table.', 403);

  const result = apply(state, seat);
  if (!result.ok) return fail(result.error);

  return await persist(admin, game, result.state);
}

async function handleNextRound(admin: any, userId: string, roomId: number) {
  const loaded = await loadGame(admin, roomId);
  if ('error' in loaded) return fail(loaded.error, loaded.status);

  const { game, state } = loaded;
  if (game.seats.indexOf(userId) === -1) return fail('You are not seated at this table.', 403);

  // Anyone seated can deal the next round, so the host can't stall the game.
  // Only valid from round_end, so two players pressing at once is harmless.
  if (state.phase !== PHASE.ROUND_END) return json({ ok: true, ignored: true });

  const result = startRound(state, Math.random);
  if (!result.ok) return fail(result.error);

  return await persist(admin, game, result.state);
}

async function handleAddBot(admin: any, userId: string, roomId: number) {
  const { data: room } = await admin.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!room) return fail('No such room.', 404);
  if (room.created_by !== userId) return fail('Only the host can add bots.', 403);
  if (room.status !== 'lobby') return fail('The game has already started.');

  const { data: seated } = await admin
    .from('room_players')
    .select('id, seat_number, username, is_bot')
    .eq('room_id', roomId);

  const players = seated ?? [];
  if (players.length >= 6) return fail('The table is full.');

  const takenSeats = new Set(players.map((p: any) => p.seat_number));
  const seat = [1, 2, 3, 4, 5, 6].find((n) => !takenSeats.has(n));
  if (!seat) return fail('The table is full.');

  const usedNames = new Set(players.map((p: any) => p.username));
  const name = BOT_NAMES.find((n) => !usedNames.has(n)) ?? `Bot ${seat}`;

  const { error } = await admin.from('room_players').insert({
    room_id: roomId,
    user_id: null,
    is_bot: true,
    seat_number: seat,
    username: name,
    avatar_url: `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}`,
  });

  if (error) return fail(error.message, 500);
  return json({ ok: true, seat, name });
}

async function handleRemoveBot(admin: any, userId: string, roomId: number, payload: any) {
  const { data: room } = await admin.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!room) return fail('No such room.', 404);
  if (room.created_by !== userId) return fail('Only the host can remove bots.', 403);
  if (room.status !== 'lobby') return fail('The game has already started.');

  const query = admin.from('room_players').delete().eq('room_id', roomId).eq('is_bot', true);
  // Remove a specific bot if asked, otherwise the one in the highest seat.
  if (payload.seatNumber) {
    await query.eq('seat_number', payload.seatNumber);
  } else {
    const { data: bots } = await admin
      .from('room_players')
      .select('seat_number')
      .eq('room_id', roomId)
      .eq('is_bot', true)
      .order('seat_number', { ascending: false })
      .limit(1);

    if (!bots || bots.length === 0) return fail('There are no bots to remove.');
    await query.eq('seat_number', bots[0].seat_number);
  }

  return json({ ok: true });
}

/**
 * Play one bot turn. The server picks the move and the client decides when to
 * ask, so bot cards land one at a time. The caller must be seated and the
 * current seat must be a bot or an absent player; extra calls are ignored.
 */
async function handleBotStep(admin: any, userId: string, roomId: number) {
  const loaded = await loadGame(admin, roomId);
  if ('error' in loaded) return fail(loaded.error, loaded.status);

  const { game, state } = loaded;
  if (game.seats.indexOf(userId) === -1) return fail('You are not seated at this table.', 403);

  const seat = state.currentSeat;
  if (seat === null) return json({ ok: true, ignored: true });

  const covered = await seatIsCovered(admin, game, seat);
  if (!covered) return json({ ok: true, ignored: true });

  let result;
  if (state.phase === PHASE.BIDDING) {
    const value = chooseBid({
      hand: state.hands[seat],
      trumpSuit: state.trumpSuit,
      legal: legalBidsFor(state, seat),
    });
    result = placeBid(state, seat, value);
  } else if (state.phase === PHASE.PLAYING) {
    const card = chooseCard({
      hand: state.hands[seat],
      trick: state.trick,
      trumpSuit: state.trumpSuit,
      bid: state.bids[seat],
      tricksWon: state.tricksWon[seat],
    });
    result = playCard(state, seat, card);
  } else {
    return json({ ok: true, ignored: true });
  }

  if (!result.ok) return fail(result.error, 500);
  return await persist(admin, game, result.state);
}

/**
 * Whether a bot should play this seat: it's a bot, or its player has been
 * silent longer than the grace period. Checked here so a client can't declare
 * another player absent.
 */
async function seatIsCovered(admin: any, game: any, seat: number) {
  const occupant = game.seats[seat];
  if (isBotSeat(occupant)) return true;

  const { data: player } = await admin
    .from('room_players')
    .select('last_seen')
    .eq('room_id', game.room_id)
    .eq('user_id', occupant)
    .maybeSingle();

  // No row means they left the room, so cover the seat.
  if (!player) return true;

  const idleMs = Date.now() - new Date(player.last_seen).getTime();
  return idleMs > ABSENCE_GRACE_MS;
}

/** Load the game and rebuild the full engine state, hands included. */
async function loadGame(admin: any, roomId: number) {
  const { data: game } = await admin
    .from('games')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();

  if (!game) return { error: 'That game has not started.', status: 404 };

  const { data: handRows } = await admin
    .from('hands')
    .select('seat, cards')
    .eq('game_id', game.id)
    .eq('round_index', game.state.roundIndex);

  const hands = Array.from({ length: game.seats.length }, () => [] as any[]);
  for (const row of handRows ?? []) hands[row.seat] = row.cards;

  const { handCounts: _drop, ...rest } = game.state;
  return { game, state: { ...rest, hands } };
}

async function persist(admin: any, game: any, state: any) {
  // Optimistic concurrency: if two moves race, the second write is dropped
  // and that client picks up the result over Realtime.
  const { data: updated, error } = await admin
    .from('games')
    .update({
      state: publicState(state),
      version: game.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', game.id)
    .eq('version', game.version)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!updated) return json({ ok: true, stale: true });

  await writeHands(admin, game.id, state);
  return json({ ok: true });
}

/** Hands for the current round, one row per seat. */
async function writeHands(admin: any, gameId: string, state: any) {
  const rows = state.hands.map((cards: any[], seat: number) => ({
    game_id: gameId,
    round_index: state.roundIndex,
    seat,
    cards,
  }));
  await admin.from('hands').upsert(rows, { onConflict: 'game_id,round_index,seat' });
}
