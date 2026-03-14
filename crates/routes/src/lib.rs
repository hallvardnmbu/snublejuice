use axum::{Router, routing::get};
use mongodb::Database;

pub mod metadata;
pub mod products;
pub mod subdomain;
pub mod users;

pub fn router() -> Router<Database> {
    Router::new()
        .route("/products", get(products::get_products))
        .route("/stores", get(metadata::get_stores))
        .route("/countries", get(metadata::get_countries))
        .route("/me", get(users::get_user))
}
