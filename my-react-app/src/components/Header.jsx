import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../auth/useSession';
import './Header.css';

/**
 * Wordmark on the left, the signed-in user on the right. Used on signed-in
 * pages except the landing page and the game table, which has its own bar.
 */
function Header() {
  const { profile, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="app-header">
      <Link to="/menu" className="app-header__brand">
        Whist Arena
      </Link>

      <div className="app-header__user">
        <button
          type="button"
          className="app-header__avatar-btn"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          {profile?.avatar_url ? (
            <img className="app-header__avatar" src={profile.avatar_url} alt="" />
          ) : (
            <span className="app-header__avatar app-header__avatar--blank" />
          )}
          <span className="app-header__name">{profile?.username ?? 'Account'}</span>
        </button>

        {open && (
          <div className="app-header__menu" role="menu">
            <button type="button" role="menuitem" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
