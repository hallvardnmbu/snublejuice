use axum::{Json, extract::State};
use mongodb::Database;

use core::errors::AppError;
use core::models::Product;

pub async fn get_products(State(state): State<Database>) -> Result<Json<Vec<Product>>, AppError> {
    // TODO: Parse header for parameters.
    let sort_by: &str = "discount";
    let ascending: bool = true;
    let page: u64 = 1;

    let products = database::products::get_products(state, sort_by, ascending, page).await;

    Ok(Json(products))
}
