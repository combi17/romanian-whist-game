import React from 'react';

const RED_SUITS = new Set(['♥', '♦']);

/**
 * One card. The face is a corner rank and one large suit symbol instead of a
 * full pip layout, which stays readable at phone sizes.
 */
function PlayingCard({
  card,
  faceDown = false,
  disabled = false,
  selected = false,
  onClick,
  style,
  className = '',
  ...rest
}) {
  const red = card && RED_SUITS.has(card.suit);
  const interactive = Boolean(onClick) && !disabled;

  const classes = [
    'card',
    faceDown ? 'card--back' : 'card--face',
    red ? 'card--red' : 'card--black',
    disabled ? 'is-disabled' : '',
    selected ? 'is-selected' : '',
    interactive ? 'is-interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const label = faceDown || !card ? 'Face-down card' : `${card.rank} of ${suitName(card.suit)}`;

  const Element = interactive ? 'button' : 'div';

  return (
    <Element
      type={interactive ? 'button' : undefined}
      className={classes}
      style={style}
      onClick={interactive ? onClick : undefined}
      disabled={interactive ? undefined : undefined}
      aria-label={label}
      title={interactive ? label : undefined}
      {...rest}
    >
      {faceDown || !card ? (
        <span className="card__back-pattern" aria-hidden="true" />
      ) : (
        <>
          <span className="card__corner card__corner--tl">
            <span className="card__rank">{card.rank}</span>
            <span className="card__pip">{card.suit}</span>
          </span>
          <span className="card__center" aria-hidden="true">
            {card.suit}
          </span>
          <span className="card__corner card__corner--br">
            <span className="card__rank">{card.rank}</span>
            <span className="card__pip">{card.suit}</span>
          </span>
        </>
      )}
    </Element>
  );
}

function suitName(suit) {
  return { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }[suit] ?? suit;
}

// Memoised: a table can hold 50+ cards and every action re-renders the tree.
export default React.memo(PlayingCard);
