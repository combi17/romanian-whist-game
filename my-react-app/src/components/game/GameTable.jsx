import React, { useEffect, useMemo, useState } from 'react';
import PlayingCard from './PlayingCard.jsx';
import PlayerPlate from './PlayerPlate.jsx';
import { TIMING } from './useLocalGame.js';
import { cardsEqual, sortHand } from '../../game/deck.js';
import { determineTrickWinner } from '../../game/rules.js';
import { isMuted, setMuted } from './sounds.js';
import { seatPosition, useCoarsePointer, useSeatRadius } from './seats.js';
import SideRail from './SideRail.jsx';
import './GameTable.css';

function GameTable({ game, players, onLeave }) {
  const {
    view,
    state,
    dealKey,
    message,
    resolvingTrick,
    yourTurn,
    isBidding,
    isPlaying,
    isRoundOver,
    isFinished,
    legalBids,
    forbidden,
    legalCards,
    deal,
    bid,
    play,
  } = game;

  const playerCount = view.playerCount;

  /**
   * This screen's seat. Always 0 locally; online it's whatever the server
   * assigned. Everything is drawn relative to it, so you're always at the bottom.
   */
  const me = view.seat ?? 0;

  /** How far out the seats sit. Smaller on a phone; see seats.js. */
  const radius = useSeatRadius();

  /** Everyone, ordered so that you are index 0 and the rest follow clockwise. */
  const seats = useMemo(
    () =>
      Array.from({ length: playerCount }, (_, rel) => {
        const seat = (me + rel) % playerCount;
        return {
          seat,
          rel,
          ...players[seat],
          ...seatPosition(rel, playerCount, radius),
        };
      }),
    [playerCount, players, me, radius],
  );

  /**
   * The seat that bids last this round and is bound by the last-bidder rule.
   * Marked from the deal onward, since knowing you bid last changes your bid.
   */
  const lastBidderSeat =
    (view.firstBidderSeat + playerCount - 1) % playerCount;

  return (
    <div className="table-shell">
      <TopBar view={view} onLeave={onLeave} />

      <SideRail view={view} players={players} me={me} />

      <div className="stage">
        <div className="felt">
          <div className="felt__grain" aria-hidden="true" />
          <div className="felt__shade" aria-hidden="true" />
          <div className="felt__ring" aria-hidden="true" />

          {/* the deck, shown during the deal and bidding */}
          <DeckStack visible={isBidding} />

          {/* trump sits in the middle, where the turned-up card would lie */}
          <TrumpMarker view={view} />

          {seats.slice(1).map((p) => (
            <OpponentSeat
              key={p.seat}
              player={p}
              view={view}
              dealKey={dealKey}
              isActive={view.currentSeat === p.seat && !resolvingTrick}
              isLastBidder={isBidding && p.seat === lastBidderSeat}
            />
          ))}

          <TrickArea
            view={view}
            resolvingTrick={resolvingTrick}
            playerCount={playerCount}
            me={me}
            radius={radius}
          />

          <RoundBanner view={view} dealKey={dealKey} />
        </div>

        <TurnIndicator
          view={view}
          players={players}
          me={me}
          isBidding={isBidding}
          isPlaying={isPlaying}
          resolving={Boolean(resolvingTrick)}
        />

        <YourDock
          view={view}
          state={state}
          me={me}
          player={seats[0]}
          dealKey={dealKey}
          yourTurn={yourTurn}
          isBidding={isBidding}
          isPlaying={isPlaying}
          isLastBidder={isBidding && me === lastBidderSeat}
          legalBids={legalBids}
          forbidden={forbidden}
          legalCards={legalCards}
          onBid={bid}
          onPlay={play}
        />
      </div>

      {message && <div className="toast toast--warn">{message}</div>}

      {isRoundOver && !isFinished && (
        <RoundScoreboard view={view} players={players} me={me} onNext={deal} />
      )}
      {isFinished && <GameOver view={view} players={players} me={me} onLeave={onLeave} />}
      {view.roundIndex < 0 && <StartCurtain onDeal={deal} />}
    </div>
  );
}

function TopBar({ view, onLeave }) {
  const roundLabel = view.roundIndex < 0 ? '—' : `${view.roundIndex + 1}`;

  return (
    <header className="topbar">
      <div className="topbar__round">
        <span className="topbar__eyebrow">Round</span>
        <span className="topbar__round-num">
          {roundLabel}
          <span className="topbar__round-of">/{view.roundCount}</span>
        </span>
      </div>

      <div className="topbar__hand">
        <span className="topbar__eyebrow">Cards</span>
        <span className="topbar__hand-num">{view.handSize || '—'}</span>
      </div>

      <SoundToggle />

      <button type="button" className="btn btn--ghost topbar__leave" onClick={onLeave}>
        Leave<span className="topbar__long"> table</span>
      </button>
    </header>
  );
}

