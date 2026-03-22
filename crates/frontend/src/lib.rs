pub mod render;

use axum::{Router, routing::get};
use core::state::AppState;
use tower_http::services::ServeDir;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(render::site)).nest_service(
        "/public",
        ServeDir::new(concat!(env!("CARGO_MANIFEST_DIR"), "/public")),
    )
}
