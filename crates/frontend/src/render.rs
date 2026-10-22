use axum::{Json, extract::State, http::HeaderMap, response::Html};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use minijinja::{Environment, Value, context};
use regex::Regex;
use rust_embed::RustEmbed;
use serde::Serialize;
use std::sync::OnceLock;
use time::Duration as TimeDuration;

use authentication::middle::MaybeAuthenticate;
use shared::{
    models::{Product, User},
    query::Parameters,
    state::AppState,
    subdomain::{Subdomain, landing_url_from_host},
};

#[derive(RustEmbed)]
#[folder = "templates/"]
struct Templates;

static ENV: OnceLock<Environment<'static>> = OnceLock::new();

fn get_env() -> &'static Environment<'static> {
    ENV.get_or_init(|| {
        let mut env = Environment::new();
        for name in Templates::iter() {
            let content = Templates::get(&name).unwrap();
            let source = std::str::from_utf8(content.data.as_ref()).unwrap();
            env.add_template_owned(name.into_owned(), source.to_owned())
                .unwrap();
        }
        env.add_filter("storelike_filter", |stores: Value, pattern: &str| {
            let Ok(re) = Regex::new(&format!(
                r"(?i)(^|[^a-zæøåA-ZÆØÅ]){}([^a-zæøåA-ZÆØÅ]|$)",
                regex::escape(pattern)
            )) else {
                return Vec::new();
            };
            let Ok(iter) = stores.try_iter() else {
                return Vec::new();
            };
            iter.filter(|s| s.as_str().map(|s| re.is_match(s)).unwrap_or(false))
                .collect::<Vec<_>>()
        });
        env.add_filter("truncate", |value: String, max: u32| -> String {
            let max = max as usize;
            let chars: Vec<char> = value.chars().collect();
            if chars.len() <= max {
                value
            } else {
                format!("{}…", chars[..max].iter().collect::<String>())
            }
        });
        env
    })
}

#[derive(Serialize)]
pub struct ProductsResponse {
    pub html: String,
    pub page: i64,
    pub max_page: u64,
    pub favourites: bool,
}

