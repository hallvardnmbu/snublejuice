use rusqlite::{Connection, params_from_iter};
use shared::{
    models::{PRODUCTS_PER_PAGE, Product},
    query::Sql,
    state::Database,
};

use crate::connect;

fn max_page_from_count(count: u64) -> u64 {
    count / PRODUCTS_PER_PAGE as u64 + 1
}

fn select_docs(conn: &Connection, sql: &Sql, page: i64) -> rusqlite::Result<Vec<String>> {
    let offset = (page.max(1) - 1) * PRODUCTS_PER_PAGE;
    conn.prepare(&format!(
        "SELECT p.doc FROM {} WHERE {} ORDER BY {} LIMIT {PRODUCTS_PER_PAGE} OFFSET {offset}",
        sql.from, sql.filter, sql.order
    ))?
    .query_map(params_from_iter(&sql.params), |row| row.get(0))?
    .collect()
}

fn count(conn: &Connection, sql: &Sql) -> rusqlite::Result<u64> {
    let count: i64 = conn.query_row(
        &format!("SELECT count(*) FROM {} WHERE {}", sql.from, sql.filter),
        params_from_iter(&sql.params),
        |row| row.get(0),
    )?;
    Ok(count as u64)
}

pub async fn get_products(db: &Database, sql: &Sql, page: i64) -> Vec<Product> {
    let sql = sql.clone();
    match connect::products(db, move |conn| select_docs(conn, &sql, page)).await {
        Ok(docs) => docs
            .iter()
            .filter_map(|doc| serde_json::from_str(doc).ok())
            .collect(),
        Err(error) => {
            eprintln!("Product query error: {error:?}");
            vec![]
        }
    }
}

