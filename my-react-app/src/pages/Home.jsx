import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import supabase from '../supabaseClient.js';
import { useSession } from '../auth/useSession';
import './Home.css';

/** The landing page. Uses the table's felt, brass and type so it looks like the game. */
function Home() {
  const { user, profile, loading } = useSession();
  const navigate = useNavigate();

  const [signInOpen, setSignInOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  /** Skip the sign-in prompt if there's already a session. */
  const handlePlay = () => {
    if (user) navigate('/menu');
    else setSignInOpen(true);
  };

  const handleGoogle = async (credentialResponse) => {
    setError(null);
    const { data, error: authError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: credentialResponse.credential,
    });

    if (authError) {
      setError('Google sign-in did not go through. Try again?');
      return;
    }

    setSignInOpen(false);
    setNotice(`Welcome, ${data.user.user_metadata?.full_name ?? 'player'}`);
    navigate('/menu');
  };

  return (
    <div className="home">
      <div className="home__felt" aria-hidden="true" />
      <div className="home__vignette" aria-hidden="true" />

      <main className="home__inner">
        <p className="home__eyebrow">Whist Românesc</p>
        <h1 className="home__title">Whist Arena</h1>
        <p className="home__lede">
          The card game you already argue about, with the scoring done for you. Three to six
          friends, one room code.
        </p>

        <div className="home__actions">
          <button type="button" className="home__play" onClick={handlePlay} disabled={loading}>
            Play
          </button>
          <Link to="/rules" className="home__rules">
            How to play
          </Link>
        </div>

        {user && (
          <p className="home__signed-in">
            Signed in as <strong>{profile?.username ?? 'you'}</strong>
          </p>
        )}
      </main>

      <footer className="home__footer">
        <Link to="/rules">Rules</Link>
        <span aria-hidden="true">·</span>
        <Link to="/demo">Practice vs bots</Link>
      </footer>

      {signInOpen && (
        <SignInDialog
          onClose={() => setSignInOpen(false)}
          onGoogle={handleGoogle}
          error={error}
          onGoogleError={() => setError('Google sign-in failed. Try again?')}
        />
      )}

      {notice && <Toast text={notice} onDone={() => setNotice(null)} />}
    </div>
  );
}

/** Sign-in panel. */
function SignInDialog({ onClose, onGoogle, onGoogleError, error }) {
  // Escape closes it.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="signin" role="dialog" aria-modal="true" aria-label="Sign in">
      <button type="button" className="signin__scrim" onClick={onClose} aria-label="Close" />

      <div className="signin__panel">
        <span className="signin__eyebrow">One account, any table</span>
        <h2 className="signin__title">Sign in to play</h2>
        <p className="signin__body">
          You need an account so your seat and your score follow you between rounds.
        </p>

        <div className="signin__options">
          <GoogleLogin
            onSuccess={onGoogle}
            onError={onGoogleError}
            text="continue_with"
            theme="filled_black"
            size="large"
            shape="pill"
            width="280"
          />

          <div className="signin__divider">
            <span>or</span>
          </div>

          <Link to="/login" className="signin__email">
            Continue with email
          </Link>
        </div>

        {error && <p className="signin__error">{error}</p>}

        <p className="signin__terms">
          By signing up you accept our <Link to="/rules">house rules</Link>.
        </p>
      </div>
    </div>
  );
}

/** A short-lived notice. */
function Toast({ text, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="home-toast" role="status">
      {text}
    </div>
  );
}

export default Home;
