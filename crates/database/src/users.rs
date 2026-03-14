use core::models::User;
use mongodb::{Collection, Database, bson::doc};

pub async fn get_user(db: &Database, username: &str) -> Option<User> {
    let collection: Collection<User> = db.collection("users");

    match collection.find(doc! { "username": username }).await {
        Ok(cursor) => match cursor.deserialize_current() {
            Ok(user) => return Some(user),
            Err(error) => {
                println!("Unable to deserialize user: {:?}", error);
                return None;
            }
        },
        Err(_) => return None,
    }
}
