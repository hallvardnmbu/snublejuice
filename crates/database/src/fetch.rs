use sqlx::{
    FromRow, Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use std::str::FromStr;

pub fn database() {
    println!("Hello from database!");
}

#[derive(Debug)]
#[allow(dead_code)]
struct Product {
    id: i64,
    name: String,
    url: String,
    description: Option<String>,
    price: Option<f64>,
    prices: Option<Vec<f64>>,
    stores: Option<Vec<String>>,
}

// Manually implement FromRow to handle the weird JSON/BLOB data
impl<'r> FromRow<'r, sqlx::sqlite::SqliteRow> for Product {
    fn from_row(row: &'r sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        let id: i64 = row.try_get("id")?;
        let name: String = row.try_get("name")?;
        let url: String = row.try_get("url")?;
        let description: Option<String> = row.try_get("description")?;
        let price: Option<f64> = row.try_get("price")?;

        // Handle 'prices'
        let prices_json: Option<String> = row.try_get("prices")?;
        let prices = match prices_json {
            Some(s) if s == "null" => None,
            Some(s) => serde_json::from_str(&s).ok(), // Ignore parse errors for robustness
            None => None,
        };

        // Handle 'stores'
        let stores_json: Option<String> = row.try_get("stores")?;
        let stores = match stores_json {
            Some(s) if s == "null" => None,
            Some(s) => serde_json::from_str(&s).ok(),
            None => None,
        };

        Ok(Product {
            id,
            name,
            url,
            description,
            price,
            prices,
            stores,
        })
    }
}

#[tokio::main]
pub async fn process() -> Result<(), sqlx::Error> {
    let db_url = std::env::var("DATABASE").unwrap_or("sqlite:snublejuice.db".to_string());

    // Configure connection options (enable WAL for concurrency)
    let connection_options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connection_options)
        .await?;

    println!("Connected to database: {} (WAL mode enabled)", db_url);

    // Example 1: List some products
    println!("--- Recent Products ---");
    let products = sqlx::query_as::<_, Product>(
        "SELECT id, name, url, description, price, CAST(prices AS TEXT) as prices, CAST(stores AS TEXT) as stores FROM products LIMIT 3"
    )
    .fetch_all(&pool)
    .await?;

    for p in products {
        println!("- {}", p.name);
        if let Some(stores) = &p.stores {
            println!("  Stores: {} stores", stores.len());
        }
    }

    // Example 2: Search with FTS5
    let search_term = "Baron";
    println!("\n--- Search Results for '{}' ---", search_term);
    let found = search_products(&pool, search_term).await?;

    for p in found {
        println!("- {} (Price: {:?})", p.name, p.price);
        if let Some(prices) = &p.prices {
            println!("  History: {} prices", prices.len());
        }
    }

    Ok(())
}

// Search function using FTS5
async fn search_products(pool: &SqlitePool, query: &str) -> Result<Vec<Product>, sqlx::Error> {
    let sql = r#"
        SELECT p.id, p.name, p.url, p.description, p.price, CAST(p.prices AS TEXT) as prices, CAST(p.stores AS TEXT) as stores
        FROM products p
        JOIN products_fts ON p.id = products_fts.rowid
        WHERE products_fts MATCH ?
        ORDER BY rank
        LIMIT 10
    "#;

    sqlx::query_as::<_, Product>(sql)
        .bind(query)
        .fetch_all(pool)
        .await
}