function SoundToggle() {
  const [off, setOff] = useState(() => isMuted());

  return (
    <button
      type="button"
      className={`sound-toggle ${off ? 'is-off' : ''}`}
      onClick={() => {
        const next = !off;
        setMuted(next);
        setOff(next);
      }}
      aria-pressed={!off}
      title={off ? 'Turn sound on' : 'Turn sound off'}
    >
      <span className="sound-toggle__label">{off ? 'Sound off' : 'Sound on'}</span>
    </button>
  );
}

/** The trump card, at the centre of the felt. */
function TrumpMarker({ view }) {
  if (view.roundIndex < 0) return null;

  if (!view.trumpSuit) {
    return (
      <div className="trump-centre trump-centre--none">
        <span className="trump-centre__none">No trump</span>
      </div>
    );
  }

  return (
    <div className="trump-centre">
      <span className="trump-centre__label">Trump</span>
      <div className="trump-centre__card">
        <PlayingCard card={view.trumpCard} className="card--small" />
      </div>
    </div>
  );
}

/**
 * Whose turn it is, in words. The active plate shows it too, but at six seats
 * it can be at the far edge of the table.
 */
function TurnIndicator({ view, players, me, isBidding, isPlaying, resolving }) {
  if (resolving) {
    return <p className="turn turn--quiet">Collecting the trick…</p>;
  }
  if (view.currentSeat === null || (!isBidding && !isPlaying)) return null;

  const seat = view.currentSeat;
  const mine = seat === me;
  const who = mine ? 'Your' : `${players[seat]?.name ?? `Seat ${seat + 1}`}'s`;
  const verb = isBidding ? 'to bid' : 'to play';

  return (
    <p className={`turn ${mine ? 'is-you' : ''}`}>
      <span className="turn__who">{who} turn</span>
      <span className="turn__verb">{verb}</span>
    </p>
  );
}

function DeckStack({ visible }) {
  if (!visible) return null;
  return (
    <div className="deck" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="deck__card" style={{ '--i': i }} />
      ))}
    </div>
  );
}

function OpponentSeat({ player, view, dealKey, isActive, isLastBidder }) {
  const hand = view.hands[player.seat];
  const cards = hand.cards; // non-null only in a blind round
  const count = hand.count;

  return (
    <div
      className="seat"
      style={{
        left: `${player.x}%`,
        top: `${player.y}%`,
        '--sx': player.x,
        '--sy': player.y,
      }}
    >
      {/* face up only in a blind round; phones hide the face-down stacks */}
      <div className={`seat__hand ${cards ? 'seat__hand--visible' : ''}`} key={dealKey}>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="seat__card-slot"
            style={{ '--deal-index': i * view.playerCount + player.rel, '--i': i, '--n': count }}
          >
            <PlayingCard
              card={cards ? cards[i] : null}
              faceDown={!cards}
              className="card--small"
            />
          </span>
        ))}
      </div>

      <PlayerPlate
        name={player.name}
        avatarUrl={player.avatarUrl}
        isBot={player.isBot}
        isActive={isActive}
        isLastBidder={isLastBidder}
        isDealer={view.firstBidderSeat === player.seat}
        bid={view.bids[player.seat]}
        tricksWon={view.tricksWon[player.seat]}
        total={view.totals[player.seat]}
      />
    </div>
  );
}

