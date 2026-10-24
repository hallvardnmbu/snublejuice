use rusqlite::types::Value;
use serde::{Deserialize, Serialize};

use crate::models::User;
use crate::subdomain::Subdomain;

#[derive(Serialize, Deserialize, Debug)]
pub struct Parameters {
    pub page: Option<i64>,
    pub sort: Option<String>,
    pub ascending: Option<bool>,
    pub favourites: Option<bool>,
    pub category: Option<String>,
    pub country: Option<Vec<String>>,
    pub pair: Option<Vec<String>>,
    pub price: Option<f64>,
    pub cprice: Option<bool>,
    pub volume: Option<f64>,
    pub cvolume: Option<bool>,
    pub alcohol: Option<f64>,
    pub calcohol: Option<bool>,
    pub year: Option<i64>,
    pub cyear: Option<bool>,
    pub search: Option<String>,
    pub storelike: Option<String>,
    #[serde(rename = "store-vinmonopolet")]
    pub store_vinmonopolet: Option<Vec<String>>,
    #[serde(rename = "store-taxfree")]
    pub store_taxfree: Option<Vec<String>>,
}

/// A product query. Everything user-controlled is bound; the SQL text itself only ever contains
/// fixed column names. Columns (`price`, `tax_discount`, ...) are generated from the `doc` JSON
/// in snublecron's schema, and `products_fts` indexes the name.
#[derive(Clone)]
pub struct Sql {
    pub from: &'static str,
    pub filter: String,
    pub order: String,
    pub params: Vec<Value>,
}

#[derive(Default)]
struct Where {
    conditions: Vec<String>,
    params: Vec<Value>,
}

impl Where {
    fn add(&mut self, condition: &str, params: impl IntoIterator<Item = Value>) {
        self.conditions.push(condition.to_string());
        self.params.extend(params);
    }

    /// `EXISTS` over a JSON array in `doc` where an element satisfies `test`.
    fn any_element(&mut self, path: &str, test: &str, params: impl IntoIterator<Item = Value>) {
        self.add(
            &format!("EXISTS (SELECT 1 FROM json_each(doc, '{path}') WHERE {test})"),
            params,
        );
    }
}

fn placeholders(n: usize) -> String {
    vec!["?"; n].join(",")
}

fn texts(values: &[String]) -> impl Iterator<Item = Value> {
    values.iter().cloned().map(Value::from)
}

