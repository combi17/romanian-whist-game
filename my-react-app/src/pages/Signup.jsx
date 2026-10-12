import React from 'react';
import { useState } from 'react';
import supabase from '../supabaseClient.js';
import Swal from 'sweetalert2';
import { useNavigate } from 'react-router-dom';

const Signup = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const navigate = useNavigate();

    function getRandomInt(min, max) {
        const minCeiled = Math.ceil(min);
        const maxFloored = Math.floor(max);
        return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled);
    }
    const number = getRandomInt(1, 683);


    const handleSignup = async (e) => {
        e.preventDefault();

        if(password !== confirmPassword) {
            setErrorMsg("Passwords do not match!");
            return;
        }

        // An RPC because anon can't read profiles, which hold everyone's email.
        const { data: isAvailable, error: usernameCheckError } = await supabase
            .rpc('username_available', { candidate: username });

        if(usernameCheckError) {
            setErrorMsg(usernameCheckError.message);
            return;
        } else if(!isAvailable) {
            setErrorMsg(`Username already in use! Try: ${username + number} or 
                ${username[0].toUpperCase() + username.slice(1) + number%100 + 7}`);
            return;
        }

        const { data, error} = await supabase.auth.signUp({
            email,
            password,
            options : {
                data : {username},
            }
        });

        if (error) {
            setErrorMsg(error.message);
        } else {
                console.log("Signed up successfully!", data.user);
            
                Swal.fire({
                    position: "top",
                    title: 'Success!',
                    text: 'Account created successfully!',
                    icon: 'success',
                    confirmButtonText: 'Continue',
                    customClass: {
                        popup : 'swal-top-spacing',
                        confirmButton : 'my-confirm', //asta trebuie schimbata sa fie mai clean
                    }
                });
                
                navigate('/login');
            }
        }

  return (
    <>
    <div className="login-card-su">
        <form onSubmit={handleSignup} className="login-form-su">
            <h1>Sign Up</h1>
            <div className="input-wrapper-su">
                <input
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className="login-input-su"
                    type="email" required
                    placeholder="Email address*"
                />
            </div>

            <div className="input-wrapper-su">
                <input
                    value={username} onChange={(e) => setUsername(e.target.value)}
                    className="login-input-su"
                    type="text" required
                    placeholder="Username*"
                />
            </div>

            <div className="input-wrapper-su">
                <input
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="login-input-su"
                    type="password" required
                    placeholder="Password*"
                />
            </div>

            <div className="input-wrapper-su">
                <input
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className="login-input-su"
                    type="password" required
                    placeholder="Confirm password*"
                />
            </div>

            {errorMsg && <p className='error-msg'>{errorMsg}</p>}

            <button type="submit" className="login-btn-su">Create account</button>
        </form>

    </div>
    </>
  )
}

export default Signup