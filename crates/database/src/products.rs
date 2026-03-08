use core::models::Product;
use mongodb::{Collection, Database, bson::doc};

const _PER_PAGE: u64 = 15;

pub async fn get_products(db: Database, sort_by: &str, ascending: bool, page: u64) -> Vec<Product> {
    let collection: Collection<Product> = db.collection("products");

    let mut documents: Vec<Product> = Vec::with_capacity(_PER_PAGE as usize);

    match collection
        .find(doc! { "orderable": true })
        .sort(doc! { sort_by: if ascending { 1 } else { -1 } })
        .skip((page - 1) * _PER_PAGE)
        .limit(_PER_PAGE as i64)
        .await
    {
        Ok(mut cursor) => {
            while cursor.advance().await.unwrap_or(false) {
                match cursor.deserialize_current() {
                    Ok(document) => documents.push(document),
                    Err(_) => continue,
                }
            }
        }
        Err(error) => {
            println!("No results found: {:?}", error);
        }
    }

    documents
}