/// Every word becomes a prefix match, so "ries" finds "Riesling".
fn fts_query(search: &str) -> String {
    search
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(|word| format!("\"{word}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}

impl Parameters {
    pub fn is_empty(&self) -> bool {
        self.page.is_none()
            && self.sort.is_none()
            && self.ascending.is_none()
            && self.favourites.is_none()
            && self.category.is_none()
            && self.country.is_none()
            && self.pair.is_none()
            && self.price.is_none()
            && self.cprice.is_none()
            && self.volume.is_none()
            && self.cvolume.is_none()
            && self.alcohol.is_none()
            && self.calcohol.is_none()
            && self.year.is_none()
            && self.cyear.is_none()
            && self.search.is_none()
            && self.storelike.is_none()
            && self.store_vinmonopolet.is_none()
            && self.store_taxfree.is_none()
    }

    fn sort_column(&self, taxfree: bool) -> &'static str {
        match (self.sort.as_deref(), taxfree) {
            (Some("rating"), _) => "rating",
            (Some("alcohol"), _) => "alcohol",
            (Some("price"), false) => "price",
            (Some("price"), true) => "tax_price",
            (Some("literprice"), false) => "literprice",
            (Some("literprice"), true) => "tax_literprice",
            (Some("alcoholprice"), false) => "alcoholprice",
            (Some("alcoholprice"), true) => "tax_alcoholprice",
            (_, false) => "discount",
            (_, true) => "tax_discount",
        }
    }

    pub fn to_sql(&self, subdomain: &Subdomain, user: &Option<User>, prices_updated: bool) -> Sql {
        let mut w = Where::default();

        let favourites: bool = self.favourites.unwrap_or(false);
        let taxfree: bool = subdomain.is_taxfree();

        let (from, search_order) = match &self.search {
            Some(search) => {
                let query = fts_query(search);
                if query.is_empty() {
                    w.add("0", []);
                } else {
                    w.add("products_fts MATCH ?", [Value::from(query)]);
                }
                (
                    "products_fts f JOIN products p ON p.id = f.rowid",
                    Some("f.rank"),
                )
            }
            None => ("products p", None),
        };

        if taxfree {
            w.add(
                "json_type(doc, '$.taxfree.stores') = 'array' AND tax_valid = 1",
                [],
            );
        } else if prices_updated {
            // Only fully-updated products when the monthly update is complete.
            w.add("updated = 1", []);
        }

        // Must have a price.
        w.add("price > 0", []);

        if let Some(storelike) = &self.storelike {
            if !favourites && !taxfree {
                let pattern = format!(
                    r"(?i)(^|[^a-zæøåA-ZÆØÅ]){}([^a-zæøåA-ZÆØÅ]|$)",
                    regex::escape(storelike)
                );
                w.any_element("$.stores", "value REGEXP ?", [Value::from(pattern)]);
            }
        }

        if favourites && let Some(user) = user {
            w.add(
                "id IN (SELECT value FROM json_each(?))",
                [Value::from(serde_json::json!(user.favourites).to_string())],
            );
        }

        let sort_by = self.sort_column(taxfree);
        let direction = if self.ascending == Some(false) {
            "DESC"
        } else {
            "ASC"
        };
        let order = match search_order {
            Some(order) => order.to_string(),
            None => format!("{sort_by} {direction}, p.id"),
        };
        let done = |w: Where| Sql {
            from,
            filter: w.conditions.join(" AND "),
            order,
            params: w.params,
        };

        // Early return for searches.
        if self.search.is_some() {
            return done(w);
        }

        if let Some(category) = &self.category {
            if let Some(name) = category_name(category) {
                w.add("category = ?", [Value::from(name.to_string())]);
            }
        }

        if let Some(country) = self.country.as_ref().filter(|c| !c.is_empty()) {
            w.add(
                &format!("country IN ({})", placeholders(country.len())),
                texts(country),
            );
        }

        // Pair must match every selected dish; country and stores any of the selected.
        for pair in self.pair.iter().flatten() {
            w.any_element("$.pair", "value = ?", [Value::from(pair.clone())]);
        }

        // Availability.
        if let Some(store) = self.store_vinmonopolet.as_ref().filter(|s| !s.is_empty()) {
            if self.storelike.is_none() && !taxfree {
                let test = format!("value IN ({})", placeholders(store.len()));
                w.any_element("$.stores", &test, texts(store));
            }
        } else if let Some(store) = self.store_taxfree.as_ref().filter(|s| !s.is_empty()) {
            if taxfree {
                let test = format!("value IN ({})", placeholders(store.len()));
                w.any_element("$.taxfree.stores", &test, texts(store));
            }
        } else if self.storelike.is_none() && !favourites && !taxfree {
            w.add("orderable = 1", []);
        }

        // Numeric filters
        if let Some(limit) = self.price {
            let op = if self.cprice == Some(true) { "=" } else { "<=" };
            w.add(&format!("price {op} ?"), [Value::from(limit)]);
        }

        if let Some(limit) = self.volume {
            let op = if self.cvolume == Some(true) {
                "="
            } else {
                ">="
            };
            w.add(&format!("volume {op} ?"), [Value::from(limit)]);
        }

        // Always exclude non-alcoholic.
        w.add("alcohol > 0", []);
        if let Some(limit) = self.alcohol {
            let op = if self.calcohol == Some(true) {
                "="
            } else {
                ">="
            };
            w.add(&format!("alcohol {op} ?"), [Value::from(limit)]);
        }

        if let Some(limit) = self.year {
            let op = if self.cyear == Some(true) { "=" } else { "<=" };
            w.add(&format!("year {op} ?"), [Value::from(limit)]);
        }

        // Sort field must exist (and be positive, except for discounts).
        let min = if sort_by.ends_with("discount") {
            -100
        } else {
            0
        };
        w.add(&format!("{sort_by} > {min}"), []);

        done(w)
    }
}

fn category_name(slug: &str) -> Option<&'static str> {
    match slug {
        "alkoholfritt" => Some("Alkoholfritt"),
        "aromatisert" => Some("Aromatisert vin"),
        "brennevin" => Some("Brennevin"),
        "fruktvin" => Some("Fruktvin"),
        "hvitvin" => Some("Hvitvin"),
        "mjød" => Some("Mjød"),
        "musserende" => Some("Musserende vin"),
        "perlende" => Some("Perlende vin"),
        "rosévin" => Some("Rosévin"),
        "rødvin" => Some("Rødvin"),
        "sake" => Some("Sake"),
        "sider" => Some("Sider"),
        "sterkvin" => Some("Sterkvin"),
        "øl" => Some("Øl"),
        _ => None,
    }
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct DeleteRequest {
    pub password: String,
}

#[derive(Deserialize, Debug)]
pub struct SignupRequest {
    pub username: String,
    pub password: String,
    pub email: String,
    #[serde(default)]
    pub notify: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::User;

    fn text(value: &str) -> Value {
        Value::from(value.to_string())
    }

    fn empty_params() -> Parameters {
        Parameters {
            page: None,
            sort: None,
            ascending: None,
            favourites: None,
            category: None,
            country: None,
            pair: None,
            price: None,
            cprice: None,
            volume: None,
            cvolume: None,
            alcohol: None,
            calcohol: None,
            year: None,
            cyear: None,
            search: None,
            storelike: None,
            store_vinmonopolet: None,
            store_taxfree: None,
        }
    }

    fn test_user(favourites: Vec<i64>) -> User {
        User {
            user_id: 1,
            username: "test".to_string(),
            password: "hash".to_string(),
            email: "test@example.com".to_string(),
            favourites,
            notify: false,
        }
    }

    #[test]
    fn is_empty_detects_any_set_field() {
        assert!(empty_params().is_empty());
        let mut params = empty_params();
        params.page = Some(2);
        assert!(!params.is_empty());
    }

    #[test]
    fn includes_base_vinmonopolet_constraints() {
        let sql = empty_params().to_sql(&Subdomain::Vinmonopolet, &None, true);
        assert!(sql.filter.contains("updated = 1"));
        assert!(sql.filter.contains("price > 0"));
        assert!(sql.filter.contains("orderable = 1"));
        assert!(sql.filter.contains("discount > -100"));
        assert_eq!(sql.order, "discount ASC, p.id");
        assert!(sql.params.is_empty());

        let sql = empty_params().to_sql(&Subdomain::Vinmonopolet, &None, false);
        assert!(!sql.filter.contains("updated = 1"));
    }

    #[test]
    fn includes_taxfree_constraints() {
        let sql = empty_params().to_sql(&Subdomain::Taxfree, &None, true);
        assert!(sql.filter.contains("tax_valid = 1"));
        assert!(sql.filter.contains("tax_discount > -100"));
        assert!(!sql.filter.contains("updated"));
        assert!(!sql.filter.contains("orderable"));
        assert_eq!(sql.order, "tax_discount ASC, p.id");
    }

    #[test]
    fn maps_category_slug_and_country() {
        let mut params = empty_params();
        params.category = Some("rødvin".to_string());
        params.country = Some(vec!["Frankrike".to_string(), "Italia".to_string()]);
        let sql = params.to_sql(&Subdomain::Vinmonopolet, &None, true);
        assert!(sql.filter.contains("category = ?"));
        assert!(sql.filter.contains("country IN (?,?)"));
        assert_eq!(
            sql.params,
            vec![text("Rødvin"), text("Frankrike"), text("Italia")]
        );
    }

    #[test]
    fn requires_all_selected_pairings() {
        let mut params = empty_params();
        params.pair = Some(vec!["Fisk".to_string(), "Skalldyr".to_string()]);
        let sql = params.to_sql(&Subdomain::Vinmonopolet, &None, true);
        assert_eq!(sql.filter.matches("json_each(doc, '$.pair')").count(), 2);

        params.pair = Some(vec![]);
        params.country = Some(vec![]);
        params.store_vinmonopolet = Some(vec![]);
        let sql = params.to_sql(&Subdomain::Vinmonopolet, &None, true);
        assert!(!sql.filter.contains("pair"));
        assert!(!sql.filter.contains("country"));
        assert!(!sql.filter.contains("stores"));
        assert!(sql.filter.contains("orderable = 1"));
    }

    #[test]
    fn search_skips_category_filters_and_orders_by_rank() {
        let mut params = empty_params();
        params.search = Some("Cabernet  sauv".to_string());
        params.category = Some("rødvin".to_string());
        let sql = params.to_sql(&Subdomain::Vinmonopolet, &None, true);
        assert!(sql.filter.starts_with("products_fts MATCH ?"));
        assert!(!sql.filter.contains("category"));
        assert_eq!(sql.order, "f.rank");
        assert_eq!(sql.params, vec![text("\"Cabernet\"* \"sauv\"*")]);
    }

    #[test]
    fn search_without_words_matches_nothing() {
        let mut params = empty_params();
        params.search = Some(" \" - ".to_string());
        let sql = params.to_sql(&Subdomain::Vinmonopolet, &None, true);
        assert!(sql.filter.starts_with("0 AND"));
        assert!(sql.params.is_empty());
    }

    #[test]
    fn favourites_restrict_to_user_indices() {
        let mut params = empty_params();
        params.favourites = Some(true);
        let sql = params.to_sql(
            &Subdomain::Vinmonopolet,
            &Some(test_user(vec![1, 2, 3])),
            true,
        );
        assert!(
            sql.filter
                .contains("id IN (SELECT value FROM json_each(?))")
        );
        assert_eq!(sql.params, vec![text("[1,2,3]")]);
        assert!(!sql.filter.contains("orderable"));
    }

    #[test]
    fn sort_is_whitelisted_and_directional() {
        let mut params = empty_params();
        params.sort = Some("price; DROP TABLE products".to_string());
        params.ascending = Some(false);
        let sql = params.to_sql(&Subdomain::Vinmonopolet, &None, true);
        assert_eq!(sql.order, "discount DESC, p.id");

        params.sort = Some("literprice".to_string());
        assert_eq!(
            params.to_sql(&Subdomain::Taxfree, &None, true).order,
            "tax_literprice DESC, p.id"
        );
        params.sort = Some("alcohol".to_string());
        assert_eq!(
            params.to_sql(&Subdomain::Taxfree, &None, true).order,
            "alcohol DESC, p.id"
        );
    }
}
