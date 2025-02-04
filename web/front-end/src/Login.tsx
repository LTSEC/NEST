import React, { useState } from "react";
import './login.css';

const Login = () => {
    const [credentials, setCredentials] = useState({username: "", password: ""});
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setCredentials((prev) => ({ ...prev, [name]: value }));
    }



    // Sends the uesrname and password to backend to login
    const submitCredentials = (event: React.FormEvent) => {
        event.preventDefault();
        if (credentials.username != "" && credentials.password != "") {
            // throw credentials to backend
            setMessage("Submitted");
        }
        else {
            // throw error
        }
    }

    return (
    <>
    <div className="container">
        <h1>Welcome to NEST</h1>
        <form className="login-div" onSubmit={submitCredentials}>
            <input 
            type="text"
            name="username"
            placeholder="Enter username"
            value={credentials.username}
            onChange={handleInput}
            />

            <input 
            type="password"
            name="password"
            placeholder="Enter Password"
            value={credentials.password}
            onChange={handleInput}/>

            <button onClick={submitCredentials}>Login</button>
            {message && <p>{message}</p>}
        </form>

        </div>
    </>
    );
}

export default Login;