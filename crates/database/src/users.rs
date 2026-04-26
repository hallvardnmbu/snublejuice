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

pub async fn create_user(db: &Database, user: User) -> Result<(), AppError> {
    let collection = db.collection::<User>("users");

    collection.insert_one(user).await?;
    Ok(())
}

pub async fn get_user_by_id(db: &Database, user_id: &ObjectId) -> Option<User> {
    let collection: Collection<User> = db.collection("users");

    match collection.find_one(doc! { "_id": user_id }).await {
        Ok(user) => return user,
        Err(_) => return None,
    }
}

pub async fn favourites(db: &Database, user_id: &ObjectId) -> Result<Vec<i64>, AppError> {
    match get_user_by_id(db, user_id).await {
        Some(user) => return Ok(user.favourites),
        None => return Err(AppError::NotFound),
    }
}

pub async fn notification(db: &Database, user_id: &ObjectId) -> Result<(), AppError> {
    let collection = db.collection::<User>("users");

    match get_user_by_id(db, user_id).await {
        Some(user) => {
            collection
                .update_one(
                    doc! { "_id": &user_id },
                    doc! { "$set": { "notification": if user.notify { false } else {true} }},
                )
                .await?;
        }
        None => return Err(AppError::NotFound),
    }

    Ok(())
}

pub async fn logout(db: &Database, user_id: &ObjectId) -> Result<(), AppError> {
    let collection = db.collection::<Session>("sessions");

    collection.delete_one(doc! { "user_id": user_id }).await?;
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

    let expiration = DateTime::from_system_time(SystemTime::now() + Duration::from_secs(ONE_MONTH));
    collection
        .update_one(
            doc! { "session_id": &session_id },
            doc! { "$set": { "expiration": expiration }},
        )
        .await?;

    Ok(())
}

pub async fn store_session(db: &Database, session: Session) -> Result<(), AppError> {
    let collection = db.collection::<Session>("sessions");

    collection.insert_one(session).await?;
    Ok(())
}
