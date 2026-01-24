use std::env;
use std::sync::OnceLock;

// Global config instance
pub static CONFIG: OnceLock<Config> = OnceLock::new();

#[derive(Debug)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub port: u16,
}

impl Config {
    pub fn init() -> &'static Config {
        // Load .env file if it exists
        dotenv::dotenv().ok();

        let config = Config {
            database_url: env::var("DATABASE").unwrap_or_else(|_| "sqlite:snublejuice.db".to_string()),
            jwt_secret: env::var("JWT_KEY").expect("JWT_KEY must be set in .env or environment"),
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
        };

        CONFIG.get_or_init(|| config)
    }
}

pub fn get() -> &'static Config {
    CONFIG.get().expect("Config must be initialized")
}
