import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameTable from '../components/game/GameTable.jsx';
import { useLocalGame } from '../components/game/useLocalGame.js';
import '../components/game/GameTable.css';
import './Demo.css';

/**
 * The practice table: a full game against bots, with no account and no
 * database. The engine runs in the browser.
 */

const BOT_NAMES = ['Miruna', 'Andrei', 'Ioana', 'Tudor', 'Elena'];

function Demo() {
  const [config, setConfig] = useState(null);

  if (!config) return <SetupScreen onStart={setConfig} />;
  return <DemoGame config={config} onLeave={() => setConfig(null)} />;
}

function DemoGame({ config, onLeave }) {
  const game = useLocalGame(config);

  const players = useMemo(
    () =>
      Array.from({ length: config.playerCount }, (_, seat) => ({
        name: seat === 0 ? 'You' : BOT_NAMES[seat - 1],
        avatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=${
          seat === 0 ? 'you' : BOT_NAMES[seat - 1]
        }`,
        isBot: seat !== 0,
      })),
    [config.playerCount],
  );

  return <GameTable game={game} players={players} onLeave={onLeave} />;
}

function SetupScreen({ onStart }) {
  const [playerCount, setPlayerCount] = useState(4);
  const [blindOneCard, setBlindOneCard] = useState(false);
  const navigate = useNavigate();

  const rounds = 3 * playerCount + 12;

  return (
    <div className="setup">
      <div className="setup__panel">
        <span className="setup__eyebrow">Practice table</span>
        <h1 className="setup__title">Whist Arena</h1>
        <p className="setup__lede">
          A full game against bots — no account, no connection. The rules here are the same
          ones the online table will enforce.
        </p>

        <div className="setup__field">
          <label className="setup__label" htmlFor="seats">
            Players
          </label>
          <div className="setup__seats" id="seats" role="group" aria-label="Number of players">
            {[3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                className={`seat-chip ${playerCount === n ? 'is-on' : ''}`}
                onClick={() => setPlayerCount(n)}
                aria-pressed={playerCount === n}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="setup__hint">
            {rounds} rounds · you and {playerCount - 1} bot{playerCount - 1 === 1 ? '' : 's'}
          </span>
        </div>

        <div className="setup__field">
          <button
            type="button"
            className={`toggle ${blindOneCard ? 'is-on' : ''}`}
            onClick={() => setBlindOneCard((v) => !v)}
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
        </div>

        <button
          type="button"
          className="setup__start"
          onClick={() => onStart({ playerCount, blindOneCard })}
        >
          Take a seat
        </button>

        <button type="button" className="setup__back" onClick={() => navigate('/')}>
          Back to home
        </button>
      </div>
    </div>
  );
}

export default Demo;
