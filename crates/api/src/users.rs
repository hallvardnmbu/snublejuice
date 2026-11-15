use authentication::middle::{Authenticate, verify_password};
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
    models::{Index, Notify, User},
    query::DeleteRequest,
    state::AppState,
};

pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
    auth: Authenticate,
) -> Result<impl IntoResponse, AppError> {
    users::logout(&state.db, &auth.session_id).await?;
    Ok((clear_session_cookie(jar), Redirect::to("/")))
}

pub async fn notification(
    State(state): State<AppState>,
    headers: HeaderMap,
    auth: Authenticate,
    Form(payload): Form<Notify>,
) -> Result<impl IntoResponse, AppError> {
    let back = referer_path(&headers);
    users::notification(&state.db, &auth.id, payload.notify).await?;
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
    auth: Authenticate,
    Form(payload): Form<DeleteRequest>,
) -> Result<impl IntoResponse, AppError> {
    let back = referer_path(&headers);
    let user: User = users::get_user_by_id(&state.db, &auth.id)
        .await
        .ok_or(AppError::NotFound)?;

    if !verify_password(&payload.password, &user.password) {
        return Ok((
            set_flash(jar, "Feil brukernavn eller passord."),
            Redirect::to(&back),
        ));
    }

    users::delete_user(&state.db, &auth.id).await?;
    Ok((clear_session_cookie(jar), Redirect::to("/")))
}
