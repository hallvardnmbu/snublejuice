use axum::{
    Router, middleware,
    routing::{get, post},
};

use authentication::middle::Authenticate;
use shared::state::AppState;

pub mod products;
pub mod users;

pub fn router(state: AppState) -> Router<AppState> {
    let protected = Router::<AppState>::new()
        .route("/account/logout", post(users::logout))
        .route("/account/notification", post(users::notification))
        .route("/account/favourite", post(users::toggle_favourite))
        .route("/account/delete", post(users::delete))
        .layer(middleware::from_extractor_with_state::<
            Authenticate,
            AppState,
        >(state.clone()));

    Router::<AppState>::new()
        .merge(protected)
        .route("/data/image/{index}", get(products::get_image))
}
