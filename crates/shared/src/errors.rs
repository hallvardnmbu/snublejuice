use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    MongoError(#[from] mongodb::error::Error),
    #[error("Not found")]
    NotFound,
    #[error("Internal server error")]
    InternalServerError,
    #[error("Invalid request: {0}")]
    BadRequest(String),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Not implementd")]
    NotImplemented,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::MongoError(_) | AppError::InternalServerError => {
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found"),
            AppError::BadRequest(ref msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            AppError::NotImplemented => (StatusCode::NOT_IMPLEMENTED, "Not implemented"),
        };

        let body = axum::Json(serde_json::json!({
            "error": error_message
        }));

        (status, body).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    #[tokio::test]
    async fn into_response_maps_errors_to_status_codes() {
        async fn status(err: AppError) -> StatusCode {
            err.into_response().status()
        }

        assert_eq!(status(AppError::NotFound).await, StatusCode::NOT_FOUND);
        assert_eq!(status(AppError::Unauthorized).await, StatusCode::UNAUTHORIZED);
        assert_eq!(
            status(AppError::BadRequest("bad".into())).await,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            status(AppError::InternalServerError).await,
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[tokio::test]
    async fn into_response_includes_error_message_in_body() {
        let response = AppError::BadRequest("Invalid input".into()).into_response();
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["error"], "Invalid input");
    }
}
