use axum::{
    Json,
    extract::{Path, Query, State},
    http::header,
    response::IntoResponse,
};
use lazy_static::lazy_static;
use regex::Regex;
use std::env;
use std::path::PathBuf;
use tokio::fs;

use core::models::Product;
use core::{errors::AppError, query::Parameters, state::AppState, subdomain::Subdomain};

lazy_static! {
    static ref RE_INDEX: Regex = Regex::new(r"^[0-9]+$").unwrap();
}

pub async fn get_products(
    State(state): State<AppState>,
    subdomain: Subdomain,
    Query(parameters): Query<Parameters>,
) -> Result<Json<Vec<Product>>, AppError> {
    let products = database::products::get_products(
        &state.db,
        parameters.to_filter(&subdomain),
        parameters.to_options(&subdomain),
    )
    .await;

    Ok(Json(products))
}

pub async fn get_image(Path(index): Path<String>) -> Result<impl IntoResponse, AppError> {
    if !RE_INDEX.is_match(&index) {
        return Err(AppError::BadRequest("Invalid index".to_string()));
    }

    let image_dir = env::var("IMAGE_DIR").map_err(|_| AppError::InternalServerError)?;

    let file_path = PathBuf::from(&image_dir).join(format!("{}.png", index));
    if file_path.exists() && file_path.is_file() {
        if let Ok(contents) = fs::read(&file_path).await {
            return Ok(([(header::CONTENT_TYPE, "image/png")], contents));
        }
    }

    Ok(serve_fallback().await)
}

async fn serve_fallback() -> ([(header::HeaderName, &'static str); 1], Vec<u8>) {
    let fallback_path = PathBuf::from("/public/images/bottle.png");
    let contents = fs::read(fallback_path).await.unwrap_or_else(|_| Vec::new());
    ([(header::CONTENT_TYPE, "image/png")], contents)
}
