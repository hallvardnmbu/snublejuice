// use std::net::SocketAddr;
// use std::str::FromStr;

use database;

static _DATABASE_KEY: &str = "MONGODB";
static _DATABASE_NAME: &str = "snublejuice";
static _PORT: u16 = 3000;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = database::connect::get_database(_DATABASE_KEY, _DATABASE_NAME).await?;

    let _ = database::query::get_products(db, &"discount", true).await;

    // let app = routes::app(client).layer(tower_http::cors::CorsLayer::permissive());
    // let addr = SocketAddr::from(([0, 0, 0, 0], _PORT));
    // println!("listening on http://{}", addr);

    // let listener = tokio::net::TcpListener::bind(addr).await?;
    // axum::serve(listener, app).await?;

    Ok(())
}
