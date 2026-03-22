use minijinja::{Environment, context, path_loader};
use std::sync::OnceLock;

use core::models::Product;

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

pub fn render_products(data: &Vec<Product>, is_taxfree: bool, favourites: Vec<usize>) -> String {
    let tmpl = get_env().get_template("products.html").unwrap();
    tmpl.render(context! {
        data,
        is_taxfree,
        favourites,
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

pub mod render;
