use axum::{Json, extract::State};

use crate::subdomain::Subdomain;
use core::{errors::AppError, state::AppState};

pub async fn get_stores(
    State(state): State<AppState>,
    subdomain: Subdomain,
) -> Result<Json<Vec<String>>, AppError> {
    let taxfree = subdomain.is_taxfree();
    let field: &str = if taxfree { "taxfree.stores" } else { "stores" };

    let stores: Vec<String> = database::metadata::get_distinct(&state.db, field, taxfree).await;

    Ok(Json(stores))
}

pub async fn get_countries(
    State(state): State<AppState>,
    subdomain: Subdomain,
) -> Result<Json<Vec<String>>, AppError> {
    let countries: Vec<String> =
        database::metadata::get_distinct(&state.db, &"country", subdomain.is_taxfree()).await;

    Ok(Json(countries))
}
