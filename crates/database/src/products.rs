use core::models::{PRODUCTS_PER_PAGE, Product};
use futures::StreamExt;
use mongodb::{Collection, Database, bson::Document, options::FindOptions};

pub async fn get_products(db: &Database, filter: Document, options: FindOptions) -> Vec<Product> {
    let collection: Collection<Product> = db.collection("products");

    let mut documents: Vec<Product> = Vec::with_capacity(PRODUCTS_PER_PAGE as usize);

    match collection.find(filter).with_options(options).await {
        Ok(mut cursor) => {
            while let Some(result) = cursor.next().await {
                if let Ok(product) = result {
                    documents.push(product);
                }
            }
        }
        Err(error) => {
            eprintln!("MongoDB find error: {:?}", error);
        }
    }

    documents
}
