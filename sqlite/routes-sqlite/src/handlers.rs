use axum::{
    extract::{Query, State},
    Json,
};
use database::{fetch::{self, ProductFilter}, Product};
use serde::Deserialize;
use sqlx::SqlitePool;

#[derive(Deserialize)]
pub struct SearchParams {
    q: Option<String>,
    
    // New Filters
    category: Option<String>,
    country: Option<String>,
    store: Option<String>,
    storelike: Option<String>,
    orderable: Option<bool>,
    
    min_price: Option<f64>,
    max_price: Option<f64>,
    min_volume: Option<f64>,
    max_volume: Option<f64>,
    min_alcohol: Option<f64>,
    max_alcohol: Option<f64>,
    min_year: Option<i32>,
    max_year: Option<i32>,

    taxfree: Option<bool>,

    limit: Option<i32>,
    offset: Option<i32>,
}

pub async fn list_products(
    State(pool): State<SqlitePool>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Product>>, String> {
    let filter = ProductFilter {
        search: params.q,
        category: params.category,
        country: params.country,
        store: params.store,
        storelike: params.storelike,
        orderable: params.orderable,
        
        price_min: params.min_price,
        price_max: params.max_price,
        volume_min: params.min_volume,
        volume_max: params.max_volume,
        alcohol_min: params.min_alcohol,
        alcohol_max: params.max_alcohol,
        year_min: params.min_year,
        year_max: params.max_year,

        taxfree: params.taxfree.unwrap_or(false),

        limit: params.limit.unwrap_or(50),
        offset: params.offset.unwrap_or(0),
    };

    match fetch::get_products_filtered(&pool, filter).await {
        Ok(products) => Ok(Json(products)),
        Err(e) => Err(format!("Database error: {}", e)),
    }
}

pub async fn list_stores(
    State(pool): State<SqlitePool>,
) -> Result<Json<fetch::StoresData>, String> {
    match fetch::get_unique_stores(&pool).await {
        Ok(stores) => Ok(Json(stores)),
        Err(e) => Err(format!("Database error: {}", e)),
    }
}

pub async fn list_countries(
    State(pool): State<SqlitePool>,
) -> Result<Json<Vec<String>>, String> {
    match fetch::get_unique_countries(&pool).await {
        Ok(countries) => Ok(Json(countries)),
        Err(e) => Err(format!("Database error: {}", e)),
    }
}


