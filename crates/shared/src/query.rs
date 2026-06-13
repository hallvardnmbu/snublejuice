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
    pub fn is_empty(&self) -> bool {
        self.page.is_none()
            && self.sort.is_none()
            && self.ascending.is_none()
            && self.favourites.is_none()
            && self.category.is_none()
            && self.country.is_none()
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

    fn get_sort_by(&self, subdomain: &Subdomain) -> String {
        if let Some(sort) = &self.sort {
            if subdomain.is_taxfree() && sort != "alcohol" {
                format!("taxfree.{}", sort)
            } else if sort == "rating" {
                "aperitif.points".to_string()
            } else {
                sort.clone()
            }
        } else if subdomain.is_taxfree() {
            "taxfree.discount".to_string()
        } else {
            "discount".to_string()
        }
    }

    pub fn to_filter(&self, subdomain: &Subdomain, user: &Option<User>, prices_updated: bool) -> Document {
        let mut filter = doc! {};

        let favourites: bool = self.favourites.unwrap_or(false);
        let taxfree: bool = subdomain.is_taxfree();

        if taxfree {
            filter.insert(
                "taxfree.stores",
                doc! { "$exists": true, "$ne": Bson::Null },
            );
            filter.insert("taxfree.valid", doc! { "$exists": true, "$eq": true });
        } else if prices_updated {
            // Only fully-updated products when the monthly update is complete.
            filter.insert("updated", true);
        }

        // Must have a price.
        filter.insert("price", doc! { "$gt": 0.0 });

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
            if let Some(name) = category_name(category) {
                filter.insert("category", name);
            }
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
                    doc! { "$lte": limit, "$gt": 0.0 }
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

        // Sort field must exist and be non-null (skip if already constrained above).
        let sort_by = self.get_sort_by(subdomain);
        if !filter.contains_key(&sort_by) {
            let is_discount = sort_by == "discount" || sort_by == "taxfree.discount";
            filter.insert(sort_by, doc! { "$exists": true, "$ne": Bson::Null, "$gt": if is_discount {-100.0} else {0.0}  });
        }

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

    pub fn to_pipeline(&self, subdomain: &Subdomain, user: &Option<User>, prices_updated: bool) -> Vec<Document> {
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

            pipeline.push(doc! { "$match": self.to_filter(subdomain, user, prices_updated) });

            pipeline.push(doc! { "$skip": ((self.page.unwrap_or(1) - 1) * PRODUCTS_PER_PAGE) });
            pipeline.push(doc! { "$limit": PRODUCTS_PER_PAGE });

            return pipeline;
        }

        pipeline.push(doc! { "$match": self.to_filter(subdomain, user, prices_updated) });

        pipeline.extend(self.to_options(subdomain));

        pipeline
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
    use mongodb::bson::oid::ObjectId;

    fn empty_params() -> Parameters {
        Parameters {
            page: None,
            sort: None,
            ascending: None,
            favourites: None,
            category: None,
            country: None,
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
            user_id: ObjectId::new(),
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
    fn to_filter_includes_base_vinmonopolet_constraints() {
        let filter = empty_params().to_filter(&Subdomain::Vinmonopolet, &None, true);
        assert_eq!(filter.get_bool("updated"), Ok(true));
        assert_eq!(filter.get_document("price").unwrap().get_f64("$gt"), Ok(0.0));
        assert_eq!(filter.get_bool("orderable"), Ok(true));
    }

    #[test]
    fn to_filter_includes_taxfree_constraints() {
        let filter = empty_params().to_filter(&Subdomain::Taxfree, &None, true);
        assert!(filter.contains_key("taxfree.stores"));
        assert_eq!(
            filter
                .get_document("taxfree.valid")
                .unwrap()
                .get_bool("$eq"),
            Ok(true)
        );
        assert!(!filter.contains_key("updated"));
    }

    #[test]
    fn to_filter_maps_category_slug_and_country() {
        let mut params = empty_params();
        params.category = Some("rødvin".to_string());
        params.country = Some("Frankrike".to_string());
        let filter = params.to_filter(&Subdomain::Vinmonopolet, &None, true);
        assert_eq!(filter.get_str("category"), Ok("Rødvin"));
        assert_eq!(filter.get_str("country"), Ok("Frankrike"));
    }

    #[test]
    fn to_filter_search_returns_early_without_category_filters() {
        let mut params = empty_params();
        params.search = Some("cabernet".to_string());
        params.category = Some("rødvin".to_string());
        let filter = params.to_filter(&Subdomain::Vinmonopolet, &None, true);
        assert!(!filter.contains_key("category"));
    }

    #[test]
    fn to_filter_favourites_restricts_to_user_indices() {
        let mut params = empty_params();
        params.favourites = Some(true);
        let user = test_user(vec![1, 2, 3]);
        let filter = params.to_filter(&Subdomain::Vinmonopolet, &Some(user), true);
        assert_eq!(
            filter.get_document("index").unwrap().get_array("$in").unwrap(),
            &vec![Bson::Int64(1), Bson::Int64(2), Bson::Int64(3)]
        );
    }

    #[test]
    fn to_options_sorts_and_paginates() {
        let mut params = empty_params();
        params.page = Some(3);
        params.ascending = Some(false);
        let options = params.to_options(&Subdomain::Vinmonopolet);
        assert_eq!(
            options[0].get_document("$sort").unwrap().get_i32("discount"),
            Ok(-1)
        );
        assert_eq!(options[1].get_i64("$skip"), Ok(30));
        assert_eq!(options[2].get_i64("$limit"), Ok(PRODUCTS_PER_PAGE));
    }

    #[test]
    fn to_options_taxfree_defaults_to_taxfree_discount() {
        let options = empty_params().to_options(&Subdomain::Taxfree);
        assert!(options[0].get_document("$sort").unwrap().contains_key("taxfree.discount"));
    }

    #[test]
    fn to_pipeline_with_search_includes_search_stage() {
        let mut params = empty_params();
        params.search = Some("riesling".to_string());
        let pipeline = params.to_pipeline(&Subdomain::Vinmonopolet, &None, true);
        assert!(pipeline[0].contains_key("$search"));
        assert!(pipeline[1].contains_key("$match"));
        assert!(!pipeline.iter().any(|stage| stage.contains_key("$sort")));
    }

    #[test]
    fn to_pipeline_without_search_uses_match_sort_skip_and_limit() {
        let pipeline = empty_params().to_pipeline(&Subdomain::Vinmonopolet, &None, true);
        assert_eq!(pipeline.len(), 4);
        assert!(pipeline[0].contains_key("$match"));
        assert!(pipeline[1].contains_key("$sort"));
        assert!(pipeline[2].contains_key("$skip"));
        assert!(pipeline[3].contains_key("$limit"));
    }
}
