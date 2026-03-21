use authentication::middle::Authenticate;
use axum::{Json, extract::State};

use core::{errors::AppError, models::User, state::AppState};
use database::users;

pub async fn get_user(
    State(state): State<AppState>,
    auth: Authenticate,
) -> Result<Json<User>, AppError> {
    let user: User = users::get_user_by_id(&state.db, &auth.id)
        .await
        .ok_or(AppError::NotFound)?;
    Ok(Json(user))
}

pub async fn logout(
    State(state): State<AppState>,
    auth: Authenticate,
) -> Result<Json<String>, AppError> {
    users::logout(&state.db, &auth.id).await?;
    Ok(Json("ok".to_string()))
}

pub async fn favourites(
    State(state): State<AppState>,
    auth: Authenticate,
) -> Result<Json<Vec<usize>>, AppError> {
    let favourites: Vec<usize> = users::favourites(&state.db, &auth.id).await?;
    Ok(Json(favourites))
}
