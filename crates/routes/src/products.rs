use axum::{
    Json,
    extract::{Query, State},
};
use mongodb::{
    bson::{Document, doc},
    options::FindOptions,
};
use serde::Deserialize;

use core::models::{PRODUCTS_PER_PAGE, Product};
use core::{errors::AppError, state::AppState};

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

    pub fn to_filter(&self) -> Document {
        let mut filter = doc! {};
        filter.insert("orderable", true);

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

pub async fn get_products(
    State(state): State<AppState>,
    Query(parameters): Query<Parameters>,
) -> Result<Json<Vec<Product>>, AppError> {
    let products = database::products::get_products(
        &state.db,
        parameters.to_filter(),
        parameters.to_options(),
    )
    .await;

    Ok(Json(products))
}
