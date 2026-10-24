-- Server-owned data; products live in snublecron's products.db.
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    email TEXT NOT NULL,
    favourites TEXT NOT NULL DEFAULT '[]',
    notify INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_after INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS visitors (
    month TEXT NOT NULL,
    subdomain TEXT NOT NULL,
    fresh INTEGER NOT NULL DEFAULT 0,
    newpage INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (month, subdomain)
);
