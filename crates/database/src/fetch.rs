use sqlx::{
    FromRow, SqlitePool,
    QueryBuilder,
    sqlite::SqliteArguments,
};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct TaxfreeInfo {
    pub id: i64,
    pub name: String,
    pub price: f64,
    pub volume: f64,
    pub alcohol: f64,
    pub url: String,
    pub stores: Option<Vec<String>>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct Product {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub country: Option<String>,
    pub price: Option<f64>,
    pub volume: f64,
    pub alcohol: f64,
    pub year: Option<i32>,
    pub prices: Option<Vec<f64>>,
    pub stores: Option<Vec<String>>,
    // Taxfree specific field
    #[serde(skip_serializing_if = "Option::is_none")]
    pub taxfree: Option<TaxfreeInfo>,
}

impl<'r> FromRow<'r, sqlx::sqlite::SqliteRow> for Product {
    fn from_row(row: &'r sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        
        // Basic Product Fields
        let id: i64 = row.try_get("id")?;
        let name: String = row.try_get("name")?;
        let url: String = row.try_get("url")?;
        let description: Option<String> = row.try_get("description")?;
        let category: Option<String> = row.try_get("category")?;
        let country: Option<String> = row.try_get("country")?;
        let price: Option<f64> = row.try_get("price")?;
        // Use default 0.0 if NULL to simplify, though schema says NOT NULL for some
        let volume: f64 = row.try_get("volume").unwrap_or(0.0);
        let alcohol: f64 = row.try_get("alcohol").unwrap_or(0.0);
        let year: Option<i32> = row.try_get("year")?;

        // JSON Parsing for Product
        let prices_json: Option<String> = row.try_get("prices")?;
        let prices = match prices_json {
            Some(s) if s == "null" => None,
            Some(s) => serde_json::from_str(&s).ok(),
            None => None,
        };

        let stores_json: Option<String> = row.try_get("stores")?;
        let stores = match stores_json {
            Some(s) if s == "null" => None,
            Some(s) => serde_json::from_str(&s).ok(),
            None => None,
        };

        // Taxfree Fields (if joined)
        // We check for a column that would only be present if joined, e.g., 't_id'
        let taxfree = if let Ok(t_id) = row.try_get::<i64, _>("t_id") {
             // Extract Taxfree fields
             let t_name: String = row.try_get("t_name")?;
             let t_price: f64 = row.try_get("t_price")?;
             let t_volume: f64 = row.try_get("t_volume")?;
             let t_alcohol: f64 = row.try_get("t_alcohol")?;
             let t_url: String = row.try_get("t_url")?;
             let t_stores_json: Option<String> = row.try_get("t_stores")?;
             let t_stores = match t_stores_json {
                 Some(s) if s == "null" => None,
                 Some(s) => serde_json::from_str(&s).ok(),
                 None => None,
             };

             Some(TaxfreeInfo {
                 id: t_id,
                 name: t_name,
                 price: t_price,
                 volume: t_volume,
                 alcohol: t_alcohol,
                 url: t_url,
                 stores: t_stores,
             })
        } else {
            None
        };

        Ok(Product {
            id,
            name,
            url,
            description,
            category,
            country,
            price,
            volume,
            alcohol,
            year,
            prices,
            stores,
            taxfree,
        })
    }
}

pub struct ProductFilter {
    pub search: Option<String>,
    pub category: Option<String>,
    pub country: Option<String>,
    pub store: Option<String>,
    pub storelike: Option<String>,
    pub orderable: Option<bool>,
    
    // Ranges
    pub price_min: Option<f64>,
    pub price_max: Option<f64>,
    pub volume_min: Option<f64>,
    pub volume_max: Option<f64>,
    pub alcohol_min: Option<f64>,
    pub alcohol_max: Option<f64>,
    pub year_min: Option<i32>,
    pub year_max: Option<i32>,

    pub taxfree: bool,

    pub limit: i32,
    pub offset: i32,
}

impl Default for ProductFilter {
    fn default() -> Self {
        Self {
            search: None,
            category: None,
            country: None,
            store: None,
            storelike: None,
            orderable: None,
            price_min: None,
            price_max: None,
            volume_min: None,
            volume_max: None,
            alcohol_min: None,
            alcohol_max: None,
            year_min: None,
            year_max: None,
            taxfree: false,
            limit: 50,
            offset: 0,
        }
    }
}

pub async fn get_products_filtered(pool: &SqlitePool, filter: ProductFilter) -> Result<Vec<Product>, sqlx::Error> {
    let mut query_builder: QueryBuilder<sqlx::Sqlite> = QueryBuilder::new(
        "SELECT 
            p.id, p.name, p.url, p.description, p.category, p.country, p.price, p.volume, p.alcohol, p.year, 
            CAST(p.prices AS TEXT) as prices, CAST(p.stores AS TEXT) as stores"
    );

    if filter.taxfree {
        query_builder.push(",
            t.id as t_id, t.name as t_name, t.price as t_price, t.volume as t_volume, t.alcohol as t_alcohol, t.url as t_url,
            CAST(t.stores AS TEXT) as t_stores
        ");
    }

    query_builder.push(" FROM products p ");

    // Joins
    if filter.search.is_some() {
        query_builder.push(" JOIN products_fts ON p.id = products_fts.rowid ");
    }

    if filter.taxfree {
        query_builder.push(" JOIN taxfree t ON p.id = t.id ");
    }

    query_builder.push(" WHERE 1=1 ");

    // Filters
    if let Some(search) = &filter.search {
        query_builder.push(" AND products_fts MATCH ");
        query_builder.push_bind(search);
    }

    if let Some(cat) = &filter.category {
        query_builder.push(" AND p.category = ");
        query_builder.push_bind(cat);
    }
    
    if let Some(country) = &filter.country {
        query_builder.push(" AND p.country = ");
        query_builder.push_bind(country);
    }

    // JSON array checks for stores are tricky in SQL. 
    // We can use `json_each` exists subquery or a LIKE hack if strict structure is known.
    // Legacy used $in via MongoDB.
    
    if let Some(store) = &filter.store {
         // This is expensive but accurate for exact match in array
         query_builder.push(" AND EXISTS (SELECT 1 FROM json_each(p.stores) WHERE value = ");
         query_builder.push_bind(store);
         query_builder.push(")");
    }
    
    if let Some(storelike) = &filter.storelike {
         // Fuzzy search in stores string rep (less accurate but faster/simpler)
         // p.stores is a JSON string e.g. ["A","B"]
         query_builder.push(" AND p.stores LIKE ");
         query_builder.push_bind(format!("%{}%", storelike));
    }
    
    if let Some(orderable) = filter.orderable {
        if orderable {
            query_builder.push(" AND p.orderable = 1 ");
        }
    }

    // Range Filters
    if let Some(min) = filter.price_min {
        query_builder.push(" AND p.price >= ");
        query_builder.push_bind(min);
    }
    if let Some(max) = filter.price_max {
        query_builder.push(" AND p.price <= ");
        query_builder.push_bind(max);
    }

    if let Some(min) = filter.volume_min {
        query_builder.push(" AND p.volume >= ");
        query_builder.push_bind(min);
    }
    if let Some(max) = filter.volume_max {
        query_builder.push(" AND p.volume <= ");
        query_builder.push_bind(max);
    }
    
    if let Some(min) = filter.alcohol_min {
        query_builder.push(" AND p.alcohol >= ");
        query_builder.push_bind(min);
    }
    if let Some(max) = filter.alcohol_max {
        query_builder.push(" AND p.alcohol <= ");
        query_builder.push_bind(max);
    }
    
    if let Some(min) = filter.year_min {
        query_builder.push(" AND p.year >= ");
        query_builder.push_bind(min);
    }
    if let Some(max) = filter.year_max {
        query_builder.push(" AND p.year <= ");
        query_builder.push_bind(max);
    }


    query_builder.push(" LIMIT ");
    query_builder.push_bind(filter.limit);
    
    query_builder.push(" OFFSET ");
    query_builder.push_bind(filter.offset);

    let query = query_builder.build_query_as::<Product>();
    query.fetch_all(pool).await
}

#[derive(serde::Serialize)]
pub struct StoresData {
    pub vinmonopolet: Vec<String>,
    pub taxfree: Vec<String>,
}

pub async fn get_unique_stores(pool: &SqlitePool) -> Result<StoresData, sqlx::Error> {
    let vp_rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT value FROM products, json_each(products.stores) WHERE stores IS NOT NULL AND json_valid(stores) ORDER BY value"
    )
    .fetch_all(pool)
    .await?;

    // Taxfree stores
    let tf_rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT value FROM taxfree, json_each(taxfree.stores) WHERE stores IS NOT NULL AND json_valid(stores) ORDER BY value"
    )
    .fetch_all(pool)
    .await?;
    
    Ok(StoresData {
        vinmonopolet: vp_rows.into_iter().map(|(s,)| s).collect(),
        taxfree: tf_rows.into_iter().map(|(s,)| s).collect(),
    })
}

pub async fn get_unique_countries(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(Option<String>,)> = sqlx::query_as(
        "SELECT DISTINCT country FROM products WHERE country IS NOT NULL ORDER BY country"
    )
    .fetch_all(pool)
    .await?;
    
    Ok(rows.into_iter().filter_map(|(s,)| s).collect())
}

