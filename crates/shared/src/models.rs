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
    #[serde(rename = "expiresAfter")]
    pub expires_after: DateTime,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Index {
    pub index: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Notify {
    pub notify: bool,
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
    pub stores: Vec<String>,
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
    pub updated: Option<bool>,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn deserializes_characteristics_into_percentages() {
        let product: Product = serde_json::from_value(json!({
            "index": 1,
            "name": "Test",
            "price": 100.0,
            "prices": [],
            "discount": -10.0,
            "volume": 75.0,
            "alcohol": 13.0,
            "literprice": 133.0,
            "url": "https://example.com",
            "stores": [],
            "category": "Rødvin",
            "country": "Frankrike",
            "characteristics": ["Fruktig, 3 av 5", "Tørr, 1 av 5", "invalid"]
        }))
        .unwrap();

        assert_eq!(product.characteristics.len(), 2);
        assert_eq!(product.characteristics[0].name, "Fruktig");
        assert_eq!(product.characteristics[0].percentage, 60);
        assert_eq!(product.characteristics[1].name, "Tørr");
        assert_eq!(product.characteristics[1].percentage, 20);
    }

    #[test]
    fn deserializes_ingredients_from_multiple_formats() {
        let product: Product = serde_json::from_value(json!({
            "index": 1,
            "name": "Test",
            "price": 100.0,
            "prices": [],
            "discount": -10.0,
            "volume": 75.0,
            "alcohol": 13.0,
            "literprice": 133.0,
            "url": "https://example.com",
            "stores": [],
            "category": "Cider",
            "country": "Norge",
            "ingredients": ["90% eple", "Pinot Bianco 80 prosent", "Chardonnay"]
        }))
        .unwrap();

        assert_eq!(product.ingredients.len(), 3);
        assert_eq!(product.ingredients[0].grape, "Chardonnay");
        assert!((product.ingredients[0].percentage - 100.0).abs() < f64::EPSILON);
        assert_eq!(product.ingredients[1].grape, "Eple");
        assert!((product.ingredients[1].percentage - 90.0).abs() < f64::EPSILON);
        assert_eq!(product.ingredients[2].grape, "Pinot Bianco");
        assert!((product.ingredients[2].percentage - 80.0).abs() < f64::EPSILON);
    }
}
