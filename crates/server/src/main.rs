use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use std::net::SocketAddr;
use std::str::FromStr;

mod config;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = config::Config::init();
    
    // Connect to DB
    let connection_options = sqlx::sqlite::SqliteConnectOptions::from_str(&config.database_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connection_options)
        .await?;

    let app = routes::app(pool)
        .layer(tower_http::cors::CorsLayer::permissive());
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    println!("listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
