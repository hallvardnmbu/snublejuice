use axum::{
    Router, middleware,
    routing::{get, post},
};
use tower_http::services::ServeDir;

use authentication::middle::Authenticate;
use core::state::AppState;
use frontend;

pub mod metadata;
pub mod products;
pub mod users;

pub fn router(state: AppState) -> Router {
    let protected = Router::<AppState>::new()
        .route("/me", get(users::get_user))
        .route("/me/logout", post(users::logout))
        .route("/me/favourites", get(users::favourites))
        .layer(middleware::from_extractor_with_state::<
            Authenticate,
            AppState,
        >(state.clone()));

    Router::<AppState>::new()
        .merge(protected)
        .route("/", get(frontend::render::landing))
        .route("/me/login", post(authentication::auth::login))
        .route("/me/signup", post(authentication::auth::signup))
        .route("/data/products", get(products::get_products))
        .route("/data/stores", get(metadata::get_stores))
        .route("/data/countries", get(metadata::get_countries))
        .nest_service(
            "/public",
            ServeDir::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../frontend/public")),
        )
        .with_state(state)
}
