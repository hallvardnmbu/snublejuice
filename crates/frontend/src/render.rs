use axum::{
    extract::{Query, State},
    response::Html,
};
use minijinja::{Environment, context, path_loader};
use std::sync::OnceLock;

use authentication::middle::MaybeAuthenticate;
use core::{
    models::{Product, User},
    query::Parameters,
    state::AppState,
    subdomain::Subdomain,
};
use database;

static ENV: OnceLock<Environment<'static>> = OnceLock::new();

fn get_env() -> &'static Environment<'static> {
    ENV.get_or_init(|| {
        let mut env = Environment::new();
        env.set_loader(path_loader(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/templates"
        )));
        env
    })
}

pub fn render_landing() -> String {
    let tmpl = get_env().get_template("landing.html").unwrap();
    tmpl.render(context! {}).unwrap()
}

pub fn render_products(data: &Vec<Product>, is_taxfree: bool, user: Option<User>) -> String {
    let tmpl = get_env().get_template("products.html").unwrap();
    tmpl.render(context! {
        data,
        is_taxfree,
        user,
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
) -> Result<Html<String>, core::errors::AppError> {
    match subdomain {
        Subdomain::Landing => Ok(Html(render_landing())),
        Subdomain::Vinmonopolet | Subdomain::Taxfree => {
            let products = database::products::get_products(
                &state.db,
                parameters.to_filter(&subdomain),
                parameters.to_options(),
            )
            .await;
            Ok(Html(render_products(
                &products,
                subdomain.is_taxfree(),
                user,
            )))
        }
    }
}
