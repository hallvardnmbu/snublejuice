use mongodb::{
    Collection, Cursor, Database,
    bson::{Document, doc},
};

const _PER_PAGE: u64 = 15;

pub async fn get_products(
    db: Database,
    sort_by: &str,
    ascending: bool,
    page: u64,
) -> Result<Cursor<Document>, String> {
    let collection: Collection<Document> = db.collection("products");

    match collection
        .find(doc! { "orderable": true })
        .sort(doc! { sort_by: if ascending { 1 } else { -1 } })
        .skip((page - 1) * _PER_PAGE)
        .limit(_PER_PAGE as i64)
        // .projection(doc! { "_id": 0, "price": 1, "oldprice": 1, "discount": 1, "url": 1})
        .await
    {
        Ok(documents) => {
            println!("{:?}", documents.deserialize_current());
            Ok(documents)
        }
        Err(error) => Err(format!("No results found: {:?}", error).to_string()),
    }
}
