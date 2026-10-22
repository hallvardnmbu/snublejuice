use axum::{Json, extract::State};

use shared::{errors::AppError, state::AppState, subdomain::Subdomain};

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

pub async fn get_pairs(
    State(state): State<AppState>,
    subdomain: Subdomain,
) -> Result<Json<Vec<String>>, AppError> {
    let mut pairs: Vec<String> =
        database::metadata::get_distinct(&state.db, &"pair", subdomain.is_taxfree()).await;
    pairs.sort();

    Ok(Json(pairs))
}
