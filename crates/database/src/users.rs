use rusqlite::{OptionalExtension, Row, params};

use shared::{
    errors::AppError,
    models::{ONE_MONTH, Session, User, unix_now},
    state::Database,
};

use crate::connect;

const USER: &str = "SELECT id, username, password, email, favourites, notify FROM users";

fn user_from_row(row: &Row) -> rusqlite::Result<User> {
    Ok(User {
        user_id: row.get(0)?,
        username: row.get(1)?,
        password: row.get(2)?,
        email: row.get(3)?,
        favourites: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or_default(),
        notify: row.get(5)?,
    })
}

pub async fn get_user_by_name(db: &Database, username: &str) -> Option<User> {
    let username = username.to_string();
    connect::app(db, move |conn| {
        conn.query_row(
            &format!("{USER} WHERE username = ?"),
            [username],
            user_from_row,
        )
        .optional()
    })
    .await
    .ok()
    .flatten()
}

/// Returns the id of the new user.
pub async fn create_user(
    db: &Database,
    username: &str,
    password: &str,
    email: &str,
    notify: bool,
) -> Result<i64, AppError> {
    let (username, password, email) = (
        username.to_string(),
        password.to_string(),
        email.to_string(),
    );
    connect::app(db, move |conn| {
        conn.execute(
            "INSERT INTO users (username, password, email, notify) VALUES (?, ?, ?, ?)",
            params![username, password, email, notify],
        )?;
        Ok(conn.last_insert_rowid())
    })
    .await
}

pub async fn get_user_by_id(db: &Database, user_id: &i64) -> Option<User> {
    let user_id = *user_id;
    connect::app(db, move |conn| {
        conn.query_row(&format!("{USER} WHERE id = ?"), [user_id], user_from_row)
            .optional()
    })
    .await
    .ok()
    .flatten()
}

pub async fn favourites(db: &Database, user_id: &i64) -> Result<Vec<i64>, AppError> {
    match get_user_by_id(db, user_id).await {
        Some(user) => return Ok(user.favourites),
        None => return Err(AppError::NotFound),
    }
}

pub(crate) const TOGGLE_FAVOURITE: &str = "
    UPDATE users SET favourites = CASE
        WHEN EXISTS (SELECT 1 FROM json_each(favourites) WHERE value = ?1)
            THEN (SELECT json_group_array(value) FROM json_each(favourites) WHERE value != ?1)
        ELSE json_insert(favourites, '$[#]', ?1)
    END
    WHERE id = ?2";

pub async fn toggle_favourite(db: &Database, user_id: &i64, index: &i64) -> Result<(), AppError> {
    let (user_id, index) = (*user_id, *index);
    match connect::app(db, move |conn| {
        conn.execute(TOGGLE_FAVOURITE, params![index, user_id])
    })
    .await?
    {
        0 => Err(AppError::NotFound),
        _ => Ok(()),
    }
}

pub async fn notification(db: &Database, user_id: &i64, notify: bool) -> Result<(), AppError> {
    let user_id = *user_id;
    let updated = connect::app(db, move |conn| {
        conn.execute(
            "UPDATE users SET notify = ? WHERE id = ?",
            params![notify, user_id],
        )
    })
    .await?;

    if updated == 0 {
        return Err(AppError::NotFound);
    }

    Ok(())
}

pub async fn logout(db: &Database, session_id: &str) -> Result<(), AppError> {
    let session_id = session_id.to_string();
    connect::app(db, move |conn| {
        conn.execute("DELETE FROM sessions WHERE session_id = ?", [session_id])
    })
    .await?;
    Ok(())
}

pub async fn get_user_by_session_id(db: &Database, session_id: &str) -> Result<Session, AppError> {
    let session_id = session_id.to_string();
    connect::app(db, move |conn| {
        conn.query_row(
            "SELECT user_id, session_id, expires_after FROM sessions
             WHERE session_id = ? AND expires_after > ?",
            params![session_id, unix_now()],
            |row| {
                Ok(Session {
                    user_id: row.get(0)?,
                    session_id: row.get(1)?,
                    expires_after: row.get(2)?,
                })
            },
        )
        .optional()
    })
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn update_expiration(db: Database, session_id: String) -> Result<(), AppError> {
    connect::app(&db, move |conn| {
        conn.execute(
            "UPDATE sessions SET expires_after = ? WHERE session_id = ?",
            params![unix_now() + ONE_MONTH as i64, session_id],
        )
    })
    .await?;
    Ok(())
}

pub async fn delete_user(db: &Database, user_id: &i64) -> Result<(), AppError> {
    let user_id = *user_id;
    connect::app(db, move |conn| {
        conn.execute("DELETE FROM users WHERE id = ?", [user_id])
    })
    .await?;
    Ok(())
}

/// Also drops expired sessions of everyone, which is all the pruning they need.
pub async fn delete_sessions_for_user(db: &Database, user_id: &i64) -> Result<(), AppError> {
    let user_id = *user_id;
    connect::app(db, move |conn| {
        conn.execute(
            "DELETE FROM sessions WHERE user_id = ? OR expires_after <= ?",
            params![user_id, unix_now()],
        )
    })
    .await?;
    Ok(())
}

pub async fn store_session(db: &Database, session: Session) -> Result<(), AppError> {
    connect::app(db, move |conn| {
        conn.execute(
            "INSERT INTO sessions (session_id, user_id, expires_after) VALUES (?, ?, ?)",
            params![session.session_id, session.user_id, session.expires_after],
        )
    })
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn toggles_favourites_on_and_off() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("schema.sql")).unwrap();
        conn.execute(
            "INSERT INTO users (username, password, email) VALUES ('a', 'b', 'c')",
            [],
        )
        .unwrap();

        let favourites = |conn: &Connection| -> String {
            conn.query_row("SELECT favourites FROM users", [], |row| row.get(0))
                .unwrap()
        };
        assert_eq!(conn.execute(TOGGLE_FAVOURITE, params![5, 1]).unwrap(), 1);
        conn.execute(TOGGLE_FAVOURITE, params![7, 1]).unwrap();
        assert_eq!(favourites(&conn), "[5,7]");
        conn.execute(TOGGLE_FAVOURITE, params![5, 1]).unwrap();
        assert_eq!(favourites(&conn), "[7]");
        conn.execute(TOGGLE_FAVOURITE, params![7, 1]).unwrap();
        assert_eq!(favourites(&conn), "[]");
        assert_eq!(conn.execute(TOGGLE_FAVOURITE, params![5, 99]).unwrap(), 0);
    }
}
