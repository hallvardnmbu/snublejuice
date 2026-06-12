use futures::StreamExt;
use mongodb::{
    Collection, Database,
    bson::{Bson, Document, doc, from_document},
};
use shared::models::{PRODUCTS_PER_PAGE, Product};

fn max_page_from_count(count: u64) -> u64 {
    count / PRODUCTS_PER_PAGE as u64 + 1
}

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

pub async fn get_preview(db: &Database, taxfree: bool) -> Option<Product> {
    let pipeline = if taxfree {
        vec![
            doc! { "$match": {
                "taxfree.stores": { "$exists": true, "$ne": Bson::Null },
                "taxfree.valid": true,
                "taxfree.discount": { "$lt": 0.0 },
            }},
            doc! { "$sort": { "taxfree.discount": 1 } },
            doc! { "$limit": 1 },
        ]
    } else {
        vec![
            doc! { "$match": {
                "updated": true,
                "orderable": true,
                "discount": { "$lt": 0.0 },
                "price": { "$gt": 0.0 },
                "alcohol": { "$gt": 0.0 },
            }},
            doc! { "$sort": { "discount": 1 } },
            doc! { "$limit": 1 },
        ]
    };
    get_products(db, pipeline).await.into_iter().next()
}

pub async fn get_max_page(db: &Database, filter: Document) -> u64 {
    let collection: Collection<Product> = db.collection("products");

    match collection.count_documents(filter).await {
        Ok(count) => max_page_from_count(count),
        Err(_) => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_page_from_count_handles_empty_and_partial_pages() {
        assert_eq!(max_page_from_count(0), 1);
        assert_eq!(max_page_from_count(1), 1);
        assert_eq!(max_page_from_count(PRODUCTS_PER_PAGE as u64), 2);
        assert_eq!(max_page_from_count(PRODUCTS_PER_PAGE as u64 + 1), 2);
        assert_eq!(max_page_from_count(PRODUCTS_PER_PAGE as u64 * 2), 3);
    }
}
