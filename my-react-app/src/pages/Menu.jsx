import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import supabase from '../supabaseClient';
import { useSession } from '../auth/useSession';
import Header from '../components/Header';
import { MAX_PLAYERS, MIN_PLAYERS } from '../game/deck.js';
import '../Menu.css';

/**
 * Where you go after signing in: start a table, or join one with a code.
 */
function Menu() {
  const { user, profile } = useSession();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(null); // 'create' | 'join' | null
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  const createRoom = async () => {
    if (!user) return;
    setBusy('create');
    setError(null);

    try {
      const roomId = await claimRoomCode();

      const { error: roomError } = await supabase.from('rooms').insert({
        id: roomId,
        created_by: user.id,
        status: 'lobby',
        is_active: true,
      });
      if (roomError) throw new Error(roomError.message);

      const { error: seatError } = await supabase.from('room_players').insert({
        room_id: roomId,
        user_id: user.id,
        seat_number: 1,
        username: profile?.username ?? 'Player',
        avatar_url: profile?.avatar_url ?? null,
      });
      if (seatError) throw new Error(seatError.message);

      navigate(`/room/${roomId}`);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  const joinRoom = async (event) => {
    event.preventDefault();
    if (!user) return;

    const roomId = code.trim();
    if (!/^\d{6}$/.test(roomId)) {
      setError('A room code is six digits.');
      return;
    }

    setBusy('join');
    setError(null);

    try {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (roomError) throw new Error(roomError.message);
      if (!room) throw new Error('No room with that code. Check the digits and try again.');
      if (room.status === 'playing') throw new Error('That game has already started.');
      if (room.status === 'finished') throw new Error('That game is over.');

      const { data: seatRows, error: seatsError } = await supabase
        .from('room_players')
        .select('user_id, seat_number')
        .eq('room_id', roomId);
      if (seatsError) throw new Error(seatsError.message);

      // Already in this room? Just walk back in.
      if (seatRows.some((p) => p.user_id === user.id)) {
        navigate(`/room/${roomId}`);
        return;
      }

      const taken = new Set(seatRows.map((p) => p.seat_number));
      const seat = [1, 2, 3, 4, 5, 6].find((n) => !taken.has(n));
      if (!seat) throw new Error(`That room is full (${MAX_PLAYERS} players).`);

      const { error: insertError } = await supabase.from('room_players').insert({
        room_id: roomId,
        user_id: user.id,
        seat_number: seat,
        username: profile?.username ?? 'Player',
        avatar_url: profile?.avatar_url ?? null,
      });

      // Someone took the last seat between our read and our write.
      if (insertError) {
        throw new Error(
          insertError.code === '23505'
            ? 'Someone just took that seat. Try again.'
            : insertError.message,
        );
      }

      navigate(`/room/${roomId}`);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  return (
    <>
      <Header />
      <div className="menu">
        <div className="menu__inner">
          <span className="menu__eyebrow">
            {profile?.username ? `Welcome back, ${profile.username}` : 'Welcome back'}
          </span>
          <h1 className="menu__title">Take a table</h1>
          <p className="menu__lede">
            Romanian Whist for {MIN_PLAYERS}–{MAX_PLAYERS} players. Start a room and share the
            code, or type a friend’s code to sit down.
          </p>

          <div className="menu__cards">
            <section className="menu-card">
              <h2 className="menu-card__title">Start a room</h2>
              <p className="menu-card__body">
                You’ll get a six-digit code to send your friends. You choose the house rules and
                start the game when everyone is seated.
              </p>
              <button
                type="button"
                className="menu-card__action"
                onClick={createRoom}
                disabled={busy !== null}
              >
                {busy === 'create' ? 'Creating…' : 'Create room'}
              </button>
            </section>

            <section className="menu-card">
              <h2 className="menu-card__title">Join a room</h2>
              <p className="menu-card__body">Enter the code your host gave you.</p>
              <form className="menu-card__form" onSubmit={joinRoom}>
                <input
                  className="code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000000"
                  aria-label="Room code"
                />
                <button
                  type="submit"
                  className="menu-card__action menu-card__action--ghost"
                  disabled={busy !== null || code.length !== 6}
                >
                  {busy === 'join' ? 'Joining…' : 'Join'}
                </button>
              </form>
            </section>
          </div>

          {error && <p className="menu__error">{error}</p>}

          <Link className="menu__practice" to="/demo">
            Or play a practice game against bots →
          </Link>
        </div>
      </div>
    </>
  );
}

/** Find an unused six-digit code, giving up after a fixed number of tries. */
async function claimRoomCode(attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const candidate = Math.floor(100000 + Math.random() * 900000);
    const { data, error } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', candidate)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return candidate;
  }
  throw new Error('Could not find a free room code. Try again in a moment.');
}

export default Menu;
