use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Aperitif {
    pub url: String,
    pub points: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Taxfree {
    pub url: String,
    pub price: f64,
    pub discount: f64,
    pub stores: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Product {
    pub index: usize,
    pub name: String,
    pub price: f64,
    pub prices: Vec<f64>,
    pub discount: f64,
    pub volume: f64,
    pub alcohol: f64,
    pub literprice: f64,
    pub url: String,
    pub category: String,
    pub subcategory: Option<String>,
    pub country: String,
    pub district: Option<String>,
    pub subdistrict: Option<String>,
    pub description: Option<String>,
    pub characteristics: Option<Vec<String>>,
    pub storage: Option<String>,
    pub smell: Option<String>,
    pub taste: Option<String>,
    pub pair: Option<Vec<String>>,
    pub year: Option<i32>,
    pub oldprice: Option<f64>,
    pub ingredients: Option<Vec<String>>,
    pub colour: Option<String>,
    pub sugar: Option<String>,
    pub acid: Option<String>,
    // External integrations
    pub aperitif: Option<Aperitif>,
    pub taxfree: Option<Taxfree>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub username: String,
    pub email: String,
    pub favourites: Vec<usize>,
    pub notify: bool,
}
