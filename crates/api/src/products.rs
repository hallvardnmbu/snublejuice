use axum::{Json, extract::{Path, State}, http::header, response::IntoResponse};
use mongodb::Database;
use regex::Regex;
use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::sync::LazyLock;
use tokio::fs;

use database;
use shared::{errors::AppError, models::Product};

static RE_INDEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[0-9]+$").unwrap());

#[derive(Serialize)]
pub struct PreviewResponse {
    vmp: Option<Product>,
    tax: Option<Product>,
}

pub async fn get_preview(State(db): State<Database>) -> Json<PreviewResponse> {
    let (vmp, tax) = tokio::join!(
        database::products::get_preview(&db, false),
        database::products::get_preview(&db, true),
    );
    Json(PreviewResponse { vmp, tax })
}

pub async fn get_image(Path(index): Path<String>) -> Result<impl IntoResponse, AppError> {
    if !RE_INDEX.is_match(&index) {
        return Err(AppError::BadRequest("Ugyldig index.".to_string()));
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
