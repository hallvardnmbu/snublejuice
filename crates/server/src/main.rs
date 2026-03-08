use axum::serve;
use database;
use routes;
use std::net::SocketAddr;

static _DATABASE_KEY: &str = "MONGODB";
static _DATABASE_NAME: &str = "snublejuice";
static _PORT: u16 = 3000;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = database::connect::get_database(_DATABASE_KEY, _DATABASE_NAME).await?;
    let app = routes::router().with_state(db);

    let addr = SocketAddr::from(([0, 0, 0, 0], _PORT));
    println!("listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    serve(listener, app).await?;

    Ok(())
}
