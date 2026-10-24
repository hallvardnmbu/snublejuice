use rusqlite::{Connection, OptionalExtension, params};
use shared::state::Database;

use crate::connect;

pub async fn increment_visitor(db: &Database, month: &str, subdomain: &str, fresh: bool) {
    let column = if fresh { "fresh" } else { "newpage" };
    let (month, subdomain) = (month.to_string(), subdomain.to_string());
    let _ = connect::app(db, move |conn| {
        conn.execute(
            &format!(
                "INSERT INTO visitors (month, subdomain, {column}) VALUES (?1, ?2, 1)
                 ON CONFLICT (month, subdomain) DO UPDATE SET {column} = {column} + 1"
            ),
            params![month, subdomain],
        )
    })
    .await;
}

pub(crate) fn prices_updated(conn: &Connection, subdomain: &str) -> rusqlite::Result<bool> {
    Ok(conn
        .query_row(
            "SELECT json_extract(doc, ?1) FROM metadata WHERE id = 'stock'",
            [format!("$.prices.{subdomain}")],
            |row| row.get::<_, Option<bool>>(0),
        )
        .optional()?
        .flatten()
        .unwrap_or(false))
}

pub async fn get_prices_updated(db: &Database, subdomain: &str) -> bool {
    let subdomain = subdomain.to_string();
    connect::products(db, move |conn| prices_updated(conn, &subdomain))
        .await
        .unwrap_or(false)
}

pub(crate) fn distinct(
    conn: &Connection,
    field: &str,
    taxfree: bool,
) -> rusqlite::Result<Vec<String>> {
    conn.prepare("SELECT value FROM facets WHERE taxfree = ?1 AND field = ?2 ORDER BY value")?
        .query_map(params![taxfree, field], |row| row.get(0))?
        .collect()
}

/// The dropdown values (`stores`, `country` or `pair`) that snublecron collected when publishing.
pub async fn get_distinct(db: &Database, field: &'static str, is_taxfree: bool) -> Vec<String> {
    connect::products(db, move |conn| distinct(conn, field, is_taxfree))
        .await
        .unwrap_or_else(|error| {
            eprintln!("No results found: {error:?}");
            vec![]
        })
}
