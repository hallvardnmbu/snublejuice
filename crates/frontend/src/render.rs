use axum::{
    extract::{Query, State},
    http::HeaderMap,
    response::Html,
};
use minijinja::{Environment, Value, context};
use regex::Regex;
use rust_embed::RustEmbed;
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

pub fn render_landing(user: Option<User>) -> String {
    let tmpl = get_env().get_template("landing.html").unwrap();
    tmpl.render(context! { user }).unwrap()
}

pub fn render_products(
    data: &Vec<Product>,
    is_taxfree: bool,
    user: Option<User>,
    page: i64,
    max_page: u64,
    parameters: &Parameters,
    landing_url: &str,
    prices_updated: bool,
) -> String {
    let tmpl = get_env().get_template("products.html").unwrap();
    tmpl.render(context! {
        data,
        is_taxfree,
        user,
        page,
        max_page,
        parameters,
        landing => false,
        landing_url,
        prices_updated,
    })
    .unwrap()
}

pub fn render_error(message: &str, landing_url: &str) -> String {
    let tmpl = get_env().get_template("error.html").unwrap();
    tmpl.render(context! {
        message,
        landing_url,
    })
    .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared::models::{Product, Taxfree};
    use shared::query::Parameters;

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
            stores: vec![],
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
                stores: vec![],
            }),
        }
    }

    fn empty_parameters() -> Parameters {
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

    #[test]
    fn templates_extend_base_and_render() {
        let landing = render_landing(None);
        assert!(landing.contains("<!doctype html>"));
        assert!(landing.contains(r#"href="/public/stylesheet.css""#));
        assert!(landing.contains("application/ld+json"));
        assert!(landing.contains("lp-main"));
        assert!(landing.contains("preview-vin"));
        assert!(landing.contains("itemscope"));
        assert!(landing.contains("itemprop=\"name\""));
        assert!(landing.contains("preview-tax"));

        let parameters = empty_parameters();
        let products = render_products(
            &vec![],
            false,
            None,
            1,
            1,
            &parameters,
            "https://snublejuice.no",
            true,
        );
        assert!(products.contains(r#"href="/public/stylesheet.css""#));
        assert!(products.contains("/public/scripts/stores.js"));
        assert!(products.contains("/public/scripts/buttons.js"));
        assert!(products.contains(r#"id="nsearch""#));
        assert!(products.contains(r#"id="category""#));
        assert!(!products.contains("lp-main"));

        let error = render_error("Test message", "https://snublejuice.no");
        assert!(error.contains(r#"href="/public/stylesheet.css""#));
        assert!(error.contains("Test message"));
        assert!(error.contains("error-logo"));
    }

    #[test]
    fn price_block_renders_vin_and_taxfree() {
        let parameters = empty_parameters();
        let vin = render_products(
            &vec![sample_product()],
            false,
            None,
            1,
            1,
            &parameters,
            "https://snublejuice.no",
            true,
        );
        assert!(vin.contains(">NÅ</span>"));
        assert!(vin.contains(">FØR</span>"));
        assert!(vin.contains(">ENDRING</span>"));
        assert!(vin.contains("pcval-strike"));
        assert!(vin.contains("class=\"price-now\""));

        let tax = render_products(
            &vec![sample_product()],
            true,
            None,
            1,
            1,
            &parameters,
            "https://snublejuice.no",
            true,
        );
        assert!(tax.contains(">POL</span>"));
        assert!(tax.contains(">TAX</span>"));
        assert!(tax.contains(">DIFF</span>"));
        assert!(tax.contains("pcval-change"));
        assert!(tax.contains("example.com"));
    }
}

pub async fn site(
    State(state): State<AppState>,
    subdomain: Subdomain,
    headers: HeaderMap,
    Query(parameters): Query<Parameters>,
    MaybeAuthenticate(user): MaybeAuthenticate,
) -> Html<String> {
    let host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("snublejuice.no");
    let landing_url = landing_url_from_host(host);
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

    match subdomain {
        Subdomain::Landing => Html(render_landing(user)),
        Subdomain::Vinmonopolet | Subdomain::Taxfree => {
            let prices_updated =
                database::metadata::get_prices_updated(&state.db, subdomain.name()).await;
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
            Html(render_products(
                &products,
                subdomain.is_taxfree(),
                user,
                parameters.page.unwrap_or(1),
                max_page,
                &parameters,
                &landing_url,
                prices_updated,
            ))
        }
    }
}
