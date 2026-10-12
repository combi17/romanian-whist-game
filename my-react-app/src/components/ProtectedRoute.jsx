import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../auth/useSession';
import Spinner from './Spinner';

/**
 * Redirects to sign-in when there's no session, and remembers the original
 * destination so a room link still works after signing in.
 */
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="route-loading">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
};

export default ProtectedRoute;
