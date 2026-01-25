use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::str::FromStr;
use database::fetch::{ProductFilter, get_products_filtered, get_unique_stores, get_unique_countries, Product};
use database::users;

async fn setup_db() -> Pool<Sqlite> {
    // In-memory DB
    let connection_options = SqliteConnectOptions::from_str("sqlite::memory:").unwrap()
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .connect_with(connection_options)
        .await
        .expect("Failed to create pool");

    // Schema
    sqlx::query(r#"
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT,
        category TEXT,
        country TEXT,
        price REAL,
        volume REAL NOT NULL,
        alcohol REAL NOT NULL,
        year INTEGER,
        prices TEXT,
        stores TEXT,
        orderable BOOLEAN DEFAULT 0
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
        name, description, category, country, 
        content='products', content_rowid='id'
    );
    CREATE TABLE IF NOT EXISTS taxfree (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL,
        volume REAL,
        alcohol REAL,
        url TEXT,
        stores TEXT,
        FOREIGN KEY(id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT,
        notify BOOLEAN,
        favourites TEXT
    );
    "#).execute(&pool).await.expect("Failed to create schema");

    pool
}

async fn insert_product(pool: &Pool<Sqlite>, id: i64, name: &str, price: f64, category: &str, 
                        // Optional args simulated via defaults or explicit params? 
                        // Let's take struct or extended params
                        country: Option<&str>, volume: f64, alcohol: f64, year: Option<i32>, stores: &str) {
    sqlx::query(r#"
        INSERT INTO products (id, name, url, category, country, price, volume, alcohol, year, stores, orderable, prices)
        VALUES (?, ?, 'http://example.com', ?, ?, ?, ?, ?, ?, ?, 1, '[]')
    "#)
    .bind(id).bind(name).bind(category).bind(country).bind(price)
    .bind(volume).bind(alcohol).bind(year).bind(stores)
    .execute(pool).await.expect("Failed to insert product");

    sqlx::query("INSERT INTO products_fts(products_fts) VALUES('rebuild')")
        .execute(pool).await.expect("FTS rebuild failed");
}

// --- Product Tests ---

#[tokio::test]
async fn test_get_products_filtered_basic() {
    let pool = setup_db().await;
    insert_product(&pool, 1, "Red Wine A", 150.0, "Rødvin", Some("France"), 0.75, 12.0, Some(2020), "[]").await;
    insert_product(&pool, 2, "White Wine B", 200.0, "Hvitvin", Some("Italy"), 0.75, 11.0, Some(2021), "[]").await;

    let mut filter = ProductFilter::default();
    filter.category = Some("Rødvin".to_string());
    
    let res = get_products_filtered(&pool, filter).await.expect("Query failed");
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].name, "Red Wine A");
}

#[tokio::test]
async fn test_comprehensive_filters() {
    let pool = setup_db().await;
    // Product 1: Strong, Old, Expensive
    insert_product(&pool, 1, "Strong Old", 1000.0, "Spirit", Some("Scotland"), 0.70, 40.0, Some(1990), "[]").await;
    // Product 2: Weak, New, Cheap
    insert_product(&pool, 2, "Weak New", 100.0, "Beer", Some("Norway"), 0.50, 4.5, Some(2023), "[]").await;

    // Test Alcohol
    let mut f = ProductFilter::default();
    f.alcohol_min = Some(10.0);
    let res = get_products_filtered(&pool, f).await.unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].name, "Strong Old");

    // Test Volume
    let mut f = ProductFilter::default();
    f.volume_max = Some(0.60);
    let res = get_products_filtered(&pool, f).await.unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].name, "Weak New");

    // Test Year
    let mut f = ProductFilter::default();
    f.year_min = Some(2000);
    let res = get_products_filtered(&pool, f).await.unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].name, "Weak New");

    // Test Country
    let mut f = ProductFilter::default();
    f.country = Some("Scotland".to_string());
    let res = get_products_filtered(&pool, f).await.unwrap();
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].name, "Strong Old");
}

