import React, { useEffect, useRef } from 'react';
import './SideRail.css';

/**
 * Side panel with the current standings and every round's bids and results.
 * The round history matters for play, since five hits or five misses in a row
 * are worth ±10.
 */
function SideRail({ view, players, me }) {
  return (
    <aside className="rail">
      <Standings view={view} players={players} me={me} />
      <BidHistory view={view} players={players} me={me} />
    </aside>
  );
}

function Standings({ view, players, me }) {
  const order = view.totals
    .map((total, seat) => ({ seat, total }))
    .sort((a, b) => b.total - a.total);

  return (
    <section className="panel">
      <h2 className="panel__title">Standings</h2>
      <ol className="standings-list">
        {order.map(({ seat, total }, rank) => (
          <li key={seat} className={`standings-list__row ${seat === me ? 'is-you' : ''}`}>
            <span className="standings-list__rank">{rank + 1}</span>
            <img className="standings-list__avatar" src={players[seat]?.avatarUrl} alt="" />
            <span className="standings-list__name">{players[seat]?.name ?? `Seat ${seat + 1}`}</span>
            {/* finishing on exactly zero wins, so zero is highlighted */}
            <span className={`standings-list__score ${total === 0 ? 'is-zero' : ''}`}>
              {total > 0 ? `+${total}` : total}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BidHistory({ view, players, me }) {
  const scroller = useRef(null);
  const rounds = view.history;

  // Keep the most recent round in view as the game moves on.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [rounds.length]);

  return (
    <section className="panel panel--history">
      <div className="panel__head">
        <h2 className="panel__title">Bids</h2>
        <span className="panel__hint">scroll for earlier rounds</span>
      </div>

      {rounds.length === 0 ? (
        <p className="panel__empty">Bids appear here once the first round is scored.</p>
      ) : (
        <div className="history">
          <div className="history__names">
            <span className="history__corner" aria-hidden="true" />
            {players.map((p, seat) => (
              <span
                key={seat}
                className={`history__name ${seat === me ? 'is-you' : ''}`}
                title={p.name}
              >
                {p.name}
              </span>
            ))}
          </div>

          <div className="history__scroller" ref={scroller}>
            <div className="history__grid" style={{ '--rounds': rounds.length }}>
              <div className="history__row history__row--head">
                {rounds.map((r) => (
                  <span key={r.roundIndex} className="history__round" title={`${r.handSize} cards`}>
                    {r.handSize}
                  </span>
                ))}
              </div>

              {players.map((_, seat) => (
                <div key={seat} className="history__row">
                  {rounds.map((r) => {
                    const cell = r.seats[seat];
                    return (
                      <span
                        key={r.roundIndex}
                        className={`history__cell ${cell.exact ? 'is-hit' : 'is-miss'}`}
                        title={`Round ${r.roundIndex + 1}: bid ${cell.bid}, won ${
                          cell.tricksWon
                        } (${cell.delta > 0 ? '+' : ''}${cell.delta})`}
                      >
                        {cell.bid}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </section>
  );
}

export default SideRail;
