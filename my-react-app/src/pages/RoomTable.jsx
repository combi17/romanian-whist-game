import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import supabase from '../supabaseClient';
import { useSession } from '../auth/useSession';
import GameTable from '../components/game/GameTable.jsx';
import { useSharedGame } from '../components/game/useSharedGame.js';
import { usePresence } from '../components/game/usePresence.js';
import Spinner from '../components/Spinner';
import './Room.css';

/**
 * An online game. The `game` Edge Function deals and stores the cards; the
 * public state is readable by the table and each hand only by its owner. This
 * component loads who sits where and leaves the rest to useSharedGame.
 */
function RoomTable() {
  const { roomId } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();

  const [seated, setSeated] = useState([]);
  const [loadingSeats, setLoadingSeats] = useState(true);

  const game = useSharedGame({ roomId, userId: user?.id });

  // Heartbeat. If it stops, a bot takes the seat.
  usePresence(roomId, Boolean(user));

  useEffect(() => {
    let active = true;

    supabase
      .from('room_players')
      .select('id, user_id, username, avatar_url, seat_number, is_bot')
      .eq('room_id', roomId)
      .order('seat_number', { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setSeated(data ?? []);
        setLoadingSeats(false);
      });

    return () => {
      active = false;
    };
  }, [roomId]);

  /**
   * Players indexed by engine seat. The server compacts the seating when the
   * game starts (`games.seats`), so map that back onto the profiles.
   */
  const players = useMemo(() => {
    // People are keyed by auth id and bots by `bot:<room_players.id>`, since
    // bots have no auth.users row.
    const byId = new Map(
      seated.map((p) => [p.is_bot ? `bot:${p.id}` : p.user_id, p]),
    );

    const order = game.seatsOrder ?? seated.map((p) => (p.is_bot ? `bot:${p.id}` : p.user_id));

    return order.map((id) => {
      const p = byId.get(id);
      return {
        name: id === user?.id ? 'You' : (p?.username ?? 'Player'),
        avatarUrl: p?.avatar_url,
        isBot: Boolean(p?.is_bot),
      };
    });
  }, [seated, game.seatsOrder, user?.id]);

  /**
   * Leave to the menu. Going back to `/room/:id` would bounce straight into
   * the game, since the room is 'playing'.
   *
   * The seat is kept. Once the heartbeat stops a bot covers it after 15
   * seconds, and opening the room link again takes it back mid-round.
   */
  const leave = useCallback(() => {
    navigate('/menu');
  }, [navigate]);

  if (loadingSeats || game.loading) {
    return (
      <div className="route-loading">
        <Spinner />
      </div>
    );
  }

  if (!game.exists) {
    return (
      <div className="room-error">
        <h1>No game running</h1>
        <p>The host hasn’t started this table yet.</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => navigate(`/room/${roomId}`)}
        >
          Back to the lobby
        </button>
      </div>
    );
  }

  if (game.seat === -1) {
    return (
      <div className="room-error">
        <h1>You’re not in this game</h1>
        <p>This game started without you. You can watch the lobby for the next one.</p>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/menu')}>
          Back to menu
        </button>
      </div>
    );
  }

  return <GameTable game={game} players={players} onLeave={leave} />;
}

export default RoomTable;
