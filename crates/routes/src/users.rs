use axum::{Json, extract::State};

use core::{errors::AppError, models::User, state::AppState};

pub async fn get_user(State(_state): State<AppState>) -> Result<Json<Option<User>>, AppError> {
    Err(AppError::InternalServerError)
}

pub async fn login(State(_state): State<AppState>) -> Result<Json<Option<User>>, AppError> {
    Err(AppError::InternalServerError)
}

pub async fn logout(State(_state): State<AppState>) -> Result<Json<Option<User>>, AppError> {
    Err(AppError::InternalServerError)
}

pub async fn favourites(State(_state): State<AppState>) -> Result<Json<Option<User>>, AppError> {
    Err(AppError::InternalServerError)
}
