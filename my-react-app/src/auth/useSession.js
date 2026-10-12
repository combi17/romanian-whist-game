import { useContext } from 'react';
import { SessionContext } from './SessionContext.js';

/**
 * The signed-in user, their profile, and signOut. In its own file so
 * SessionProvider.jsx only exports a component, which Fast Refresh needs.
 */
export function useSession() {
  return useContext(SessionContext);
}
