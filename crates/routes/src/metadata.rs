use axum::{Json, extract::State};
use core::errors::AppError;
use mongodb::Database;

use crate::subdomain::Subdomain;

pub async fn get_stores(
    State(state): State<Database>,
    subdomain: Subdomain,
) -> Result<Json<Vec<String>>, AppError> {
    let taxfree = subdomain.is_taxfree();
    let field: &str = if taxfree { "taxfree.stores" } else { "stores" };

    let stores: Vec<String> = database::metadata::get_distinct(state, field, taxfree).await;

    Ok(Json(stores))
}

pub async fn get_countries(
    State(state): State<Database>,
    subdomain: Subdomain,
) -> Result<Json<Vec<String>>, AppError> {
    let countries: Vec<String> =
        database::metadata::get_distinct(state, &"country", subdomain.is_taxfree()).await;

    Ok(Json(countries))
}
