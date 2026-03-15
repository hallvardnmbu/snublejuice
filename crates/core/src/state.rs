use axum::extract::FromRef;
use mongodb::Database;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub jwt_secret: String,
}

impl FromRef<AppState> for Database {
    fn from_ref(state: &AppState) -> Self {
        state.db.clone()
    }
}
