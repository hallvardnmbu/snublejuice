use axum::{Json, extract::State};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use mongodb::bson::DateTime;
use std::time::{Duration, SystemTime};
use uuid::Uuid;

use crate::middle;
use database::users;
use shared::{
    errors::AppError,
    models::{ONE_MONTH, Session, User},
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

    let expires_after =
        DateTime::from_system_time(SystemTime::now() + Duration::from_secs(ONE_MONTH));
    let session = Session {
        user_id: user.user_id,
        session_id: session_id.clone(),
        expires_after,
    };
    users::store_session(&state.db, session).await?;

    let domain =
        std::env::var("COOKIE_DOMAIN").unwrap_or_else(|_| "snublejuice.localhost".to_string());

    let cookie = Cookie::build(("session_id", session_id))
        .path("/")
        .domain(domain)
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
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

    let user_id = mongodb::bson::oid::ObjectId::new();

    let new_user = User {
        user_id,
        username: payload.username.clone(),
        password: hashed_password,
        email: payload.email.clone(),
        favourites: vec![],
        notify: payload.notify,
    };

    users::create_user(&state.db, &new_user).await?;

    let session_id = Uuid::new_v4().to_string();
    let expires_after =
        DateTime::from_system_time(SystemTime::now() + Duration::from_secs(ONE_MONTH));
    let session = Session {
        user_id,
        session_id: session_id.clone(),
        expires_after,
    };
    users::store_session(&state.db, session).await?;

    let domain =
        std::env::var("COOKIE_DOMAIN").unwrap_or_else(|_| "snublejuice.localhost".to_string());

    let cookie = Cookie::build(("session_id", session_id))
        .path("/")
        .domain(domain)
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .build();

    Ok((jar.add(cookie), Json("ok")))
}