pub async fn get_max_page(db: &Database, sql: &Sql) -> u64 {
    let sql = sql.clone();
    match connect::products(db, move |conn| count(conn, &sql)).await {
        Ok(count) => max_page_from_count(count),
        Err(_) => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metadata::{distinct, prices_updated};
    use shared::{models::User, query::Parameters, subdomain::Subdomain};

    // Mirrors snublecron's `utilities/schema.sql`; the generated columns are the contract.
    const SCHEMA: &str = "
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            doc TEXT NOT NULL,
            name TEXT AS (doc ->> '$.name'),
            price REAL AS (doc ->> '$.price'),
            discount REAL AS (doc ->> '$.discount'),
            literprice REAL AS (doc ->> '$.literprice'),
            alcoholprice REAL AS (doc ->> '$.alcoholprice'),
            volume REAL AS (doc ->> '$.volume'),
            alcohol REAL AS (doc ->> '$.alcohol'),
            year INTEGER AS (doc ->> '$.year'),
            category TEXT AS (doc ->> '$.category'),
            country TEXT AS (doc ->> '$.country'),
            orderable INTEGER AS (doc ->> '$.orderable'),
            updated INTEGER AS (doc ->> '$.updated'),
            rating INTEGER AS (doc ->> '$.aperitif.points'),
            tax_valid INTEGER AS (doc ->> '$.taxfree.valid'),
            tax_price REAL AS (doc ->> '$.taxfree.price'),
            tax_discount REAL AS (doc ->> '$.taxfree.discount'),
            tax_literprice REAL AS (doc ->> '$.taxfree.literprice'),
            tax_alcoholprice REAL AS (doc ->> '$.taxfree.alcoholprice')
        );
        CREATE VIRTUAL TABLE products_fts USING fts5(
            name, content = 'products', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
        );
        CREATE TABLE metadata (id TEXT PRIMARY KEY, doc TEXT NOT NULL);";

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        connect::add_regexp(&conn).unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        let products = [
            (
                1,
                "Riesling Kabinett",
                "Hvitvin",
                "Tyskland",
                -20.0,
                12.0,
                "Oslo, Ullevål",
                Some(70.0),
            ),
            (
                2,
                "Cabernet Sauvignon",
                "Rødvin",
                "Frankrike",
                -5.0,
                13.5,
                "Bergen",
                None,
            ),
            (
                3,
                "Château Rouge",
                "Rødvin",
                "Frankrike",
                -50.0,
                14.0,
                "Åsane",
                None,
            ),
            (
                4,
                "Dry Riesling",
                "Hvitvin",
                "Tyskland",
                10.0,
                11.0,
                "Oslo",
                None,
            ),
        ];
        for (id, name, category, country, discount, alcohol, store, tax) in products {
            let taxfree = tax.map_or(String::new(), |price| {
                format!(r#","taxfree":{{"valid":true,"url":"t","price":{price},"discount":-30,"stores":["Oslo, Avgang"]}}"#)
            });
            conn.execute(
                "INSERT INTO products (id, doc) VALUES (?1, ?2)",
                (id, format!(
                    r#"{{"index":{id},"name":"{name}","category":"{category}","country":"{country}",
                    "price":100,"prices":[],"url":"u","literprice":1,"discount":{discount},"volume":75,"alcohol":{alcohol},"orderable":true,
                    "updated":true,"stores":["{store}"],"pair":["Fisk"]{taxfree}}}"#
                )),
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO products_fts (products_fts) VALUES ('rebuild')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO metadata VALUES ('stock', '{\"prices\":{\"vinmonopolet\":true,\"taxfree\":false}}')",
            [],
        )
        .unwrap();
        conn
    }

    fn params() -> Parameters {
        serde_json::from_str("{}").unwrap()
    }

    fn ids(conn: &Connection, parameters: Parameters, subdomain: Subdomain) -> Vec<i64> {
        let sql = parameters.to_sql(&subdomain, &None, true);
        select_docs(conn, &sql, 1)
            .unwrap()
            .iter()
            .map(|doc| serde_json::from_str::<Product>(doc).unwrap().index as i64)
            .collect()
    }

    #[test]
    fn default_listing_is_sorted_by_discount() {
        assert_eq!(
            ids(&conn(), params(), Subdomain::Vinmonopolet),
            vec![3, 1, 2, 4]
        );
    }

    #[test]
    fn search_matches_prefixes_and_ignores_diacritics() {
        let conn = conn();
        let search = |text: &str| {
            let mut p = params();
            p.search = Some(text.to_string());
            ids(&conn, p, Subdomain::Vinmonopolet)
        };
        let mut found = search("ries");
        found.sort();
        assert_eq!(found, vec![1, 4]);
        assert_eq!(search("chateau rou"), vec![3]);
        assert_eq!(search("riesling kab"), vec![1]);
        assert!(search("xyz").is_empty());
    }

    #[test]
    fn filters_combine() {
        let conn = conn();
        let mut p = params();
        p.country = Some(vec!["Frankrike".into()]);
        p.pair = Some(vec!["Fisk".into()]);
        p.price = Some(100.0);
        assert_eq!(ids(&conn, p, Subdomain::Vinmonopolet), vec![3, 2]);

        let mut p = params();
        p.storelike = Some("oslo".into());
        assert_eq!(ids(&conn, p, Subdomain::Vinmonopolet), vec![1, 4]);

        let mut p = params();
        p.store_vinmonopolet = Some(vec!["Bergen".into(), "Åsane".into()]);
        assert_eq!(ids(&conn, p, Subdomain::Vinmonopolet), vec![3, 2]);
    }

    #[test]
    fn taxfree_lists_only_valid_matches() {
        let conn = conn();
        assert_eq!(ids(&conn, params(), Subdomain::Taxfree), vec![1]);
        let mut p = params();
        p.store_taxfree = Some(vec!["Bergen, Avgang".into()]);
        assert!(ids(&conn, p, Subdomain::Taxfree).is_empty());
    }

    #[test]
    fn favourites_are_restricted_to_the_user() {
        let conn = conn();
        let mut p = params();
        p.favourites = Some(true);
        let user = User {
            user_id: 1,
            username: String::new(),
            password: String::new(),
            email: String::new(),
            favourites: vec![2, 4],
            notify: false,
        };
        let sql = p.to_sql(&Subdomain::Vinmonopolet, &Some(user), true);
        assert_eq!(count(&conn, &sql).unwrap(), 2);
    }

    #[test]
    fn counts_for_pagination() {
        let conn = conn();
        let sql = params().to_sql(&Subdomain::Vinmonopolet, &None, true);
        assert_eq!(count(&conn, &sql).unwrap(), 4);
        assert_eq!(max_page_from_count(0), 1);
        assert_eq!(max_page_from_count(PRODUCTS_PER_PAGE as u64), 2);
    }

    #[test]
    fn metadata_and_distinct_values() {
        let conn = conn();
        assert!(prices_updated(&conn, "vinmonopolet").unwrap());
        assert!(!prices_updated(&conn, "taxfree").unwrap());
        assert!(!prices_updated(&conn, "landing").unwrap());

        let distinct = |path, taxfree| distinct(&conn, path, taxfree).unwrap();
        assert_eq!(distinct("$.country", false), vec!["Frankrike", "Tyskland"]);
        assert_eq!(distinct("$.country", true), vec!["Tyskland"]);
        assert_eq!(distinct("$.stores", false).len(), 4);
    }
}
