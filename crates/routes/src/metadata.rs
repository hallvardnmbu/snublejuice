use axum::{Json, extract::State};
use core::errors::AppError;
use mongodb::Database;

pub async fn get_stores(State(state): State<Database>) -> Result<Json<Vec<String>>, AppError> {
    // TODO: Parse header for parameters (taxfree or not).
    let taxfree: bool = false;

    let field: &str = if taxfree { "taxfree.stores" } else { "stores" };
    let stores: Vec<String> = database::metadata::get_distinct(state, field).await;

    Ok(Json(stores))
}

pub async fn get_countries(State(state): State<Database>) -> Result<Json<Vec<String>>, AppError> {
    let countries: Vec<String> = database::metadata::get_distinct(state, &"countries").await;

    Ok(Json(countries))
}
