use mongodb::{
    Collection, Database,
    bson::{Document, doc},
};

pub async fn get_products(
    db: Database,
    sort_by: &str,
    ascending: bool,
) -> Result<Vec<String>, String> {
    println!("{} {:?}", sort_by, ascending);

    let collection: Collection<Document> = db.collection("products");

    match collection.find(doc! { "index": 1 }).await {
        Some(documents) => {
            println!("{:?}", documents);
            Ok(documents)
        }
        Err(error) => Err(format!("No results found: {:?}", error).to_string()),
    }
}