function TrickArea({ view, resolvingTrick, playerCount, me, radius }) {
  const settled = Boolean(resolvingTrick);
  const played = settled ? resolvingTrick.played : view.trick.played;
  const leadSuit = settled ? resolvingTrick.leadSuit : view.trick.leadSuit;
  const winner = resolvingTrick?.winner;

  /**
   * Who is winning this trick so far. Every card on the table is public, so
   * this only saves the player the arithmetic.
   */
  const winningSeat = settled
    ? winner
    : determineTrickWinner({ played, leadSuit, trumpSuit: view.trumpSuit });

  return (
    <div className="trick">
      {played.map(({ seat, card }) => {
        const rel = (seat - me + playerCount) % playerCount;
        const from = seatPosition(rel, playerCount, radius);
        const toward =
          winner !== undefined
            ? seatPosition((winner - me + playerCount) % playerCount, playerCount, radius)
            : null;
        const isWinning = seat === winningSeat;

        return (
          <span
            key={`${seat}-${card.rank}${card.suit}`}
            // the trick sits still first, then sweeps, so the last card
            // can be read
            className={`trick__slot ${resolvingTrick?.sweeping ? 'is-sweeping' : ''} ${
              isWinning ? 'is-winning' : ''
            }`}
            style={{
              '--sx': from.x,
              '--sy': from.y,
              '--wx': toward ? toward.x : 50,
              '--wy': toward ? toward.y : 50,
              '--rel': rel,
              '--n': playerCount,
            }}
          >
            <PlayingCard card={card} />
            {isWinning && !resolvingTrick?.sweeping && (
              <span className="trick__winning">
                {settled ? 'Takes the trick' : 'Currently winning'}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function RoundBanner({ view, dealKey }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (view.roundIndex < 0) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), TIMING.roundBanner);
    return () => clearTimeout(t);
  }, [dealKey, view.roundIndex]);

  if (!shown || view.roundIndex < 0) return null;

  return (
    <div className="banner" key={dealKey}>
      <span className="banner__round">Round {view.roundIndex + 1}</span>
      <span className="banner__cards">
        {view.handSize} {view.handSize === 1 ? 'card' : 'cards'}
      </span>
      {view.isBlindRound && <span className="banner__blind">blind — you cannot see your own card</span>}
      {!view.trumpSuit && !view.isBlindRound && <span className="banner__blind">fără atu — no trump</span>}
    </div>
  );
}

function YourDock({
  view,
  me,
  player,
  dealKey,
  yourTurn,
  isBidding,
  isPlaying,
  isLastBidder,
  legalBids,
  forbidden,
  legalCards,
  onBid,
  onPlay,
}) {
  const hand = view.hands[me];
  const cards = hand.cards;
  const blind = view.isBlindRound;

  return (
    <div className="dock">
      <div className="dock__plate">
        <PlayerPlate
          name={player.name}
          avatarUrl={player.avatarUrl}
          isYou
          isActive={yourTurn}
          isDealer={view.firstBidderSeat === me}
          isLastBidder={isLastBidder}
          bid={view.bids[me]}
          tricksWon={view.tricksWon[me]}
          total={view.totals[me]}
        />
      </div>

      <div className="dock__hand">
        <Fan
          cards={cards}
          count={hand.count}
          blind={blind}
          dealKey={dealKey}
          playerCount={view.playerCount}
          legalCards={legalCards}
          canPlay={yourTurn && isPlaying}
          onPlay={onPlay}
        />
      </div>

      <div className="dock__action">
        {isBidding && yourTurn && (
          <BiddingPanel handSize={view.handSize} legal={legalBids} forbidden={forbidden} onBid={onBid} />
        )}
        {isBidding && !yourTurn && <WaitingNote>Waiting for bids…</WaitingNote>}
        {isPlaying && yourTurn && <WaitingNote accent>Your turn — play a card</WaitingNote>}
        {isPlaying && !yourTurn && <WaitingNote>Waiting…</WaitingNote>}
      </div>
    </div>
  );
}

function Fan({ cards, count, blind, dealKey, playerCount, legalCards, canPlay, onPlay }) {
  const n = count;
  // Grouped by suit, high to low. See sortHand.
  const ordered = useMemo(() => (cards ? sortHand(cards) : null), [cards]);
  const spread = Math.min(6 + n * 2.4, 34);

  /**
   * On touch screens the first tap lifts a card and the second plays it.
   * Cards in a fanned hand overlap, so a single tap could play the wrong one.
   */
  const coarse = useCoarsePointer();
  const [armed, setArmed] = useState(null);

  // Drop the selection when the turn changes.
  useEffect(() => {
    if (!canPlay) setArmed(null);
  }, [canPlay, dealKey]);

  return (
    <div className="fan" key={dealKey} style={{ '--n': n }}>
      {Array.from({ length: n }, (_, i) => {
        const card = ordered ? ordered[i] : null;
        const t = n === 1 ? 0.5 : i / (n - 1);
        const angle = -spread / 2 + t * spread;
        const lift = Math.abs(t - 0.5) * 2; // 0 in the middle, 1 at the edges

        // In a blind round this client never receives its own card, but it
        // still has to play it. The slot stays face down and plays the
        // legal card at its index.
        const subject = card ?? (blind ? legalCards[i] : null);
        const playable = Boolean(subject) && legalCards.some((c) => cardsEqual(c, subject));
        const key = card ? `${card.rank}${card.suit}` : i;
        const isArmed = armed === key;

        const commit = () => {
          if (coarse && !isArmed) {
            setArmed(key);
            return;
          }
          setArmed(null);
          onPlay(subject);
        };

        return (
          <span
            key={key}
            className="fan__slot"
            style={{
              '--deal-index': i * playerCount,
              '--angle': `${angle}deg`,
              '--lift': lift,
              '--i': i,
            }}
          >
            <PlayingCard
              card={card}
              faceDown={blind || !card}
              disabled={!playable || !canPlay}
              onClick={canPlay && playable ? commit : undefined}
              className={`${canPlay && !playable ? 'card--muted' : ''} ${
                isArmed ? 'is-armed' : ''
              }`}
            />
          </span>
        );
      })}
    </div>
  );
}

function BiddingPanel({ handSize, legal, forbidden, onBid }) {
  const options = Array.from({ length: handSize + 1 }, (_, i) => i);

  return (
    <div className="bidding">
      <span className="bidding__label">How many tricks will you take?</span>
      <div className="bidding__row">
        {options.map((n) => {
          const isForbidden = n === forbidden;
          const allowed = legal.includes(n);
          return (
            <button
              key={n}
              type="button"
              className={`bid-chip ${isForbidden ? 'is-forbidden' : ''}`}
              disabled={!allowed}
              onClick={() => onBid(n)}
              title={
                isForbidden
                  ? `Nu se poate — the bids would add up to exactly ${handSize}`
                  : `Bid ${n}`
              }
            >
              {n}
            </button>
          );
        })}
      </div>
      {forbidden !== null && forbidden !== undefined && (
        <span className="bidding__rule">
          You bid last, so {forbidden} is blocked — the bids can’t total {handSize}.
        </span>
      )}
    </div>
  );
}

function WaitingNote({ children, accent = false }) {
  return <div className={`waiting ${accent ? 'is-accent' : ''}`}>{children}</div>;
}

function StartCurtain({ onDeal }) {
  return (
    <div className="curtain">
      <div className="curtain__panel">
        <h2 className="curtain__title">Table ready</h2>
        <p className="curtain__body">Everyone is seated. Deal the first round when you’re ready.</p>
        <button type="button" className="btn btn--primary" onClick={onDeal}>
          Deal first round
        </button>
      </div>
    </div>
  );
}

function RoundScoreboard({ view, players, me, onNext }) {
  const round = view.history[view.history.length - 1];
  if (!round) return null;

  return (
    <div className="curtain">
      <div className="curtain__panel curtain__panel--wide">
        <h2 className="curtain__title">
          Round {round.roundIndex + 1}{' '}
          <span className="curtain__sub">
            · {round.handSize} {round.handSize === 1 ? 'card' : 'cards'}
          </span>
        </h2>

        <table className="score-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Bid</th>
              <th>Won</th>
              <th>Round</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {round.seats.map((s, seat) => (
              <tr key={seat} className={s.exact ? 'is-exact' : 'is-missed'}>
                <td>{seat === me ? 'You' : players[seat].name}</td>
                <td>{s.bid}</td>
                <td>{s.tricksWon}</td>
                <td className="score-table__delta">
                  {s.delta > 0 ? `+${s.delta}` : s.delta}
                  {s.bonus !== 0 && (
                    <span className="score-table__bonus">
                      {s.bonus > 0 ? '+10 streak' : '−10 streak'}
                    </span>
                  )}
                </td>
                <td className={`score-table__total ${s.total === 0 ? 'is-zero' : ''}`}>{s.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button type="button" className="btn btn--primary" onClick={onNext}>
          Deal next round
        </button>
      </div>
    </div>
  );
}

function GameOver({ view, players, me, onLeave }) {
  const wonOnZero = view.winReason === 'zero';
  const standings = view.totals
    .map((total, seat) => ({ seat, total, ...players[seat] }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="curtain">
      <div className="curtain__panel curtain__panel--wide">
        <span className="curtain__eyebrow">Final standings</span>
        <h2 className="curtain__title">
          {view.winners.map((s) => (s === me ? 'You' : players[s].name)).join(' & ')} won
        </h2>

        {wonOnZero && (
          <p className="curtain__zero">
            Finished on exactly zero — that beats every score on the table.
          </p>
        )}

        <ol className="standings">
          {standings.map((p) => (
            <li
              key={p.seat}
              className={`standings__row ${view.winners.includes(p.seat) ? 'is-winner' : ''}`}
            >
              <img className="standings__avatar" src={p.avatarUrl} alt="" />
              <span className="standings__name">{p.seat === me ? 'You' : p.name}</span>
              <span className={`standings__score ${p.total === 0 ? 'is-zero' : ''}`}>{p.total}</span>
            </li>
          ))}
        </ol>

        <button type="button" className="btn btn--primary" onClick={onLeave}>
          Back to the lobby
        </button>
      </div>
    </div>
  );
}

export default GameTable;
