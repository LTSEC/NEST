use axum::{routing::post, Router};
use sqlx::postgres::PgPoolOptions;

// import users.rs
mod users;
use users::{new_user};

// Sets the router and listener
// Should be able to test the API using curl in terminal
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let db_url = "";
    let pool = PgPoolOptions::new().connect(db_url).await?;

    // Creates the routes 
    let app = Router::new()
        .route("/api/user", post(new_user))
        .with_state(pool);

    // sets the listener for the router
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    axum::serve(listener, app).await?;
    Ok(())
}