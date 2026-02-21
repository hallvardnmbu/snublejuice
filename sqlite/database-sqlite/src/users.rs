use sqlx::{FromRow, SqlitePool, Row};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub username: String,
    pub email: Option<String>,
    #[serde(skip)]
    pub password: Option<String>,
    pub notify: Option<bool>,
    // Stored as JSON string in DB, but we parse it on load?
    // Using manual FromRow or handling string parsing
    #[serde(skip_deserializing)] // Handled manually
    pub favourites: Option<String>, 
}

// Helper struct for API responses
#[derive(Debug, Serialize)]
pub struct UserData {
    pub username: String,
    pub email: Option<String>,
    pub notify: Option<bool>,
    pub favourites: Vec<i64>,
}

impl User {
    pub fn to_data(&self) -> UserData {
        let favs: Vec<i64> = match &self.favourites {
            Some(s) => serde_json::from_str(s).unwrap_or_default(),
            None => Vec::new(),
        };
        UserData {
            username: self.username.clone(),
            email: self.email.clone(),
            notify: self.notify,
            favourites: favs,
        }
    }
}

pub async fn create_user(pool: &SqlitePool, username: &str, email: &str, password_hash: &str, notify: bool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO users (username, email, password, notify, favourites) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .bind(notify)
    .bind("[]") // Empty favorites
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_user_by_username(pool: &SqlitePool, username: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = ?")
        .bind(username)
        .fetch_optional(pool)
        .await
}

pub async fn get_user_by_email(pool: &SqlitePool, email: &str) -> Result<Option<String>, sqlx::Error> {
    // Just checking existence or getting username
    let row: Option<(String,)> = sqlx::query_as("SELECT username FROM users WHERE email = ?")
        .bind(email)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(u,)| u))
}

pub async fn delete_user(pool: &SqlitePool, username: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM users WHERE username = ?")
        .bind(username)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_notification(pool: &SqlitePool, username: &str, notify: bool) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET notify = ? WHERE username = ?")
        .bind(notify)
        .bind(username)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn toggle_favourite(pool: &SqlitePool, username: &str, product_id: i64) -> Result<bool, sqlx::Error> {
    // Fetch current favourites
    let user = get_user_by_username(pool, username).await?;
    if let Some(u) = user {
        let mut favs: Vec<i64> = match u.favourites {
            Some(s) => serde_json::from_str(&s).unwrap_or_default(),
            None => Vec::new(),
        };

        let mut added = false;
        if let Some(pos) = favs.iter().position(|&x| x == product_id) {
            favs.remove(pos);
        } else {
            favs.push(product_id);
            added = true;
        }

        let new_json = serde_json::to_string(&favs).unwrap();
        
        sqlx::query("UPDATE users SET favourites = ? WHERE username = ?")
            .bind(new_json)
            .bind(username)
            .execute(pool)
            .await?;
        
        Ok(added)
    } else {
        Err(sqlx::Error::RowNotFound)
    }
}
