use axum::{
    Router, middleware,
    routing::{get, post},
};

use authentication::middle::Authenticate;
use core::state::AppState;

pub mod metadata;
pub mod products;
pub mod users;

pub fn router(state: AppState) -> Router<AppState> {
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
        .route("/data/products", get(products::get_products))
        .route("/data/image/{index}", get(products::get_image))
        .route("/data/stores", get(metadata::get_stores))
        .route("/data/countries", get(metadata::get_countries))
}
