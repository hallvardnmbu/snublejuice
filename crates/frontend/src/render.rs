use axum::{Json, extract::State, http::HeaderMap, response::Html};
use minijinja::{Environment, Value, context};
use regex::Regex;
use rust_embed::RustEmbed;
use serde::Serialize;
use std::sync::OnceLock;

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
        assert!(landing.contains("preview-vin"));
        assert!(landing.contains("itemscope"));
        assert!(landing.contains("itemprop=\"name\""));
        assert!(landing.contains("preview-tax"));

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
        assert!(vin.contains(">NÅ</span>"));
        assert!(vin.contains(">FØR</span>"));
        assert!(vin.contains(">ENDRING</span>"));
        assert!(vin.contains("strikethrough"));
        assert!(vin.contains(r#"class="price""#));

        let tax =
            render_product_results(&vec![sample_product()], true, None, 1, 1, &parameters, true);
        assert!(tax.contains(">POL</span>"));
        assert!(tax.contains(">TAX</span>"));
        assert!(tax.contains(">DIFF</span>"));
        assert!(tax.contains("change"));
        assert!(tax.contains("example.com"));
    }
}

pub async fn site(
    State(_state): State<AppState>,
    subdomain: Subdomain,
    headers: HeaderMap,
    MaybeAuthenticate(user): MaybeAuthenticate,
) -> Html<String> {
    let host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("snublejuice.no");
    let landing_url = landing_url_from_host(host);

    match subdomain {
        Subdomain::Landing => {
            let is_production = std::env::var("ENVIRONMENT")
                .map(|e| e == "production")
                .unwrap_or(false);
            if is_production {
                let month = chrono::Local::now().format("%Y-%m").to_string();
                database::metadata::increment_visitor(&_state.db, &month, subdomain.name(), true)
                    .await;
            }
            Html(render_landing(user))
        }
        Subdomain::Vinmonopolet | Subdomain::Taxfree => Html(render_products_shell(
            subdomain.is_taxfree(),
            user,
            &landing_url,
        )),
    }
}

pub async fn fetch_products(
    State(state): State<AppState>,
    subdomain: Subdomain,
    MaybeAuthenticate(user): MaybeAuthenticate,
    Json(parameters): Json<Parameters>,
) -> Json<ProductsResponse> {
    let is_production = std::env::var("ENVIRONMENT")
        .map(|e| e == "production")
        .unwrap_or(false);

    if is_production {
        let month = chrono::Local::now().format("%Y-%m").to_string();
        database::metadata::increment_visitor(
            &state.db,
            &month,
            subdomain.name(),
            parameters.is_empty(),
        )
        .await;
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
