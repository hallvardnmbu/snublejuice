use mongodb::{
    Collection, Database,
    bson::{Document, doc, from_bson},
};

pub async fn get_distinct(db: Database, field: &str) -> Vec<String> {
    let collection: Collection<Document> = db.collection("products");
    match collection
        .distinct(field, doc! { field: { "$exists": true } })
        .await
    {
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
