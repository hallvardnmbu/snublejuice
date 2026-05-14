use core::models::{PRODUCTS_PER_PAGE, Product};
use futures::StreamExt;
use mongodb::{
    Collection, Database,
    bson::{Document, from_document},
};

pub async fn get_products(db: &Database, pipeline: Vec<Document>) -> Vec<Product> {
    let collection: Collection<Product> = db.collection("products");

    let mut documents: Vec<Product> = Vec::with_capacity(PRODUCTS_PER_PAGE as usize);

    match collection.aggregate(pipeline).await {
        Ok(mut cursor) => {
            while let Some(result) = cursor.next().await {
                if let Ok(document) = result {
                    if let Ok(product) = from_document(document) {
                        documents.push(product);
                    }
                }
            }
        }
        Err(error) => {
            eprintln!("MongoDB find error: {:?}", error);
        }
    }

    documents
}

pub async fn get_max_page(db: &Database, filter: Document) -> u64 {
    let collection: Collection<Product> = db.collection("products");

    match collection.count_documents(filter).await {
        Ok(count) => count / PRODUCTS_PER_PAGE as u64 + 1,
        Err(_) => 1,
    }
}
