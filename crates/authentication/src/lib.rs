pub mod auth;
pub mod middle;

use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
};

use axum::{Router, extract::ConnectInfo, http::Request, routing::post};
use shared::state::AppState;
use tower_governor::{
    GovernorError, GovernorLayer, governor::GovernorConfigBuilder, key_extractor::KeyExtractor,
};

/// Keys on the `X-Real-IP` header set by nginx (which overwrites any client-supplied value),
/// falling back to the peer address. Unlike `X-Forwarded-For`, nginx does not let the client
/// control it. Only valid when the server is reachable solely through the proxy.
#[derive(Clone, Debug)]
struct RealIpKeyExtractor;

impl KeyExtractor for RealIpKeyExtractor {
    type Key = IpAddr;

    fn extract<T>(&self, req: &Request<T>) -> Result<Self::Key, GovernorError> {
        req.headers()
            .get("x-real-ip")
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.trim().parse().ok())
            .or_else(|| {
                req.extensions()
                    .get::<ConnectInfo<SocketAddr>>()
                    .map(|c| c.0.ip())
            })
            .ok_or(GovernorError::UnableToExtractKey)
    }
}

pub fn router() -> Router<AppState> {
    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(2)
            .burst_size(5)
            .key_extractor(RealIpKeyExtractor)
            .finish()
            .unwrap(),
    );

    Router::new()
        .route("/account/login", post(auth::login))
        .route("/account/signup", post(auth::signup))
        .layer(GovernorLayer::new(governor_conf))
}
