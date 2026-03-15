use axum::{
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};
use axum_extra::extract::cookie::CookieJar;
use bcrypt::{DEFAULT_COST, hash, verify};
use mongodb::{Database, bson::oid::ObjectId};
use tokio::spawn;

use core::errors::AppError;
use database::users;

pub struct Authenticate {
    pub id: ObjectId,
}

impl<S> FromRequestParts<S> for Authenticate
where
    Database: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let db = Database::from_ref(state);

        let jar = CookieJar::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::InternalServerError)?;

        // Check for the session cookie.
        let session_id = jar
            .get("session_id")
            .map(|c| c.value().to_string())
            .ok_or(AppError::Unauthorized)?;

        // Check the session cookie validity.
        let session = users::get_user_by_session_id(&db, &session_id)
            .await
            .map_err(|_| AppError::Unauthorized)?;

        // Slide the expiration date forward.
        let db_clone = db.clone();
        spawn(async move {
            let _ = users::update_expiration(db_clone, session_id).await;
        });

        Ok(Authenticate {
            id: session.user_id,
        })
    }
}

pub fn verify_password(password: &str, hashed: &str) -> bool {
    verify(password, hashed).unwrap_or(false)
}

pub fn hash_password(password: &str) -> Result<String, bcrypt::BcryptError> {
    hash(password, DEFAULT_COST)
}
