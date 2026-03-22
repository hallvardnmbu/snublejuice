use axum::{extract::FromRequestParts, http::request::Parts};

use crate::errors::AppError;

pub enum Subdomain {
    Landing,
    Vinmonopolet,
    Taxfree,
}

impl Subdomain {
    pub fn is_taxfree(&self) -> bool {
        matches!(self, Self::Taxfree)
    }
}

impl<S> FromRequestParts<S> for Subdomain
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let host = parts
            .headers
            .get("host")
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| AppError::BadRequest("Missing Host header".to_string()))?;

        let subdomain = host.split('.').next().unwrap_or("");
        match subdomain.to_lowercase().as_str() {
            "vinmonopolet" => Ok(Subdomain::Vinmonopolet),
            "taxfree" => Ok(Subdomain::Taxfree),
            _ => Ok(Subdomain::Landing),
        }
    }
}
