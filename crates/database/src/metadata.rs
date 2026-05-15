use mongodb::{
    Collection, Database,
    bson::{Document, doc, from_bson},
    options::UpdateOptions,
};

pub async fn increment_visitor(db: &Database, month: &str, subdomain: &str, fresh: bool) {
    let collection: Collection<Document> = db.collection("metadata");
    let current = if fresh { "fresh" } else { "newpage" };
    let _ = collection
        .update_one(
            doc! { "id": "visitors" },
            doc! {
                "$inc": {
                    format!("{}.total", current): 1,
                    format!("{}.month.{}.{}", current, month, subdomain): 1,
                }
            },
        )
        .with_options(UpdateOptions::builder().upsert(true).build())
        .await;
}

pub async fn get_distinct(db: &Database, field: &str, is_taxfree: bool) -> Vec<String> {
    let collection: Collection<Document> = db.collection("products");

    let mut filter = doc! { field: { "$exists": true } };
    if is_taxfree {
        filter.insert("taxfree", doc! { "$exists": true, "$ne": null });
    }

    match collection.distinct(field, filter).await {
        Ok(cursor) => cursor
            .into_iter()
            .map(|bson| from_bson::<String>(bson))
            .collect::<Result<Vec<String>, _>>()
            .unwrap_or_else(|e| {
                eprintln!("Deserialization error: {:?}", e);
                vec![]
            }),
        Err(error) => {
            println!("No results found: {:?}", error);
            vec![]
        }
    }
}
