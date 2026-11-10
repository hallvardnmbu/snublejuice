use futures::StreamExt;
use geo::{Distance, Haversine, Point};
use mongodb::{Collection, Database, bson::doc};
use shared::{
    models::{MAX_STORES_IN_DISTANCE, Store},
    query::Parameters,
    subdomain::Subdomain,
};

fn nearest_stores(
    stores: &[Store],
    latitude: f64,
    longitude: f64,
    max_distance_m: f64,
) -> Vec<(&Store, f64)> {
    let user = Point::new(longitude, latitude);

    let mut hits: Vec<_> = stores
        .iter()
        .map(|store| {
            (
                store,
                Haversine.distance(
                    user,
                    Point::new(store.position.longitude, store.position.latitude),
                ),
            )
        })
        .filter(|(_, distance)| *distance <= max_distance_m)
        .collect();

    hits.sort_by(|a, b| a.1.total_cmp(&b.1));
    hits.truncate(MAX_STORES_IN_DISTANCE);
    hits
}

pub async fn get_closest_stores(
    db: &Database,
    subdomain: &Subdomain,
    parameters: &Parameters,
) -> Option<Vec<Store>> {
    if !subdomain.is_vinmonopolet() {
        return None;
    };

    let (latitude, longitude, distance) = match (parameters.latitude, parameters.longitude, parameters.distance) {
        (Some(lat), Some(lon), Some(dis)) => (lat, lon, dis),
        _ => {
            return None;
        }
    };

    let collection: Collection<Store> = db.collection("stores");

    let mut stores: Vec<Store> = Vec::new();

    match collection.find(doc! {}).await {
        Ok(mut cursor) => {
            while let Some(result) = cursor.next().await {
                if let Ok(store) = result {
                    stores.push(store);
                }
            }
        }
        Err(error) => {
            eprintln!("MongoDB find error: {:?}", error);
            return None;
        }
    }

    Some(
        nearest_stores(
            &stores,
            latitude,
            longitude,
            distance,
        )
        .into_iter()
        .map(|(store, _distance)| store.clone())
        .collect(),
    )
}
