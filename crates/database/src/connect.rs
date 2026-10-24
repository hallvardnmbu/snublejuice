use regex::Regex;
use rusqlite::{Connection, Error, OpenFlags, functions::FunctionFlags};
use std::{env, path::PathBuf, sync::Arc};

use shared::{errors::AppError, state::Database};

const APP_SCHEMA: &str = include_str!("schema.sql");

/// Reads the file locations from the environment and creates the app database if needed.
pub fn get_database(products_key: &str, app_key: &str) -> Result<Database, String> {
    let path = |key: &str| {
        env::var(key)
            .map(PathBuf::from)
            .map_err(|error| format!("No {key} path found: {error:?}"))
    };
    let db = Database {
        products: path(products_key)?,
        app: path(app_key)?,
    };

    let conn = Connection::open(&db.app).map_err(|error| error.to_string())?;
    // WAL is persistent: set once, concurrent readers then never block the writer.
    conn.pragma_update(None, "journal_mode", "WAL")
        .and_then(|_| conn.execute_batch(APP_SCHEMA))
        .map_err(|error| error.to_string())?;

    Ok(db)
}

/// `value REGEXP pattern`, for the store search.
pub fn add_regexp(conn: &Connection) -> rusqlite::Result<()> {
    conn.create_scalar_function(
        "regexp",
        2,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let regex: Arc<Regex> = ctx.get_or_create_aux(0, |pattern| {
                Regex::new(pattern.as_str()?)
                    .map_err(|error| Error::UserFunctionError(error.into()))
            })?;
            Ok(ctx
                .get_raw(1)
                .as_str()
                .is_ok_and(|text| regex.is_match(text)))
        },
    )
}

/// Opens a fresh read-only connection. This is deliberate: snublecron replaces the file with an
/// atomic rename, and a new connection per query always sees the latest file.
fn open_products(db: &Database) -> rusqlite::Result<Connection> {
    let conn = Connection::open_with_flags(
        &db.products,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.pragma_update(None, "mmap_size", 1_i64 << 29)?;
    add_regexp(&conn)?;
    Ok(conn)
}

fn open_app(db: &Database) -> rusqlite::Result<Connection> {
    let conn = Connection::open(&db.app)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.pragma_update(None, "foreign_keys", true)?;
    Ok(conn)
}

async fn blocking<T, F>(f: F) -> Result<T, AppError>
where
    F: FnOnce() -> rusqlite::Result<T> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|_| AppError::InternalServerError)?
        .map_err(AppError::from)
}

/// Runs `f` against the (read-only) products database.
pub async fn products<T, F>(db: &Database, f: F) -> Result<T, AppError>
where
    F: FnOnce(&Connection) -> rusqlite::Result<T> + Send + 'static,
    T: Send + 'static,
{
    let db = db.clone();
    blocking(move || f(&open_products(&db)?)).await
}

/// Runs `f` against the app database (users, sessions, visitors).
pub async fn app<T, F>(db: &Database, f: F) -> Result<T, AppError>
where
    F: FnOnce(&Connection) -> rusqlite::Result<T> + Send + 'static,
    T: Send + 'static,
{
    let db = db.clone();
    blocking(move || f(&open_app(&db)?)).await
}
