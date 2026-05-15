pub mod render;

use axum::{Router, routing::get};
use axum_embed::ServeEmbed;
use core::state::AppState;
use rust_embed::RustEmbed;

#[derive(RustEmbed, Clone)]
#[folder = "public/"]
struct Assets;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(render::site))
        .nest_service("/public", ServeEmbed::<Assets>::new())
}
