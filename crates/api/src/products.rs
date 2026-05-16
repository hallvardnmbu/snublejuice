use axum::{extract::Path, http::header, response::IntoResponse};
use regex::Regex;
use std::env;
use std::path::PathBuf;
use std::sync::LazyLock;
use tokio::fs;

use shared::errors::AppError;

static RE_INDEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[0-9]+$").unwrap());

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
