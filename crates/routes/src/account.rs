use axum::{
    extract::{State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower_cookies::{Cookies, Cookie, cookie::SameSite};
use crate::error::AppError;
use crate::auth::{AuthUser, sign_token};
use database::users;

// Helper for cookies
fn set_token_cookie(cookies: &Cookies, token: &str) {
    let mut cookie = Cookie::new("token", token.to_owned());
    cookie.set_http_only(true);
    cookie.set_path("/");
    cookie.set_same_site(SameSite::Lax);
    // Max age 1 year
    cookie.set_max_age(tower_cookies::cookie::time::Duration::days(365)); 
    cookies.add(cookie);
}

fn remove_token_cookie(cookies: &Cookies) {
    let mut cookie = Cookie::new("token", "");
    cookie.set_path("/");
    cookies.remove(cookie);
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    username: String,
    email: String,
    password: String,
    notify: bool,
}

pub async fn register(
    State(pool): State<SqlitePool>,
    cookies: Cookies,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<Value>, AppError> {
    // Check existing
    if database::users::get_user_by_username(&pool, &payload.username).await?.is_some() {
        return Err(AppError::Input("Username already taken".into()));
    }
    if database::users::get_user_by_email(&pool, &payload.email).await?.is_some() {
        return Err(AppError::Input("Email already taken".into()));
    }

    // Hash password
    let hash = bcrypt::hash(&payload.password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Create user
    users::create_user(&pool, &payload.username, &payload.email, &hash, payload.notify).await?;

    // Sign token
    let token = sign_token(&payload.username)?;
    set_token_cookie(&cookies, &token);

    Ok(Json(json!({ "message": "Registered successfully", "username": payload.username })))
}

#[derive(Deserialize)]
pub struct LoginRequest {
    username: String,
    password: String,
}

pub async fn login(
    State(pool): State<SqlitePool>,
    cookies: Cookies,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<Value>, AppError> {
    let user = users::get_user_by_username(&pool, &payload.username).await?
        .ok_or(AppError::Auth("Invalid username or password".into()))?;

    let valid = bcrypt::verify(&payload.password, user.password.as_deref().unwrap_or("")).unwrap_or(false);
    if !valid {
        return Err(AppError::Auth("Invalid username or password".into()));
    }

    let token = sign_token(&user.username)?;
    set_token_cookie(&cookies, &token);

    Ok(Json(json!({ "message": "Logged in", "username": user.username })))
}

pub async fn logout(cookies: Cookies) -> Result<Json<Value>, AppError> {
    remove_token_cookie(&cookies);
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct DeleteRequest {
    password: String,
    username: String, // Ensure they know who they are deleting? Or just use AuthUser?
    // Legacy payload had username/password.
}

pub async fn delete(
    State(pool): State<SqlitePool>,
    cookies: Cookies,
    // We should probably require auth here, but legacy checked password from body.
    Json(payload): Json<DeleteRequest>,
) -> Result<Json<Value>, AppError> {
    let user = users::get_user_by_username(&pool, &payload.username).await?
        .ok_or(AppError::Auth("User not found".into()))?;

    let valid = bcrypt::verify(&payload.password, user.password.as_deref().unwrap_or("")).unwrap_or(false);
    if !valid {
        return Err(AppError::Auth("Invalid password".into()));
    }

    users::delete_user(&pool, &user.username).await?;
    remove_token_cookie(&cookies);

    Ok(Json(json!({ "message": "User deleted" })))
}

#[derive(Deserialize)]
pub struct FavouriteRequest {
    index: i64, 
}

pub async fn favourite(
    State(pool): State<SqlitePool>,
    auth: AuthUser,
    Json(payload): Json<FavouriteRequest>,
) -> Result<Json<Value>, AppError> {
    users::toggle_favourite(&pool, &auth.username, payload.index).await?;
    Ok(Json(json!({ "message": "Favourite updated" })))
}

#[derive(Deserialize)]
pub struct NotificationRequest {
    notify: bool,
}

pub async fn notification(
    State(pool): State<SqlitePool>,
    auth: AuthUser,
    Json(payload): Json<NotificationRequest>,
) -> Result<Json<Value>, AppError> {
    users::update_notification(&pool, &auth.username, payload.notify).await?;
    let msg = if payload.notify { "Notifications enabled" } else { "Notifications disabled" };
    Ok(Json(json!({ "message": msg })))
}
