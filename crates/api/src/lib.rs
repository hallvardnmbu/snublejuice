use axum::{
    Router,
    routing::{get, post},
};

use shared::state::AppState;

pub mod products;
pub mod users;

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/account/logout", post(users::logout))
        .route("/account/notification", post(users::notification))
        .route("/account/favourite", post(users::toggle_favourite))
        .route("/account/delete", post(users::delete))
        .route("/data/image/{index}", get(products::get_image))
}
