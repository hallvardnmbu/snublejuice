use mongodb::{
    bson::{Document, doc},
    options::FindOptions,
};
use serde::Deserialize;

use crate::models::PRODUCTS_PER_PAGE;
use crate::subdomain::Subdomain;

#[derive(Deserialize, Debug)]
pub struct Parameters {
    pub page: Option<i64>,
    pub favourites: Option<String>,
    pub sort: Option<String>,
    pub ascending: Option<String>,
    pub category: Option<String>,
    pub country: Option<String>,
    pub price: Option<f64>,
    pub cprice: Option<String>,
    pub volume: Option<f64>,
    pub cvolume: Option<String>,
    pub alcohol: Option<f64>,
    pub calcohol: Option<String>,
    pub year: Option<i64>,
    pub cyear: Option<String>,
    pub search: Option<String>,
    pub storelike: Option<String>,
    #[serde(rename = "store-vinmonopolet")]
    pub store_vinmonopolet: Option<String>,
    #[serde(rename = "store-taxfree")]
    pub store_taxfree: Option<String>,
}

impl Parameters {
    pub fn get_page(&self) -> u64 {
        self.page.unwrap_or(1).max(1) as u64
    }

    pub fn get_favourites(&self) -> bool {
        self.favourites.as_deref() == Some("true")
    }

    pub fn get_sort(&self) -> &str {
        self.sort.as_deref().unwrap_or("discount")
    }

    pub fn get_sort_by(&self, subdomain: &Subdomain) -> String {
        let sort = self.get_sort();
        if subdomain.is_taxfree() && sort != "alcohol" {
            format!("taxfree.{}", sort)
        } else if sort == "rating" {
            "aperitif.points".to_string()
        } else {
            sort.to_string()
        }
    }

    pub fn is_ascending(&self) -> bool {
        // Default true; only false when explicitly "false"
        self.ascending.as_deref() != Some("false")
    }

    pub fn get_category(&self) -> Option<&str> {
        self.category.as_deref()
    }

    pub fn get_country(&self) -> Option<&str> {
        match self.country.as_deref() {
            Some("Alle land") | None => None,
            Some(c) => Some(c),
        }
    }

    fn parse_filter_value<T: std::str::FromStr>(
        value: Option<T>,
        exact_flag: Option<&str>,
    ) -> (Option<T>, bool) {
        (value, exact_flag == Some("true"))
    }

    pub fn get_price(&self) -> (Option<f64>, bool) {
        Self::parse_filter_value(self.price, self.cprice.as_deref())
    }

    pub fn get_volume(&self) -> (Option<f64>, bool) {
        Self::parse_filter_value(self.volume, self.cvolume.as_deref())
    }

    pub fn get_alcohol(&self) -> (Option<f64>, bool) {
        Self::parse_filter_value(self.alcohol, self.calcohol.as_deref())
    }

    pub fn get_year(&self) -> (Option<i64>, bool) {
        Self::parse_filter_value(self.year, self.cyear.as_deref())
    }

    pub fn get_search(&self) -> Option<&str> {
        self.search
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
    }

    pub fn get_storelike(&self) -> Option<&str> {
        self.storelike
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && *s != "null")
    }

    pub fn get_store_vinmonopolet(&self, subdomain: &Subdomain) -> Option<&str> {
        if subdomain.is_taxfree() {
            return None;
        }
        match self.store_vinmonopolet.as_deref() {
            Some("null") | None => None,
            Some(s) => Some(s),
        }
    }

    pub fn get_store_taxfree(&self, subdomain: &Subdomain) -> Option<&str> {
        if !subdomain.is_taxfree() {
            return None;
        }
        match self.store_taxfree.as_deref() {
            Some("null") | None => None,
            Some(s) => Some(s),
        }
    }

    pub fn is_orderable(&self, subdomain: &Subdomain) -> bool {
        let store = self.get_store_vinmonopolet(subdomain);
        !store.is_some_and(|s| s != "Spesifikk butikk")
    }

    pub fn to_filter(&self, subdomain: &Subdomain) -> Document {
        let mut filter = doc! {};

        if self.is_orderable(subdomain) {
            filter.insert("orderable", true);
        }

        if subdomain.is_taxfree() {
            filter.insert(
                "taxfree",
                doc! { "$exists": true, "$ne": mongodb::bson::Bson::Null },
            );
        }

        filter
    }

    pub fn to_options(&self, subdomain: &Subdomain) -> FindOptions {
        FindOptions::builder()
            .sort(doc! {
                self.get_sort_by(subdomain): if self.is_ascending() { 1 } else { -1 }
            })
            .skip((self.get_page() - 1) * PRODUCTS_PER_PAGE)
            .limit(PRODUCTS_PER_PAGE as i64)
            .build()
    }
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct SignupRequest {
    pub username: String,
    pub password: String,
    pub email: String,
}
