import React from 'react';

/**
 * A player's plate: avatar, name, score and contract tracker. Bids must be
 * hit exactly, so the tracker shows one pip per trick bid:
 *
 *   ○○○     bid 3, won 0   still owed
 *   ●●○     bid 3, won 2   one to go
 *   ●●●     bid 3, won 3   on contract, gold outline
 *   ●●●✕    bid 3, won 4   overshot, plate turns red
 *   ⊘       bid 0, won 0   bid nothing, nothing taken
 */
function PlayerPlate({
  name,
  avatarUrl,
  seatLabel,
  bid,
  tricksWon,
  total,
  isActive = false,
  isYou = false,
  isDealer = false,
  isBot = false,
  isLastBidder = false,
  className = '',
  style,
}) {
  const hasBid = bid !== null && bid !== undefined;
  const overshot = hasBid && tricksWon > bid;
  const onContract = hasBid && tricksWon === bid;

  const classes = [
    'plate',
    isActive ? 'is-active' : '',
    isYou ? 'is-you' : '',
    onContract ? 'is-on-contract' : '',
    overshot ? 'is-overshot' : '',
    isLastBidder ? 'is-last-bidder' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={style}>
      <div className="plate__avatar-wrap">
        <img className="plate__avatar" src={avatarUrl} alt="" />
        {isDealer && (
          <span className="plate__first-bidder" title="Bids first this round">
            1st
          </span>
        )}
      </div>

      <div className="plate__body">
        <div className="plate__header">
          <span className="plate__name">{name}</span>
          {isBot && <span className="plate__tag">bot</span>}
          {isYou && <span className="plate__tag plate__tag--you">you</span>}
        </div>

        <div className="plate__contract">
          {hasBid ? (
            <>
              {/* The number they promised, said plainly. The pips carry how
                  many they have actually taken, so "1/3" — two numbers with no
                  labels — was doing two jobs and reading as neither. */}
              <span className="plate__bid">
                bid <strong>{bid}</strong>
              </span>
              <ContractPips bid={bid} tricksWon={tricksWon} />
            </>
          ) : (
            <span className="plate__waiting">{seatLabel ?? 'thinking…'}</span>
          )}
        </div>

        {isLastBidder && !hasBid && (
          <span className="plate__last-warning">
            Last bidder — you may be forced onto a number
          </span>
        )}
      </div>

      <div className="plate__score" title="Total score">
        {total > 0 ? `+${total}` : total}
      </div>
    </div>
  );
}

function ContractPips({ bid, tricksWon }) {
  if (bid === 0) {
    return (
      <span className="pips pips--nil" aria-label={`Bid nil, won ${tricksWon}`}>
        <span className={`pip pip--nil ${tricksWon > 0 ? 'is-broken' : ''}`}>0</span>
        {tricksWon > 0 && <span className="pip pip--over">{tricksWon}</span>}
      </span>
    );
  }

  const promised = Array.from({ length: bid }, (_, i) => i < tricksWon);
  const over = Math.max(0, tricksWon - bid);

  return (
    <span className="pips" aria-label={`Won ${tricksWon} of ${bid} bid`}>
      {promised.map((filled, i) => (
        <span key={i} className={`pip ${filled ? 'is-filled' : ''}`} />
      ))}
      {over > 0 &&
        Array.from({ length: over }, (_, i) => <span key={`o${i}`} className="pip pip--over" />)}
    </span>
  );
}

export default React.memo(PlayerPlate);
