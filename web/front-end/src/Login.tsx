import React, { useState } from "react";
import axios from 'axios';
import './login.css';

const Login = () => {
    const [credentials, setCredentials] = useState({username: "", password: ""});
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [inputError, setInputError] = useState(false);

    const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setCredentials((prev) => ({ ...prev, [name]: value }));
    }

    // Sends the uesrname and password to backend to login
    const submitCredentials = (event: React.FormEvent) => {
        // resets all values
        setMessage("");
        setErrorMessage("");
        setInputError(false);
        event.preventDefault();

        if (credentials.username != "" && credentials.password != "") {
            axios.post("https://localhost:3001/signin", {
                username: credentials.username,
                password: credentials.password,
            })
            .then(response => {
                console.log(response);
                setMessage("Login Successfull");
            })
            .catch(error => {
                let errorMsg = "An error occurred";

                // checks for a more detailed error
                if (error.response && error.response.data && error.response.data.message) {
                    errorMsg = error.response.data.message;
                } 
                else if (error.message) {
                    errorMsg = error.message;
                }

                setErrorMessage(errorMsg);
                setInputError(true);

                // resets username and password so user doesn't have to 
                // (in case they mess up their login)
                setCredentials({username:"", password:""})
            });
        }
        else {
            setErrorMessage("Please fill in both fields");
            setInputError(true);
        }

        
    }

    return (
    <>
    <div className="container">
        <h1>NEST</h1>
        <form className="login-div" onSubmit={submitCredentials}>
            <input 
            type="text"
            name="username"
            placeholder="Enter username"
            value={credentials.username}
            onChange={handleInput}
            className={inputError ? "error-input" : ""}
            />

            <input 
            type="password"
            name="password"
            placeholder="Enter Password"
            value={credentials.password}
            onChange={handleInput}
            className={inputError ? "error-input" : ""}
            />

            <button onClick={submitCredentials}>Login</button>
            {message && <p className="msg">{message}</p>}
            {errorMessage && <p className="msg">{errorMessage}</p>}
        </form>
        </div>
    </>
    );
}

export default Login;