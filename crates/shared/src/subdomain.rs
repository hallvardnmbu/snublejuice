use axum::{extract::FromRequestParts, http::request::Parts};

use crate::errors::AppError;

#[derive(Debug)]
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;

    #[test]
    fn name_and_is_taxfree() {
        assert_eq!(Subdomain::Vinmonopolet.name(), "vinmonopolet");
        assert_eq!(Subdomain::Taxfree.name(), "taxfree");
        assert_eq!(Subdomain::Landing.name(), "landing");
        assert!(!Subdomain::Vinmonopolet.is_taxfree());
        assert!(Subdomain::Taxfree.is_taxfree());
        assert!(!Subdomain::Landing.is_taxfree());
    }

    #[test]
    fn landing_url_from_host_strips_subdomain() {
        assert_eq!(
            landing_url_from_host("vinmonopolet.snublejuice.no"),
            "//snublejuice.no"
        );
        assert_eq!(
            landing_url_from_host("taxfree.snublejuice.localhost:3000"),
            "//snublejuice.localhost:3000"
        );
        assert_eq!(landing_url_from_host("snublejuice.no"), "//no");
    }

    #[tokio::test]
    async fn from_request_parts_parses_host_header() {
        async fn extract(host: &str) -> Subdomain {
            let mut parts = Request::builder()
                .header("host", host)
                .body(Body::empty())
                .unwrap()
                .into_parts()
                .0;
            Subdomain::from_request_parts(&mut parts, &()).await.unwrap()
        }

        assert!(matches!(
            extract("vinmonopolet.snublejuice.no").await,
            Subdomain::Vinmonopolet
        ));
        assert!(matches!(
            extract("TAXFREE.snublejuice.no").await,
            Subdomain::Taxfree
        ));
        assert!(matches!(
            extract("snublejuice.no").await,
            Subdomain::Landing
        ));
    }

    #[tokio::test]
    async fn from_request_parts_rejects_missing_host() {
        let mut parts = Request::builder()
            .body(Body::empty())
            .unwrap()
            .into_parts()
            .0;
        let err = Subdomain::from_request_parts(&mut parts, &())
            .await
            .err()
            .unwrap();
        assert!(matches!(err, AppError::BadRequest(_)));
    }
}
