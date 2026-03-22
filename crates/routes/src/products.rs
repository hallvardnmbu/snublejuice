use axum::{
    Json,
    extract::{Query, State},
};

use core::models::Product;
use core::{errors::AppError, query::Parameters, state::AppState, subdomain::Subdomain};

pub async fn get_products(
    State(state): State<AppState>,
    subdomain: Subdomain,
    Query(parameters): Query<Parameters>,
) -> Result<Json<Vec<Product>>, AppError> {
    let products = database::products::get_products(
        &state.db,
        parameters.to_filter(&subdomain),
        parameters.to_options(),
    )
    .await;

    Ok(Json(products))
}
