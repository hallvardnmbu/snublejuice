use axum::extract::FromRef;
use std::path::PathBuf;

/// Locations of the two SQLite files.
///
/// `products` is written by snublecron and replaced atomically (rename); `app` is written by
/// this server only. Connections are opened per query, so a replaced `products` file is picked
/// up by the next request without any reload step.
#[derive(Clone)]
pub struct Database {
    pub products: PathBuf,
    pub app: PathBuf,
}

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
}

impl FromRef<AppState> for Database {
    fn from_ref(state: &AppState) -> Self {
        state.db.clone()
    }
}
