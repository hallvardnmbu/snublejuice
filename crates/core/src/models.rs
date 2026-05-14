use mongodb::bson::{DateTime, oid::ObjectId};
use serde::{Deserialize, Serialize};

pub const PRODUCTS_PER_PAGE: i64 = 15;
pub const ONE_MONTH: u64 = 60 * 60 * 24 * 30;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    #[serde(rename = "_id")]
    pub user_id: ObjectId,
    pub username: String,
    pub password: String,
    pub email: String,
    pub favourites: Vec<i64>,
    pub notify: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    pub user_id: ObjectId,
    pub session_id: String,
    pub expiration: DateTime,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Index {
    pub index: i64,
}

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

#[derive(Debug, Serialize)]
pub struct Characteristic {
    pub name: String,
    pub percentage: u32,
}

#[derive(Debug, Serialize)]
pub struct Ingredient {
    pub grape: String,
    pub percentage: f64,
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
    pub storage: Option<String>,
    pub smell: Option<String>,
    pub taste: Option<String>,
    pub pair: Option<Vec<String>>,
    pub year: Option<i32>,
    pub oldprice: Option<f64>,
    pub colour: Option<String>,
    pub sugar: Option<String>,
    pub acid: Option<String>,
    #[serde(default, deserialize_with = "deserialize_characteristics")]
    pub characteristics: Vec<Characteristic>,
    #[serde(default, deserialize_with = "deserialize_ingredients")]
    pub ingredients: Vec<Ingredient>,
    // External integrations
    pub aperitif: Option<Aperitif>,
    pub taxfree: Option<Taxfree>,
}

fn deserialize_characteristics<'de, D>(deserializer: D) -> Result<Vec<Characteristic>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw: Option<Vec<String>> = Option::deserialize(deserializer)?;
    let mut v: Vec<Characteristic> = raw
        .unwrap_or_default()
        .iter()
        .filter_map(|s| {
            let (name, rest) = s.split_once(", ")?;
            let (num, den) = rest.split_once(" av ")?;
            let num: u32 = num.trim().parse().ok()?;
            let den: u32 = den.trim().parse().ok()?;
            if den == 0 {
                return None;
            }
            Some(Characteristic {
                name: name.trim().to_string(),
                percentage: 100 * num / den,
            })
        })
        .collect();
    v.sort_by(|a, b| b.percentage.cmp(&a.percentage));
    Ok(v)
}

fn deserialize_ingredients<'de, D>(deserializer: D) -> Result<Vec<Ingredient>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw: Option<Vec<String>> = Option::deserialize(deserializer)?;
    let mut v: Vec<Ingredient> = raw
        .unwrap_or_default()
        .iter()
        .filter_map(|s| parse_ingredient(s))
        .collect();
    v.sort_by(|a, b| {
        b.percentage
            .partial_cmp(&a.percentage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(v)
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    chars.next().map_or(String::new(), |f| {
        f.to_uppercase().to_string() + chars.as_str()
    })
}

fn parse_ingredient(s: &str) -> Option<Ingredient> {
    // "90% eple" or "10% (rips, solbær)"
    if let Some(idx) = s.find('%') {
        let pct_str = s[..idx].trim();
        let grape_str = s[idx + 1..].trim();
        if let (Ok(pct), false) = (pct_str.parse::<f64>(), grape_str.is_empty()) {
            return Some(Ingredient {
                grape: capitalize(grape_str),
                percentage: pct,
            });
        }
    }
    // "Pinot Bianco 80 prosent"
    if let Some(idx) = s.to_lowercase().find(" prosent") {
        let before = s[..idx].trim();
        if let Some(space) = before.rfind(' ') {
            let grape_str = before[..space].trim();
            if let Ok(pct) = before[space + 1..].trim().parse::<f64>() {
                return Some(Ingredient {
                    grape: grape_str.to_string(),
                    percentage: pct,
                });
            }
        }
    }
    // Single name only → 100%
    let trimmed = s.trim().to_string();
    (!trimmed.is_empty()).then_some(Ingredient {
        grape: trimmed,
        percentage: 100.0,
    })
}
