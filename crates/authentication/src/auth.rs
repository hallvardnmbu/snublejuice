use axum::{Json, extract::State};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use mongodb::{
    Database,
    bson::{DateTime, doc},
};
use serde::Deserialize;
use std::time::{Duration, SystemTime};
use uuid::Uuid;

use crate::middle;
use core::{
    errors::AppError,
    models::{ONE_MONTH, Session, User},
};
use database::users;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

pub async fn login(
    State(db): State<Database>,
    jar: CookieJar,
    Json(payload): Json<LoginRequest>,
) -> Result<(CookieJar, Json<&'static str>), AppError> {
    let user: User = match users::get_user_by_name(&db, &payload.username).await {
        Some(user) => user,
        None => return Err(AppError::NotFound),
    };

    if !middle::verify_password(&payload.password, &user.password) {
        return Err(AppError::Unauthorized);
    }

    let session_id = Uuid::new_v4().to_string();

    let expires_at = DateTime::from_system_time(SystemTime::now() + Duration::from_secs(ONE_MONTH));
    let session = Session {
        user_id: user.user_id,
        session_id: session_id.clone(),
        expires_at: expires_at,
    };
    users::store_session(&db, session).await?;

    let cookie = Cookie::build(("session_id", session_id))
        .path("/")
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .build();

    Ok((jar.add(cookie), Json("ok")))
}
