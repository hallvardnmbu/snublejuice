use axum::{Router, routing::get};
use mongodb::Database;

pub mod products;
pub mod users;

pub fn router() -> Router<Database> {
    Router::new()
        .route("/products", get(products::get_products))
        .route("/me", get(users::get_user))
}
