import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import supabase from '../supabaseClient';
import { useSession } from '../auth/useSession';
import Lobby from '../components/game/Lobby.jsx';
import { usePresence } from '../components/game/usePresence.js';
import Spinner from '../components/Spinner';
import { MAX_PLAYERS } from '../game/deck.js';
import './Room.css';

/**
 * The lobby for one room, addressed by its code. Queries and the realtime
 * channel are scoped to the room, and the code in the URL means a refresh
 * rejoins it.
 */
function Room() {
  const { roomId } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  const leaving = useRef(false);

  usePresence(roomId, Boolean(user));

  const load = useCallback(async () => {
    const [{ data: roomRow, error: roomError }, { data: playerRows, error: playersError }] =
      await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
        supabase
          .from('room_players')
          .select('*')
          .eq('room_id', roomId)
          .order('seat_number', { ascending: true }),
      ]);

    if (roomError || playersError) {
      setError((roomError ?? playersError).message);
      setLoading(false);
      return;
    }

    if (!roomRow) {
      setError('That room no longer exists.');
      setRoom(null);
      setLoading(false);
      return;
    }

    setRoom(roomRow);
    setPlayers(playerRows ?? []);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime, scoped to this room only.
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        load,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        load,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  const leave = useCallback(
    async ({ redirect = true } = {}) => {
      if (!user || leaving.current) return;
      leaving.current = true;

      await supabase.from('room_players').delete().match({ room_id: roomId, user_id: user.id });

      // If the host leaves the lobby, pass the room to the next person seated.
      const { data: remaining } = await supabase
        .from('room_players')
        .select('user_id, seat_number')
        .eq('room_id', roomId)
        .eq('is_bot', false)
        .order('seat_number', { ascending: true });

      if (!remaining || remaining.length === 0) {
        await supabase.from('rooms').update({ is_active: false }).eq('id', roomId);
      } else if (room?.created_by === user.id) {
        await supabase.from('rooms').update({ created_by: remaining[0].user_id }).eq('id', roomId);
      }

      leaving.current = false;
      if (redirect) navigate('/menu');
    },
    [user, roomId, room?.created_by, navigate],
  );

  // Best-effort: free the seat when the tab closes. An authenticated
  // PostgREST call can't go through sendBeacon, so this can miss.
  useEffect(() => {
    const onUnload = () => {
      if (!user) return;
      supabase.from('room_players').delete().match({ room_id: roomId, user_id: user.id });
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [user, roomId]);

  const mySeat = useMemo(() => {
    const me = players.find((p) => p.user_id === user?.id);
    return me ? me.seat_number : null;
  }, [players, user?.id]);

  const isHost = room?.created_by === user?.id;

  const decorated = useMemo(
    () => players.map((p) => ({ ...p, is_host: p.user_id === room?.created_by })),
    [players, room?.created_by],
  );

  const [busyBots, setBusyBots] = useState(false);

  /**
   * Bots are added and removed by the Edge Function, which checks that the
   * caller is the host. RLS doesn't let browsers insert bot rows.
   */
  const callBots = async (action, body = {}) => {
    setBusyBots(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('game', {
      body: { action, roomId, ...body },
    });
    setBusyBots(false);

    if (fnError) {
      let text = fnError.message;
      try {
        const parsed = await fnError.context?.json?.();
        if (parsed?.error) text = parsed.error;
      } catch {
        /* keep the generic message */
      }
      setError(text);
      return;
    }
    if (data?.error) setError(data.error);
    // the seat list arrives over realtime
  };

  const addBot = () => callBots('add_bot');
  const removeBot = () => callBots('remove_bot');

  const toggleBlind = async () => {
    if (!isHost || !room) return;
    const next = !room.blind_one_card;
    setRoom((r) => ({ ...r, blind_one_card: next }));
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ blind_one_card: next })
      .eq('id', roomId);
    if (updateError) {
      setError(updateError.message);
      setRoom((r) => ({ ...r, blind_one_card: !next }));
    }
  };

  /**
   * Ask the server to start the game. The `game` function deals, stores the
   * hands behind RLS and sets the room to 'playing', which moves everyone to
   * the table.
   */
  const start = async () => {
    if (!isHost) return;
    setStarting(true);
    setError(null);

    const { data, error: fnError } = await supabase.functions.invoke('game', {
      body: { action: 'start', roomId },
    });

    setStarting(false);

    if (fnError) {
      let text = fnError.message;
      try {
        const parsed = await fnError.context?.json?.();
        if (parsed?.error) text = parsed.error;
      } catch {
        /* fall back to the generic message */
      }
      setError(text);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }

    navigate(`/room/${roomId}/table`);
  };

  // Everyone follows the host into the game when the room flips to 'playing'.
  useEffect(() => {
    if (room?.status === 'playing') navigate(`/room/${roomId}/table`, { replace: true });
  }, [room?.status, roomId, navigate]);

  if (loading) {
    return (
      <div className="route-loading">
        <Spinner />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="room-error">
        <h1>Room not found</h1>
        <p>{error ?? 'That code does not match an open room.'}</p>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/menu')}>
          Back to menu
        </button>
      </div>
    );
  }

  if (mySeat === null) {
    return (
      <div className="room-error">
        <h1>You are not seated here</h1>
        <p>
          {room.status === 'playing'
            ? 'This game has already started, so you cannot join it now.'
            : `Room ${roomId} is open — join it from the menu with the code.`}
        </p>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/menu')}>
          Back to menu
        </button>
      </div>
    );
  }

  return (
    <Lobby
      roomId={roomId}
      players={decorated}
      mySeat={mySeat}
      isHost={isHost}
      blindOneCard={room.blind_one_card ?? false}
      onToggleBlind={toggleBlind}
      onStart={start}
      onLeave={leave}
      onAddBot={addBot}
      onRemoveBot={removeBot}
      busyBots={busyBots}
      starting={starting}
      error={error}
      maxPlayers={MAX_PLAYERS}
    />
  );
}

export default Room;
