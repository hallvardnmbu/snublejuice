use axum::{Json, extract::State};
use core::errors::AppError;
use core::models::User;
use mongodb::Database;

pub async fn get_user(State(state): State<Database>) -> Result<Json<Option<User>>, AppError> {
    // TODO: Parse header for parameters.
    let user = database::users::get_user(state, "").await;

    Ok(Json(user))
}
