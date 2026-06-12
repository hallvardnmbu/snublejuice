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

    pub fn name(&self) -> &str {
        match self {
            Self::Vinmonopolet => "vinmonopolet",
            Self::Taxfree => "taxfree",
            Self::Landing => "landing",
        }
    }
}

pub fn landing_url_from_host(host: &str) -> String {
    let (hostname, port) = host
        .split_once(':')
        .map(|(h, p)| (h, Some(p)))
        .unwrap_or((host, None));
    let domain = hostname.split('.').skip(1).collect::<Vec<_>>().join(".");
    match port {
        Some(p) => format!("//{domain}:{p}"),
        None => format!("//{domain}"),
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
