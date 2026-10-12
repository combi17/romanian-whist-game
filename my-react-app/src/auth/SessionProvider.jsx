import React, { useEffect, useMemo, useState } from 'react';
import supabase from '../supabaseClient';
import { SessionContext } from './SessionContext.js';
import { displayName } from './displayName.js';

/**
 * Provides the signed-in user to the whole app. Subscribes to
 * onAuthStateChange, so sign-outs, token refreshes and expiries show up
 * everywhere at once.
 */

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  // The profile row is created by the on_auth_user_created trigger, so it
  // exists by the time anyone is signed in.
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }

    let active = true;
    supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('Could not load profile:', error.message);
          setProfile(null);
          return;
        }
        setProfile(data);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  // The header, lobby, plates and room_players rows all take the name from
  // here. See displayName.js.
  const named = useMemo(() => {
    if (!profile) return profile;
    const shown = displayName(profile.username, session?.user?.user_metadata);
    return shown === profile.username ? profile : { ...profile, username: shown };
  }, [profile, session]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile: named,
      loading,
      signOut: () => supabase.auth.signOut(),
    }),
    [session, named, loading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
