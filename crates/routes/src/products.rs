use axum::{Json, extract::State};
use core::errors::AppError;
use core::models::Product;
use mongodb::Database;

pub async fn get_products(State(state): State<Database>) -> Result<Json<Vec<Product>>, AppError> {
    // TODO: Parse header for parameters.
    let products = database::products::get_products(state, "discount", true, 1).await;

    Ok(Json(products))
}
