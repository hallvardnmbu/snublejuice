use axum::{Json, extract::State};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use time::Duration as TimeDuration;
use uuid::Uuid;

use crate::middle;
use database::users;
use shared::{
    errors::AppError,
    models::{ONE_MONTH, User},
    query::{LoginRequest, SignupRequest},
    state::AppState,
};

pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(payload): Json<LoginRequest>,
) -> Result<(CookieJar, Json<&'static str>), AppError> {
    let user: User = match users::get_user_by_name(&state.db, &payload.username).await {
        Some(user) => user,
        None => return Err(AppError::NotFound),
    };

    if !middle::verify_password(&payload.password, &user.password) {
        return Err(AppError::Unauthorized);
    }

    users::delete_sessions_for_user(&state.db, &user.user_id).await?;

    let session_id = Uuid::new_v4().to_string();

    users::store_session(&state.db, user.user_id, &session_id).await?;

    let domain =
        std::env::var("COOKIE_DOMAIN").unwrap_or_else(|_| "snublejuice.localhost".to_string());

    let cookie = Cookie::build(("session_id", session_id))
        .path("/")
        .domain(domain)
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .max_age(TimeDuration::seconds(ONE_MONTH as i64))
        .build();

    Ok((jar.add(cookie), Json("ok")))
}

pub async fn signup(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(payload): Json<SignupRequest>,
) -> Result<(CookieJar, Json<&'static str>), AppError> {
    if users::get_user_by_name(&state.db, &payload.username)
        .await
        .is_some()
    {
        return Err(AppError::BadRequest(
            "Brukeren finnes allerede.".to_string(),
        ));
    }

    let hashed_password =
        middle::hash_password(&payload.password).map_err(|_| AppError::InternalServerError)?;

    let user_id = users::create_user(
        &state.db,
        &payload.username,
        &hashed_password,
        &payload.email,
        payload.notify,
    )
    .await?;

    let session_id = Uuid::new_v4().to_string();
    users::store_session(&state.db, user_id, &session_id).await?;

    let domain =
        std::env::var("COOKIE_DOMAIN").unwrap_or_else(|_| "snublejuice.localhost".to_string());

    let cookie = Cookie::build(("session_id", session_id))
        .path("/")
        .domain(domain)
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .max_age(TimeDuration::seconds(ONE_MONTH as i64))
        .build();

    Ok((jar.add(cookie), Json("ok")))
}