#[tokio::test]
async fn test_store_filters() {
    let pool = setup_db().await;
    // JSON arrays
    insert_product(&pool, 1, "Oslo Item", 200.0, "X", None, 0.75, 12.0, None, "[\"Oslo City\", \"Bergen\"]").await;
    insert_product(&pool, 2, "Bergen Item", 200.0, "X", None, 0.75, 12.0, None, "[\"Bergen\", \"Trondheim\"]").await;

    // Exact Match (via json_each logic)
    let mut f = ProductFilter::default();
    f.store = Some("Oslo City".to_string());
    let res = get_products_filtered(&pool, f).await.expect("Store query failed");
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].name, "Oslo Item");

    // Fuzzy Match
    let mut f = ProductFilter::default();
    f.storelike = Some("Trond".to_string()); // Should match Trondheim
    let res = get_products_filtered(&pool, f).await.expect("Storelike query failed");
    assert_eq!(res.len(), 1);
    assert_eq!(res[0].name, "Bergen Item");
}

#[tokio::test]
async fn test_metadata() {
    let pool = setup_db().await;
    insert_product(&pool, 1, "A", 1.0, "C", Some("Norway"), 0.7, 10.0, None, "[\"Store A\"]").await;
    insert_product(&pool, 2, "B", 1.0, "C", Some("Sweden"), 0.7, 10.0, None, "[\"Store B\"]").await;
    
    // Test Countries
    let countries = get_unique_countries(&pool).await.unwrap();
    assert!(countries.contains(&"Norway".to_string()));
    assert!(countries.contains(&"Sweden".to_string()));

    // Test Stores (requires taxfree table too usually, but let's check basic mapping)
    // We didn't insert taxfree data, so taxfree list should be empty.
    let stores = get_unique_stores(&pool).await.unwrap();
    assert!(stores.vinmonopolet.contains(&"Store A".to_string()));
    assert!(stores.vinmonopolet.contains(&"Store B".to_string()));
}

// --- User Tests ---

#[tokio::test]
async fn test_user_crud() {
    let pool = setup_db().await;
    
    // Create
    users::create_user(&pool, "testuser", "test@test.com", "hash", true).await.expect("Create failed");
    
    // Get
    let user = users::get_user_by_username(&pool, "testuser").await.expect("Get failed").unwrap();
    assert_eq!(user.email.unwrap(), "test@test.com");
    assert!(user.notify.unwrap());

    // Update Notification
    users::update_notification(&pool, "testuser", false).await.expect("Update failed");
    let user = users::get_user_by_username(&pool, "testuser").await.unwrap().unwrap();
    assert!(!user.notify.unwrap());

    // Delete
    users::delete_user(&pool, "testuser").await.expect("Delete failed");
    let user = users::get_user_by_username(&pool, "testuser").await.unwrap();
    assert!(user.is_none());
}

#[tokio::test]
async fn test_user_favourites() {
    let pool = setup_db().await;
    users::create_user(&pool, "favuser", "fav@test.com", "hash", false).await.unwrap();
    
    // Toggle ON
    let added = users::toggle_favourite(&pool, "favuser", 100).await.expect("Toggle 1 failed");
    assert!(added);
    
    let user = users::get_user_by_username(&pool, "favuser").await.unwrap().unwrap();
    // Manually parse favourites to verify 
    // (users helper to_data handles this, but here we see raw struct string)
    assert_eq!(user.favourites.as_ref().unwrap(), "[100]");

    // Toggle OFF
    let added = users::toggle_favourite(&pool, "favuser", 100).await.expect("Toggle 2 failed");
    assert!(!added);

    let user = users::get_user_by_username(&pool, "favuser").await.unwrap().unwrap();
    assert_eq!(user.favourites.as_ref().unwrap(), "[]");
}
