/**
 * Seat positions for the lobby and the table, spaced on an ellipse so any
 * table size from 3 to 6 lines up. Relative seat 0 is always you, at the bottom.
 */

import { useEffect, useState } from 'react';

/**
 * How far out the seats sit, as a percentage of the felt. Plates are centred on
 * their seat, so half of each hangs outside the ring. On a narrow screen the
 * ring moves in to keep the side plates on screen.
 */
export const SEAT_RADIUS = {
  wide: { rx: 43, ry: 40 },
  narrow: { rx: 34, ry: 38 },
};

/** Breakpoint for the narrow ring. Matches GameTable.css. */
const NARROW_TABLE = '(max-width: 620px)';

export function seatPosition(relativeSeat, playerCount, radius = SEAT_RADIUS.wide) {
  const angle = ((90 + (relativeSeat * 360) / playerCount) * Math.PI) / 180;
  return {
    x: 50 + radius.rx * Math.cos(angle),
    y: 50 + radius.ry * Math.sin(angle),
  };
}

/** Turn an absolute seat number into a position relative to the viewer. */
export function relativeSeat(seat, viewerSeat, playerCount) {
  return (seat - viewerSeat + playerCount) % playerCount;
}

/**
 * The seat ring for the current width. The positions are inline styles that
 * the animations also use, so CSS media queries can't change them; this hook
 * watches the breakpoint instead.
 */
export function useSeatRadius() {
  const [narrow, setNarrow] = useState(() => matches(NARROW_TABLE));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(NARROW_TABLE);
    const onChange = (event) => setNarrow(event.matches);
    setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow ? SEAT_RADIUS.narrow : SEAT_RADIUS.wide;
}

/**
 * True when the pointer can't hover, i.e. touch. On touch, the first tap on a
 * card selects it and the second plays it.
 */
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => matches('(hover: none)'));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(hover: none)');
    const onChange = (event) => setCoarse(event.matches);
    setCoarse(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return coarse;
}

function matches(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}
