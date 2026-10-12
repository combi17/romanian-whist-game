import { createContext } from 'react';

export const SessionContext = createContext({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});
