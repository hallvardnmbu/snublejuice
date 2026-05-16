use authentication::middle::Authenticate;
use axum::{Json, extract::State};

use database::users;
use shared::{
    errors::AppError,
    models::{Index, Notify, User},
    state::AppState,
};

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

pub async fn notification(
    State(state): State<AppState>,
    auth: Authenticate,
    Json(payload): Json<Notify>,
) -> Result<Json<String>, AppError> {
    users::notification(&state.db, &auth.id, payload.notify).await?;
    Ok(Json("ok".to_string()))
}

pub async fn favourites(
    State(state): State<AppState>,
    auth: Authenticate,
) -> Result<Json<Vec<i64>>, AppError> {
    let favourites: Vec<i64> = users::favourites(&state.db, &auth.id).await?;
    Ok(Json(favourites))
}

pub async fn toggle_favourite(
    State(state): State<AppState>,
    auth: Authenticate,
    Json(payload): Json<Index>,
) -> Result<Json<String>, AppError> {
    users::toggle_favourite(&state.db, &auth.id, &payload.index).await?;
    Ok(Json("ok".to_string()))
}

pub async fn delete(
    State(state): State<AppState>,
    auth: Authenticate,
) -> Result<Json<String>, AppError> {
    users::delete_user(&state.db, &auth.id).await?;
    Ok(Json("ok".to_string()))
}
