use axum::http::{HeaderMap, header};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use time::Duration as TimeDuration;

pub const FLASH_COOKIE: &str = "flash";

pub fn cookie_domain() -> String {
    std::env::var("COOKIE_DOMAIN").unwrap_or_else(|_| "snublejuice.localhost".to_string())
}

pub fn set_flash(jar: CookieJar, message: &str) -> CookieJar {
    let cookie = Cookie::build((FLASH_COOKIE, message.to_string()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(TimeDuration::seconds(10))
        .build();
    jar.add(cookie)
}

pub fn take_flash(jar: CookieJar) -> (CookieJar, Option<String>) {
    if let Some(cookie) = jar.get(FLASH_COOKIE) {
        let message = cookie.value().to_string();
        let removal = Cookie::build((FLASH_COOKIE, ""))
            .path("/")
            .max_age(TimeDuration::ZERO)
            .build();
        (jar.remove(removal), Some(message))
    } else {
        (jar, None)
    }
}

pub fn clear_session_cookie(jar: CookieJar) -> CookieJar {
    let cookie = Cookie::build(("session_id", ""))
        .path("/")
        .domain(cookie_domain())
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .max_age(TimeDuration::ZERO)
        .build();
    jar.remove(cookie)
}

pub fn referer_path(headers: &HeaderMap) -> String {
    let Some(referer) = headers.get(header::REFERER).and_then(|v| v.to_str().ok()) else {
        return "/".to_string();
    };

    if referer.starts_with('/') && !referer.starts_with("//") {
        return referer.to_string();
    }

    if let Some(after_scheme) = referer
        .strip_prefix("https://")
        .or_else(|| referer.strip_prefix("http://"))
        && let Some(slash_idx) = after_scheme.find('/')
    {
        let path = &after_scheme[slash_idx..];
        if !path.starts_with("//") {
            return path.to_string();
        }
    }

    "/".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flash_set_and_take_roundtrip() {
        let jar = CookieJar::new();
        let jar = set_flash(jar, "Feil brukernavn eller passord.");
        assert_eq!(
            jar.get(FLASH_COOKIE).map(|c| c.value()),
            Some("Feil brukernavn eller passord.")
        );

        let (jar, msg) = take_flash(jar);
        assert_eq!(msg.as_deref(), Some("Feil brukernavn eller passord."));
        assert!(jar.get(FLASH_COOKIE).is_none());
    }

    #[test]
    fn referer_path_extracts_local_path() {
        let mut headers = HeaderMap::new();
        assert_eq!(referer_path(&headers), "/");

        headers.insert(
            header::REFERER,
            "https://vinmonopolet.snublejuice.no/favourites".parse().unwrap(),
        );
        assert_eq!(referer_path(&headers), "/favourites");

        headers.insert(
            header::REFERER,
            "https://snublejuice.no".parse().unwrap(),
        );
        assert_eq!(referer_path(&headers), "/");
    }
}
