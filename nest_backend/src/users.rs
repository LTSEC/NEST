// This file contains handlers for all user functions
// (creating, logging in, etc.)
use axum::{extract::{Path, State},Json, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize}; // converts JSON to rust struct and vise versa
use sqlx::{PgPool, Error, FromRow}; // used for Database interaction
use argon2::{Argon2, PasswordHasher};
use rand_core::OsRng;
use argon2::password_hash::{SaltString, PasswordHash, PasswordVerifier};
use uuid::Uuid;

// User that will be returned from GET requests
#[derive(Debug, Serialize, FromRow)]
pub struct User {
    pub username: String,
    pub email: String
}

// User that will be used for making new user POST request
#[derive(Debug, Deserialize)]
pub struct NewUser {
    pub username: String,
    pub email: String,
    pub password: String
}

// User that will be used for editing an existing user
// Uses Option for all fields since a user doesn't explicitly have to edit
//      every single field to edit their user (ie. User can just edit their email w/o password)
#[derive(Debug, Deserialize)]
pub struct EditUser {
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub password: Option<String>,
    pub avatar_url: Option<String>
}

fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    // Generate a random salt
    let salt = SaltString::generate(&mut OsRng);

    // Creates default Argon2 instance
    let argon2 = Argon2::default();

    // Hashes password with salt
    let password_hash = argon2.hash_password(password.as_bytes(), &salt)?;

    // returns hashed password 
    Ok(password_hash.to_string())
}

fn verify_password(hash: &str, password: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed_hash = PasswordHash::new(hash)?;
    let argon2 = Argon2::default();

    match argon2.verify_password(password.as_bytes(), &parsed_hash) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

// handler for creating a new user
#[axum::debug_handler]
pub async fn new_user(State(pool): State<PgPool>, Json(payload): Json<NewUser>) -> Result<StatusCode, (StatusCode, String)>  {
    let query = "
        INSERT INTO users (username, email, password)
        VALUES ($1, $2, $3)
    ";

    // hashes the password; returns status 500 if hashing fails
    let hashed_password = hash_password(&payload.password)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Password hashing failed".into()))?;

    // Queries the database
    let result = sqlx::query(query)
    .bind(&payload.username)
    .bind(&payload.email)
    .bind(&hashed_password)
    .execute(&pool)
    .await;

    match result {
        Ok(_) => Ok(StatusCode::CREATED), // code 201 if successful
        Err(e) => {
            eprintln!("DB error: {:?}", e); // prints any errors from the database
            Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to create user".into()))
        }
    }
}

// handler for getting a user
#[axum::debug_handler]
pub async fn get_user(State(pool): State<PgPool>, Path(user_id): Path<Uuid>) -> impl IntoResponse {
    let query = "SELECT username, email FROM users WHERE id = $1";

    let result = sqlx::query_as::<_, User>(query)
        .bind(user_id)
        .fetch_one(&pool)
        .await;

    match result {
        Ok(user) => (StatusCode::OK, Json(user)).into_response(),
        Err(Error::RowNotFound) => (StatusCode::NOT_FOUND, "User not found").into_response(),
        Err(e) => {
            eprintln!("DB error: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
        }
    }
}