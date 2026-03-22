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
        .route("/account", get(users::get_user))
        .route("/account/logout", post(users::logout))
        .route("/account/notification", post(users::notification))
        .route("/account/favourites", get(users::favourites))
        .route("/account/delete", post(users::delete))
        .layer(middleware::from_extractor_with_state::<
            Authenticate,
            AppState,
        >(state.clone()));

    Router::<AppState>::new()
        .merge(protected)
        .route("/", get(frontend::render::landing))
        .route("/account/login", post(authentication::auth::login))
        .route("/account/signup", post(authentication::auth::signup))
        .route("/data/products", get(products::get_products))
        .route("/data/stores", get(metadata::get_stores))
        .route("/data/countries", get(metadata::get_countries))
        .nest_service(
            "/public",
            ServeDir::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../frontend/public")),
        )
        .with_state(state)
}
