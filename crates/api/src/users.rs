use authentication::middle::{Authenticate, MaybeAuthenticate, verify_password};
use axum::{
    Form, Json,
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Redirect},
};
use axum_extra::extract::cookie::CookieJar;

use database::users;
use shared::{
    errors::AppError,
    flash::{clear_session_cookie, referer_path, set_flash},
    models::{Index, Notify},
    query::DeleteRequest,
    state::AppState,
};

pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<impl IntoResponse, AppError> {
    if let Some(session_id) = jar.get("session_id").map(|c| c.value().to_string()) {
        users::logout(&state.db, &session_id).await?;
    }
    Ok((clear_session_cookie(jar), Redirect::to("/")))
}

pub async fn notification(
    State(state): State<AppState>,
    headers: HeaderMap,
    MaybeAuthenticate(user): MaybeAuthenticate,
    Form(payload): Form<Notify>,
) -> Result<impl IntoResponse, AppError> {
    let back = referer_path(&headers);
    let Some(user) = user else {
        return Ok(Redirect::to(&back));
    };
    users::notification(&state.db, &user.user_id, payload.notify).await?;
    Ok(Redirect::to(&back))
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
    headers: HeaderMap,
    jar: CookieJar,
    MaybeAuthenticate(user): MaybeAuthenticate,
    Form(payload): Form<DeleteRequest>,
) -> Result<impl IntoResponse, AppError> {
    let back = referer_path(&headers);
    let Some(user) = user else {
        return Ok((clear_session_cookie(jar), Redirect::to("/")));
    };

    if !verify_password(&payload.password, &user.password) {
        return Ok((
            set_flash(jar, "Feil passord."),
            Redirect::to(&back),
        ));
    }

    users::delete_user(&state.db, &user.user_id).await?;
    Ok((clear_session_cookie(jar), Redirect::to("/")))
}
