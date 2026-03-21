use axum::{
    Router, middleware,
    routing::{get, post},
};

use authentication::middle::Authenticate;
use core::state::AppState;

pub mod metadata;
pub mod products;
pub mod subdomain;
pub mod users;

pub fn router(state: AppState) -> Router {
    let protected = Router::<AppState>::new()
        .route("/me", get(users::get_user))
        .route("/logout", post(users::logout))
        .route("/favourites", get(users::favourites))
        .layer(middleware::from_extractor_with_state::<
            Authenticate,
            AppState,
        >(state.clone()));

    Router::<AppState>::new()
        .merge(protected)
        .route("/login", post(authentication::auth::login))
        .route("/signup", post(authentication::auth::signup))
        .route("/products", get(products::get_products))
        .route("/stores", get(metadata::get_stores))
        .route("/countries", get(metadata::get_countries))
        .with_state(state)
}
