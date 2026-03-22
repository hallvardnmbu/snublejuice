use mongodb::{
    bson::{Document, doc},
    options::FindOptions,
};
use serde::Deserialize;

use crate::models::PRODUCTS_PER_PAGE;
use crate::subdomain::Subdomain;

#[derive(Deserialize, Debug)]
pub struct Parameters {
    pub sort_by: Option<String>,
    pub ascending: Option<bool>,
    pub page: Option<i64>,
}

impl Parameters {
    fn get_sort_by(&self) -> &str {
        self.sort_by.as_deref().unwrap_or("discount")
    }

    fn is_ascending(&self) -> bool {
        self.ascending.unwrap_or(true)
    }

    fn get_page(&self) -> u64 {
        self.page.unwrap_or(1).max(1) as u64
    }

    pub fn to_filter(&self, subdomain: &Subdomain) -> Document {
        let mut filter = doc! {};
        filter.insert("orderable", true);

        if subdomain.is_taxfree() {
            filter.insert(
                "taxfree",
                doc! { "$exists": true, "$ne": mongodb::bson::Bson::Null },
            );
        }

        // TODO: Parse additional filters?
        // if let Some(search) = &self.search { ... }

        filter
    }

    pub fn to_options(&self) -> FindOptions {
        FindOptions::builder()
            .sort(doc! { self.get_sort_by(): if self.is_ascending() { 1 } else { -1 } })
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
