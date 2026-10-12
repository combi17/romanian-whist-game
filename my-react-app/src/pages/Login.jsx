import React from 'react'
import { Link } from 'react-router-dom';
import { useState } from 'react';
import supabase from '../supabaseClient';
import { useLocation, useNavigate } from 'react-router-dom';

const Login = () => {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errormsg, setErrormsg] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // ProtectedRoute saves where you were going, so a room link brings you back
  // to that room after signing in.
  const from = location.state?.from ?? '/menu';

  const handleLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrormsg("");

    const {error} = await supabase.auth.signInWithPassword({
      email : email,
      password : password
    });

    setBusy(false);
    if(error) {
      setErrormsg(error.message);
    }
    else {
      navigate(from, { replace: true });
    }
  }

  return (
    <div className="login-card">
      <form className="login-form" onSubmit={handleLogin}> 
        <div className="input-wrapper">
          <h1>Login</h1>
          <input className="login-input"
                 type="email" 
                 placeholder="email address*" 
                 required value={email} onChange={(e)=>setEmail(e.target.value)}/>
        </div>
        <div className="input-wrapper">
          <input className="login-input" type="password" placeholder="password*" required
                 value={password} onChange={(e)=>setPassword(e.target.value)}/>
        </div>  
        <div className="forgot-password">
          <a href="#">Forgot Your Password?</a>
        </div>
      {errormsg && <p className="error-msg">{errormsg}</p>}
      <button className="login-btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>

      <div className="forgot-password">Don't have an account? 
        <Link to="/signup" className="link-register">Register now!</Link>
      </div>
    </form>

  </div>
  )
}

export default Login