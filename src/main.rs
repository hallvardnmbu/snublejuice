use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::get,
};
use mongodb::{Client, Collection, bson::doc};
use serde::{Deserialize, Serialize};

#[tokio::main]
async fn main() {
    let connection_string = format!(
        "mongodb+srv://{}:{}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice",
        std::env::var("MONGO_USR").unwrap(),
        std::env::var("MONGO_PWD").unwrap(),
    );
    let client = Client::with_uri_str(connection_string).await.unwrap();

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app(client)).await.unwrap();
}

fn app(client: Client) -> Router {
    let products: Collection<Product> = client.database("snublejuice").collection("products");
    let users: Collection<User> = client.database("snublejuice").collection("users");

    Router::new()
        .route("/product/{index}", get(product))
        .with_state(products)
        .route("/users/{email}", get(user))
        .with_state(users)
}

async fn product(
    State(products): State<Collection<Product>>,
    Path(index): Path<u32>,
) -> Result<Json<Option<Product>>, (StatusCode, String)> {
    let result = products
        .find_one(doc! { "index": index })
        .await
        .map_err(internal_error)?;

    Ok(Json(result))
}

async fn user(
    State(users): State<Collection<User>>,
    Path(email): Path<String>,
) -> Result<Json<Option<User>>, (StatusCode, String)> {
    let result = users
        .find_one(doc! { "email": email })
        .await
        .map_err(internal_error)?;

    Ok(Json(result))
}

fn internal_error<E>(err: E) -> (StatusCode, String)
where
    E: std::error::Error,
{
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

#[derive(Debug, Deserialize, Serialize)]
struct Product {
    index: u32,
    name: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct User {
    email: String,
    username: String,
    favourites: Vec<u32>,
}
