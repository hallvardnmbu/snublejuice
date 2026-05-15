use axum::Router;
use axum::serve;
use std::net::SocketAddr;

use api;
use authentication;
use core::state::AppState;
use database;
use frontend;

static _DATABASE_KEY: &str = "MONGODB";
static _DATABASE_NAME: &str = "snublejuice";
static _PORT: u16 = 3000;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = database::connect::get_database(_DATABASE_KEY, _DATABASE_NAME).await?;
    let state = AppState { db };

    let app = Router::<AppState>::new()
        .merge(frontend::router())
        .merge(authentication::router())
        .merge(api::router(state.clone()))
        .with_state(state.clone());

    let addr = SocketAddr::from(([0, 0, 0, 0], _PORT));

    println!("http://snublejuice.localhost:{}", _PORT);
    println!("http://vinmonopolet.snublejuice.localhost:{}", _PORT);
    println!("http://taxfree.snublejuice.localhost:{}", _PORT);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    serve(listener, app).await?;

    Ok(())
}