pub fn empty_parameters() -> Parameters {
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

pub fn render_landing(user: Option<User>) -> String {
    let tmpl = get_env().get_template("landing.html").unwrap();
    tmpl.render(context! { user }).unwrap()
}

pub fn render_products_shell(is_taxfree: bool, user: Option<User>, landing_url: &str) -> String {
    let parameters = empty_parameters();
    let tmpl = get_env().get_template("products.html").unwrap();
    tmpl.render(context! {
        is_taxfree,
        user,
        parameters,
        landing => false,
        landing_url,
    })
    .unwrap()
}

pub fn render_product_results(
    data: &Vec<Product>,
    is_taxfree: bool,
    user: Option<User>,
    page: i64,
    max_page: u64,
    parameters: &Parameters,
    prices_updated: bool,
) -> String {
    let tmpl = get_env().get_template("partials/results.html").unwrap();
    tmpl.render(context! {
        data,
        is_taxfree,
        user,
        page,
        max_page,
        parameters,
        prices_updated,
    })
    .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared::models::{Product, Taxfree};

    fn sample_product() -> Product {
        Product {
            index: 0,
            name: "Testvin".to_string(),
            price: 150.0,
            prices: vec![],
            discount: 25.0,
            volume: 75.0,
            alcohol: 13.5,
            literprice: 200.0,
            url: "https://example.com/vin".to_string(),
            stores: Some(vec![]),
            category: "Rødvin".to_string(),
            subcategory: None,
            country: "Frankrike".to_string(),
            district: None,
            subdistrict: None,
            description: None,
            storage: None,
            smell: None,
            taste: None,
            pair: None,
            year: None,
            oldprice: Some(200.0),
            colour: None,
            sugar: None,
            acid: None,
            characteristics: vec![],
            ingredients: vec![],
            updated: Some(true),
            aperitif: None,
            taxfree: Some(Taxfree {
                url: "https://example.com/tax".to_string(),
                price: 120.0,
                discount: 20.0,
                stores: Some(vec![]),
            }),
        }
    }

    #[test]
    fn templates_extend_base_and_render() {
        let landing = render_landing(None);
        assert!(landing.contains("<!doctype html>"));
        assert!(landing.contains(r#"href="/public/stylesheet.css""#));
        assert!(landing.contains("application/ld+json"));
        assert!(landing.contains("landing"));
        assert!(landing.contains("hero"));
        assert!(landing.contains("https://schema.org"));

        let products = render_products_shell(false, None, "https://snublejuice.no");
        assert!(products.contains(r#"href="/public/stylesheet.css""#));
        assert!(products.contains("/public/scripts/dropdowns.js"));
        assert!(products.contains("/public/scripts/products.js"));
        assert!(products.contains("/public/scripts/filters.js"));
        assert!(products.contains(r#"id="product-results""#));
        assert!(products.contains(r#"id="nsearch""#));
        assert!(products.contains(r#"id="category""#));
        assert!(products.contains(r#"id="applyFilters""#));
        assert!(!products.contains("landing"));
    }

    #[test]
    fn price_block_renders_vin_and_taxfree() {
        let parameters = empty_parameters();
        let vin = render_product_results(
            &vec![sample_product()],
            false,
            None,
            1,
            1,
            &parameters,
            true,
        );
        assert!(vin.contains("<span>KR</span>"));
        assert!(vin.contains("<span>%</span>"));
        assert!(vin.contains("strikethrough"));
        assert!(vin.contains(r#"class="prices""#));

        let tax =
            render_product_results(&vec![sample_product()], true, None, 1, 1, &parameters, true);
        assert!(tax.contains("<span>KR</span>"));
        assert!(tax.contains("<span>%</span>"));
        assert!(tax.contains("strikethrough"));
        assert!(tax.contains("example.com"));
    }
}

pub async fn site(
    State(state): State<AppState>,
    subdomain: Subdomain,
    headers: HeaderMap,
    mut jar: CookieJar,
    MaybeAuthenticate(user): MaybeAuthenticate,
) -> (CookieJar, Html<String>) {
    let host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("snublejuice.no");
    let landing_url = landing_url_from_host(host);

    // One "fresh" visit per visitor per month; the cookie holds the month last counted.
    let month = chrono::Local::now().format("%Y-%m").to_string();
    if is_production() && jar.get("visitor").is_none_or(|c| c.value() != month) {
        database::metadata::increment_visitor(&state.db, &month, subdomain.name(), true).await;
        let domain =
            std::env::var("COOKIE_DOMAIN").unwrap_or_else(|_| "snublejuice.localhost".to_string());
        jar = jar.add(
            Cookie::build(("visitor", month))
                .path("/")
                .domain(domain)
                .secure(true)
                .max_age(TimeDuration::days(35)),
        );
    }

    let html = match subdomain {
        Subdomain::Landing => render_landing(user),
        Subdomain::Vinmonopolet | Subdomain::Taxfree => {
            render_products_shell(subdomain.is_taxfree(), user, &landing_url)
        }
    };
    (jar, Html(html))
}

fn is_production() -> bool {
    std::env::var("ENVIRONMENT").is_ok_and(|e| e == "production")
}

pub async fn fetch_products(
    State(state): State<AppState>,
    subdomain: Subdomain,
    MaybeAuthenticate(user): MaybeAuthenticate,
    Json(parameters): Json<Parameters>,
) -> Json<ProductsResponse> {
    if is_production() {
        let month = chrono::Local::now().format("%Y-%m").to_string();
        database::metadata::increment_visitor(&state.db, &month, subdomain.name(), false).await;
    }

    let prices_updated = database::metadata::get_prices_updated(&state.db, subdomain.name()).await;
    let page = parameters.page.unwrap_or(1);
    let products = database::products::get_products(
        &state.db,
        parameters.to_pipeline(&subdomain, &user, prices_updated),
    )
    .await;
    let max_page = database::products::get_max_page(
        &state.db,
        parameters.to_filter(&subdomain, &user, prices_updated),
    )
    .await;
    let favourites = parameters.favourites.unwrap_or(false);
    let html = render_product_results(
        &products,
        subdomain.is_taxfree(),
        user,
        page,
        max_page,
        &parameters,
        prices_updated,
    );

    Json(ProductsResponse {
        html,
        page,
        max_page,
        favourites,
    })
}
