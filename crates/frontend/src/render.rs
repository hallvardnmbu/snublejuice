use axum::{
    extract::{Query, State},
    response::Html,
};
use chrono::{Datelike, Local};
use minijinja::{Environment, Value, context};
use regex::Regex;
use rust_embed::RustEmbed;
use std::sync::OnceLock;

use authentication::middle::MaybeAuthenticate;
use database;
use shared::{
    models::{Product, User},
    query::Parameters,
    state::AppState,
    subdomain::Subdomain,
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
        env
    })
}

pub fn render_landing() -> String {
    let tmpl = get_env().get_template("landing.html").unwrap();
    tmpl.render(context! {}).unwrap()
}

pub fn render_products(
    data: &Vec<Product>,
    is_taxfree: bool,
    user: Option<User>,
    page: i64,
    max_page: u64,
    parameters: &Parameters,
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
    })
    .unwrap()
}

pub fn render_error(message: &str) -> String {
    let tmpl = get_env().get_template("error.html").unwrap();
    tmpl.render(context! {
        message,
    })
    .unwrap()
}

pub async fn site(
    State(state): State<AppState>,
    subdomain: Subdomain,
    Query(parameters): Query<Parameters>,
    MaybeAuthenticate(user): MaybeAuthenticate,
) -> Html<String> {
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
        Subdomain::Landing => Html(render_landing()),
        Subdomain::Vinmonopolet | Subdomain::Taxfree => {
            if !database::metadata::get_prices_updated(&state.db, subdomain.name()).await {
                return Html(render_error(
                    "For å få et pip når prisene er her, kan du lage bruker og huke av for varsling ;-)",
                ));
            }
            let products = database::products::get_products(
                &state.db,
                parameters.to_pipeline(&subdomain, &user),
            )
            .await;
            let max_page = database::products::get_max_page(
                &state.db,
                parameters.to_filter(&subdomain, &user),
            )
            .await;
            Html(render_products(
                &products,
                subdomain.is_taxfree(),
                user,
                parameters.page.unwrap_or(1),
                max_page,
                &parameters,
            ))
        }
    }
}
