pub mod render;

use axum::{
    Router,
    routing::{get, post},
};
use axum_embed::ServeEmbed;
use rust_embed::RustEmbed;
use shared::state::AppState;

#[derive(RustEmbed, Clone)]
#[folder = "public/"]
struct Assets;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(render::site))
        .route("/data/products", post(render::fetch_products))
        .nest_service("/public", ServeEmbed::<Assets>::new())
}
