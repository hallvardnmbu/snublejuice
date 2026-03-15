use mongodb::{
    Collection, Database,
    bson::{DateTime, doc, oid::ObjectId},
};
use std::time::{Duration, SystemTime};

use core::{
    errors::AppError,
    models::{ONE_MONTH, Session, User},
};

pub async fn get_user_by_name(db: &Database, username: &str) -> Option<User> {
    let collection: Collection<User> = db.collection("users");

    match collection.find_one(doc! { "username": username }).await {
        Ok(user) => return user,
        Err(_) => return None,
    }
}

pub async fn get_user_by_id(db: &Database, user_id: &ObjectId) -> Option<User> {
    let collection: Collection<User> = db.collection("users");

    match collection.find_one(doc! { "_id": user_id }).await {
        Ok(user) => return user,
        Err(_) => return None,
    }
}

pub async fn favourites(db: &Database, user_id: &ObjectId) -> Result<Vec<usize>, AppError> {
    match get_user_by_id(db, user_id).await {
        Some(user) => return Ok(user.favourites),
        None => return Err(AppError::NotFound),
    }
}

pub async fn logout(db: &Database, session_id: &str) -> Result<(), AppError> {
    let collection = db.collection::<Session>("sessions");

    collection
        .delete_one(doc! { "session_id": session_id })
        .await?;

    Ok(())
}

pub async fn get_user_by_session_id(db: &Database, session_id: &str) -> Result<Session, AppError> {
    let collection = db.collection::<Session>("sessions");

    match collection
        .find_one(doc! { "session_id": session_id })
        .await?
    {
        Some(session) => return Ok(session),
        None => return Err(AppError::NotFound),
    }
}

pub async fn update_expiration(db: Database, session_id: String) -> Result<(), AppError> {
    let collection = db.collection::<Session>("sessions");

    let expires_at = DateTime::from_system_time(SystemTime::now() + Duration::from_secs(ONE_MONTH));
    collection
        .update_one(
            doc! { "session_id": &session_id },
            doc! { "$set": { "expires_at": expires_at }},
        )
        .await?;

    Ok(())
}

pub async fn store_session(db: &Database, session: Session) -> Result<(), AppError> {
    let collection = db.collection::<Session>("sessions");

    collection.insert_one(session).await?;

    Ok(())
}
