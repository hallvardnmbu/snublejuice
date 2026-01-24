use axum::{Router, routing::{get, post}};
use sqlx::SqlitePool;
use tower_cookies::CookieManagerLayer;

pub mod error;
pub mod handlers;
pub mod auth;
pub mod account;

pub fn app(pool: SqlitePool) -> Router {
    Router::new()
        .route("/products", get(handlers::list_products))
        .route("/data/stores", get(handlers::list_stores))
        .route("/data/countries", get(handlers::list_countries))
        // Account Routes
        .route("/account/register", post(account::register))
        .route("/account/login", post(account::login))
        .route("/account/logout", post(account::logout))
        .route("/account/delete", post(account::delete))
        .route("/account/favourite", post(account::favourite))
        .route("/account/notification", post(account::notification))
        .layer(CookieManagerLayer::new())
        .with_state(pool)
}
