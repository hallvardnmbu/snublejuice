pub mod auth;
pub mod middle;

use std::sync::Arc;

use axum::{Router, routing::post};
use shared::state::AppState;
use tower_governor::{
    GovernorLayer, governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor,
};

pub fn router() -> Router<AppState> {
    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(2)
            .burst_size(5)
            .key_extractor(SmartIpKeyExtractor)
            .finish()
            .unwrap(),
    );

    Router::new()
        .route("/account/login", post(auth::login))
        .route("/account/signup", post(auth::signup))
        .layer(GovernorLayer::new(governor_conf))
}
