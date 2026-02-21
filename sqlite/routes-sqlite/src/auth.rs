use axum::{
    extract::{FromRequestParts},
    http::{request::Parts},
};
use async_trait::async_trait;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use tower_cookies::Cookies;
use crate::error::AppError;
use std::env;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub username: String,
    pub exp: usize,
}

pub fn sign_token(username: &str) -> Result<String, AppError> {
    let key = env::var("JWT_KEY").map_err(|_| AppError::Internal("JWT_KEY not set".into()))?;
    
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(365))
        .expect("valid timestamp")
        .timestamp();

    let claims = Claims {
        username: username.to_owned(),
        exp: expiration as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(key.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.to_string()))
}

pub fn verify_token(token: &str) -> Result<Claims, AppError> {
    let key = env::var("JWT_KEY").map_err(|_| AppError::Internal("JWT_KEY not set".into()))?;
    
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(key.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Auth("Invalid token".into()))?;

    Ok(token_data.claims)
}

// Auth Extractor
pub struct AuthUser {
    pub username: String,
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let cookies = parts
            .extensions
            .get::<Cookies>()
            .ok_or(AppError::Internal("Cookies missing".into()))?;

        let token = cookies
            .get("token")
            .map(|c| c.value().to_string())
            .ok_or(AppError::Auth("No token found".into()))?;

        let claims = verify_token(&token)?;

        Ok(AuthUser {
            username: claims.username,
        })
    }
}

// Optional Auth Extractor (for non-protected routes that might use user info)
pub struct MaybeAuthUser(pub Option<AuthUser>);

impl<S> FromRequestParts<S> for MaybeAuthUser
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match AuthUser::from_request_parts(parts, state).await {
            Ok(user) => Ok(MaybeAuthUser(Some(user))),
            Err(_) => Ok(MaybeAuthUser(None)),
        }
    }
}
