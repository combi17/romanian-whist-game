import { useEffect } from 'react';
import supabase from '../../supabaseClient';

/** Well inside the server's 15s grace period. */
export const HEARTBEAT_MS = 5000;

/**
 * Heartbeat for as long as this client is in the room. After 15 seconds of
 * silence a bot takes over the seat; when the heartbeat resumes, the player
 * gets it back.
 *
 * Browsers throttle timers in background tabs, so it also beats as soon as
 * the tab becomes visible again.
 */
export function usePresence(roomId, enabled = true) {
  useEffect(() => {
    if (!roomId || !enabled) return;

    let stopped = false;

    const beat = () => {
      if (stopped) return;
      supabase.rpc('heartbeat', { room: Number(roomId) });
    };

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [roomId, enabled]);
}
