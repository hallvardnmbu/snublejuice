use axum::{
    Form,
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Redirect},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use mongodb::bson::DateTime;
use std::time::{Duration, SystemTime};
use time::Duration as TimeDuration;
use uuid::Uuid;

use crate::middle;
use database::users;
use shared::{
    errors::AppError,
    flash::{cookie_domain, referer_path, set_flash},
    models::{ONE_MONTH, Session, User},
    query::{LoginRequest, SignupRequest},
    state::AppState,
};

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    jar: CookieJar,
    Form(form): Form<LoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    let back = referer_path(&headers);
    let user = users::get_user_by_name(&state.db, &form.username).await;
    let hash = user.as_ref().map_or(middle::dummy_hash(), |u| &u.password);
    let valid = middle::verify_password(&form.password, hash);
    let user: User = match user {
        Some(user) if valid => user,
        _ => {
            return Ok((
                set_flash(jar, "Feil brukernavn eller passord."),
                Redirect::to(&back),
            ));
        }
    };

    users::delete_sessions_for_user(&state.db, &user.user_id).await?;

    let session_id = Uuid::new_v4().to_string();

    let expires_after =
        DateTime::from_system_time(SystemTime::now() + Duration::from_secs(ONE_MONTH));
    let session = Session {
        user_id: user.user_id,
        username: user.username,
        session_id: session_id.clone(),
        expires_after,
    };
    users::store_session(&state.db, session).await?;

    let cookie = Cookie::build(("session_id", session_id))
        .path("/")
        .domain(cookie_domain())
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .max_age(TimeDuration::seconds(ONE_MONTH as i64))
        .build();

    Ok((jar.add(cookie), Redirect::to(&back)))
}

pub async fn signup(
    State(state): State<AppState>,
    headers: HeaderMap,
    jar: CookieJar,
    Form(payload): Form<SignupRequest>,
) -> Result<impl IntoResponse, AppError> {
    let back = referer_path(&headers);
    let username = payload.username.trim().to_string();
    if let Err(AppError::BadRequest(msg)) =
        validate_signup(&username, &payload.password, &payload.email)
    {
        return Ok((set_flash(jar, &msg), Redirect::to(&back)));
    }

    if users::get_user_by_name(&state.db, &username)
        .await
        .is_some()
    {
        return Ok((
            set_flash(jar, "Brukeren finnes allerede."),
            Redirect::to(&back),
        ));
    }

    let hashed_password =
        middle::hash_password(&payload.password).map_err(|_| AppError::InternalServerError)?;

    let user_id = mongodb::bson::oid::ObjectId::new();

    let new_user = User {
        user_id,
        username,
        password: hashed_password,
        email: payload.email.clone(),
        favourites: vec![],
        notify: payload.notify,
    };

    match users::create_user(&state.db, &new_user).await {
        Ok(()) => {}
        Err(AppError::BadRequest(msg)) => {
            return Ok((set_flash(jar, &msg), Redirect::to(&back)));
        }
        Err(err) => return Err(err),
    }

    let session_id = Uuid::new_v4().to_string();
    let expires_after =
        DateTime::from_system_time(SystemTime::now() + Duration::from_secs(ONE_MONTH));
    let session = Session {
        user_id,
        username: new_user.username.clone(),
        session_id: session_id.clone(),
        expires_after,
    };
    users::store_session(&state.db, session).await?;

    let cookie = Cookie::build(("session_id", session_id))
        .path("/")
        .domain(cookie_domain())
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .max_age(TimeDuration::seconds(ONE_MONTH as i64))
        .build();

    Ok((jar.add(cookie), Redirect::to(&back)))
}

fn validate_signup(username: &str, password: &str, email: &str) -> Result<(), AppError> {
    let invalid = |msg: &str| AppError::BadRequest(msg.to_string());

    if !(3..=32).contains(&username.chars().count()) {
        return Err(invalid("Brukernavnet må være mellom 3 og 32 tegn."));
    }
    // bcrypt only uses the first 72 bytes.
    if !(4..=72).contains(&password.len()) {
        return Err(invalid("Passordet må være mellom 4 og 72 tegn."));
    }
    if email.len() > 254 || !email.contains('@') {
        return Err(invalid("Ugyldig e-postadresse."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_signup_enforces_limits() {
        assert!(validate_signup("alice", "longenough", "a@b.no").is_ok());
        assert!(validate_signup("al", "longenough", "a@b.no").is_err());
        assert!(validate_signup(&"a".repeat(33), "longenough", "a@b.no").is_err());
        assert!(validate_signup("alice", "a", "a@b.no").is_err());
        assert!(validate_signup("alice", &"p".repeat(73), "a@b.no").is_err());
        assert!(validate_signup("alice", "longenough", "no-at-sign").is_err());
    }
}
