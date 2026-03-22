use axum::{
    extract::{Query, State},
    response::Html,
};

use core::{query::Parameters, state::AppState, subdomain::Subdomain};
use database;

use crate::{render_landing, render_products};

pub async fn landing(
    State(state): State<AppState>,
    subdomain: Subdomain,
    Query(parameters): Query<Parameters>,
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
                Vec::new(),
            )))
        }
    }
}
