use axum::Router;
use axum::serve;
use std::net::SocketAddr;

use api;
use authentication;
use database;
use frontend;
use shared::state::AppState;

static _PRODUCTS_KEY: &str = "PRODUCTS_DB";
static _APP_KEY: &str = "APP_DB";
static _PORT: u16 = 3000;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = database::connect::get_database(_PRODUCTS_KEY, _APP_KEY)?;
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
    serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
