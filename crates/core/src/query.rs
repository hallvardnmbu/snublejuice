use mongodb::bson::{Bson, Document, doc};
use regex;
use serde::{Deserialize, Serialize};

use crate::models::{PRODUCTS_PER_PAGE, User};
use crate::subdomain::Subdomain;

#[derive(Serialize, Deserialize, Debug)]
pub struct Parameters {
    pub page: Option<i64>,
    pub sort: Option<String>,
    pub ascending: Option<bool>,
    pub favourites: Option<bool>,
    pub category: Option<String>,
    pub country: Option<String>,
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
    pub store_vinmonopolet: Option<String>,
    #[serde(rename = "store-taxfree")]
    pub store_taxfree: Option<String>,
}

impl Parameters {
    fn get_sort_by(&self, subdomain: &Subdomain) -> String {
        if let Some(sort) = &self.sort {
            if subdomain.is_taxfree() && sort != "alcohol" {
                format!("taxfree.{}", sort)
            } else if sort == "rating" {
                "aperitif.points".to_string()
            } else {
                sort.clone()
            }
        } else {
            "discount".to_string()
        }
    }

    pub fn to_filter(&self, subdomain: &Subdomain, user: &Option<User>) -> Document {
        let mut filter = doc! {};

        let favourites: bool = self.favourites.unwrap_or(false);
        let taxfree: bool = subdomain.is_taxfree();

        // Only include updated products.
        if taxfree {
            filter.insert(
                "taxfree.stores",
                doc! { "$exists": true, "$ne": Bson::Null },
            );
        } else {
            filter.insert("updated", true);
        }

        if let Some(storelike) = &self.storelike {
            if !favourites && !taxfree {
                let pattern = format!(
                    r"(^|[^a-zæøåA-ZÆØÅ]){}([^a-zæøåA-ZÆØÅ]|$)",
                    regex::escape(storelike)
                );
                filter.insert("stores", doc! { "$regex": pattern, "$options": "i" });
            }
        }

        if favourites && let Some(user) = user {
            filter.insert("index", doc! { "$in": user.favourites.clone() });
        }

        // Early return for searches.
        if let Some(_) = &self.search {
            return filter;
        }

        if let Some(category) = &self.category {
            filter.insert("category", category);
        }

        if let Some(country) = &self.country {
            filter.insert("country", country);
        }

        // Availability.
        if let Some(store) = &self.store_vinmonopolet {
            if self.storelike.is_none() && !taxfree {
                filter.insert("stores", doc! { "$in": vec![store] });
            }
        } else if let Some(store) = &self.store_taxfree {
            if taxfree {
                filter.insert("taxfree.stores", doc! { "$in": vec![store] });
            }
        } else if self.storelike.is_none() && !favourites && !taxfree {
            filter.insert("orderable", true);
        }

        // Numeric filters
        if let Some(limit) = self.price {
            filter.insert(
                "price",
                if self.cprice == Some(true) {
                    doc! { "$eq": limit }
                } else {
                    doc! { "$lte": limit }
                },
            );
        }

        if let Some(limit) = self.volume {
            filter.insert(
                "volume",
                if self.cvolume == Some(true) {
                    doc! { "$eq": limit }
                } else {
                    doc! { "$gte": limit }
                },
            );
        }

        if let Some(limit) = self.alcohol {
            filter.insert(
                "alcohol",
                if self.calcohol == Some(true) {
                    doc! { "$eq": limit, "$exists": true, "$ne": Bson::Null, "$gt": 0 }
                } else {
                    doc! { "$gte": limit, "$exists": true, "$ne": Bson::Null, "$gt": 0 }
                },
            );
        } else {
            // No alcohol filter; still exclude non-alcoholic.
            filter.insert(
                "alcohol",
                doc! { "$exists": true, "$ne": Bson::Null, "$gt": 0 },
            );
        }

        if let Some(limit) = self.year {
            filter.insert(
                "year",
                if self.cyear == Some(true) {
                    doc! { "$eq": limit }
                } else {
                    doc! { "$lte": limit }
                },
            );
        }

        // Sort field must exist and be non-null
        let sort_by = self.get_sort_by(subdomain);
        filter.insert(sort_by, doc! { "$exists": true, "$ne": Bson::Null });

        filter
    }

    pub fn to_options(&self, subdomain: &Subdomain) -> Vec<Document> {
        let mut options = Vec::new();

        options.push(
            doc! {
                "$sort": {self.get_sort_by(subdomain): if self.ascending == Some(false) { -1 } else { 1 }}
            }
        );
        options.push(doc! { "$skip": ((self.page.unwrap_or(1) - 1) * PRODUCTS_PER_PAGE) });
        options.push(doc! { "$limit": PRODUCTS_PER_PAGE });

        options
    }

    pub fn to_pipeline(&self, subdomain: &Subdomain, user: &Option<User>) -> Vec<Document> {
        let mut pipeline: Vec<Document> = Vec::new();

        if let Some(search) = &self.search {
            pipeline.push(doc! {
                "$search": {
                    "index": "name",
                    "compound": {
                        "should": [
                            {
                                "text": {
                                    "query": search,
                                    "path": "name",
                                    "score": { "boost": { "value": 10 } },
                                },
                            },
                            {
                                "text": {
                                    "query": search,
                                    "path": "name",
                                    "fuzzy": {
                                        "maxEdits": 2, // Max single-character edits
                                        "prefixLength": 1, // Exact beginning of word matches
                                        "maxExpansions": 1, // Max variations
                                    },
                                },
                            },
                        ],
                    },
                },
            });

            pipeline.push(doc! { "$match": self.to_filter(subdomain, user) });

            pipeline.push(doc! { "$skip": ((self.page.unwrap_or(1) - 1) * PRODUCTS_PER_PAGE) });
            pipeline.push(doc! { "$limit": PRODUCTS_PER_PAGE });

            return pipeline;
        }

        pipeline.push(doc! { "$match": self.to_filter(subdomain, user) });

        pipeline.extend(self.to_options(subdomain));

        pipeline
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
