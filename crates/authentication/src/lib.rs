pub mod auth;
pub mod middle;

use axum::{Router, routing::post};
use core::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/account/login", post(auth::login))
        .route("/account/signup", post(auth::signup))
}
