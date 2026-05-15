use axum::extract::FromRef;
use mongodb::Database;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
}

impl FromRef<AppState> for Database {
    fn from_ref(state: &AppState) -> Self {
        state.db.clone()
    }
}
