import React, { useState } from 'react';
import PlayerPlate from './PlayerPlate.jsx';
import { seatPosition, relativeSeat, useSeatRadius } from './seats.js';
import { MIN_PLAYERS, MAX_PLAYERS } from '../../game/deck.js';
import './GameTable.css';
import './Lobby.css';

/**
 * The room before the game starts. Uses the same felt, plates and seat layout
 * as the game table, so starting the game doesn't feel like a screen change.
 */
function Lobby({
  roomId,
  players,
  mySeat,
  isHost,
  blindOneCard,
  onToggleBlind,
  onStart,
  onLeave,
  onAddBot,
  onRemoveBot,
  busyBots,
  starting,
  error,
}) {
  /** Pulled in on a phone so the far-left and far-right plates stay onscreen. */
  const radius = useSeatRadius();

  const count = players.length;
  const enough = count >= MIN_PLAYERS;
  const seatCount = Math.max(count, MIN_PLAYERS);
  const botCount = players.filter((p) => p.is_bot).length;
  const roomForMore = count < MAX_PLAYERS;

  return (
    <div className="table-shell lobby-shell">
      <header className="topbar">
        <RoomCode roomId={roomId} />

        <div className="topbar__hand">
          <span className="topbar__eyebrow">Seated</span>
          <span className="topbar__hand-num">
            {count}
            <span className="topbar__round-of">/{MAX_PLAYERS}</span>
          </span>
        </div>

        {/* no args: onLeave takes an options object, and a click event
            passed in would cancel the redirect */}
        <button type="button" className="btn btn--ghost topbar__leave" onClick={() => onLeave()}>
          Leave<span className="topbar__long"> room</span>
        </button>
      </header>

      <div className="stage">
        <div className="felt">
          <div className="felt__grain" aria-hidden="true" />
          <div className="felt__shade" aria-hidden="true" />
          <div className="felt__ring" aria-hidden="true" />

          {players.map((p) => {
            const rel = mySeat === null ? p.seat_number - 1 : relativeSeat(p.seat_number, mySeat, seatCount);
            const pos = seatPosition(rel, seatCount, radius);
            return (
              <div
                key={p.user_id}
                className="seat"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <PlayerPlate
                  name={p.username ?? 'Player'}
                  avatarUrl={p.avatar_url}
                  isYou={p.seat_number === mySeat}
                  isBot={p.is_bot}
                  isDealer={p.is_host}
                  seatLabel={p.is_bot ? 'bot' : 'ready'}
                  bid={null}
                  tricksWon={0}
                  total={0}
                />
              </div>
            );
          })}

          {/* empty chairs, so the table reads as "waiting for people" */}
          {Array.from({ length: Math.max(0, MIN_PLAYERS - count) }, (_, i) => {
            const rel = count + i;
            const pos = seatPosition(rel, seatCount, radius);
            return (
              <div
                key={`empty-${i}`}
                className="seat"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <div className="empty-chair">Waiting…</div>
              </div>
            );
          })}

          <div className="lobby-centre">
            <span className="lobby-centre__count">{count}</span>
            <span className="lobby-centre__label">
              {enough ? 'ready to play' : `need ${MIN_PLAYERS - count} more`}
            </span>
          </div>
        </div>

        <div className="lobby-controls">
          {isHost ? (
            <>
              {/* Short of people? Fill the seats. A table of two plus three
                  bots plays exactly like a table of five. */}
              <div className="bot-controls">
                <span className="bot-controls__label">Bots</span>
                <div className="bot-controls__buttons">
                  <button
                    type="button"
                    className="bot-btn"
                    onClick={onRemoveBot}
                    disabled={botCount === 0 || busyBots}
                    aria-label="Remove a bot"
                  >
                    −
                  </button>
                  <span className="bot-controls__count">{botCount}</span>
                  <button
                    type="button"
                    className="bot-btn"
                    onClick={onAddBot}
                    disabled={!roomForMore || busyBots}
                    aria-label="Add a bot"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                type="button"
                className={`toggle ${blindOneCard ? 'is-on' : ''}`}
                onClick={onToggleBlind}
                aria-pressed={blindOneCard}
              >
                <span className="toggle__track">
                  <span className="toggle__knob" />
                </span>
                <span className="toggle__text">
                  <span className="toggle__name">Blind 1-card rounds</span>
                  <span className="toggle__desc">
                    Card held to your forehead — everyone sees it but you
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="btn btn--primary lobby-start"
                onClick={onStart}
                disabled={!enough || starting}
                title={enough ? undefined : `You need at least ${MIN_PLAYERS} players`}
              >
                {starting ? 'Starting…' : 'Start game'}
              </button>
            </>
          ) : (
            <p className="lobby-wait">
              {enough
                ? 'Everyone is seated. Waiting for the host to start.'
                : `Waiting for ${MIN_PLAYERS - count} more player${
                    MIN_PLAYERS - count === 1 ? '' : 's'
                  }.`}
            </p>
          )}

          {error && <p className="lobby-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function RoomCode({ roomId }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(roomId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked (insecure origin or denied permission); the code
      // is on screen anyway
      setCopied(false);
    }
  };

  return (
    <div className="room-code">
      <span className="topbar__eyebrow">Room code</span>
      <button type="button" className="room-code__value" onClick={copy} title="Copy room code">
        <span className="room-code__digits">{roomId}</span>
        <span className="room-code__copy">{copied ? 'copied' : 'copy'}</span>
      </button>
    </div>
  );
}

export default Lobby;
