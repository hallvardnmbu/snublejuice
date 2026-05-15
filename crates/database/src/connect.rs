use mongodb::{
    Client, Database,
    options::{ClientOptions, ServerApi, ServerApiVersion},
};
use std::env;

pub async fn get_database(key: &str, db: &str) -> Result<Database, String> {
    match env::var(key) {
        Ok(uri) => {
            let mut options = ClientOptions::parse(uri)
                .await
                .expect("Could not parse the database uri.");

            let server_api = ServerApi::builder().version(ServerApiVersion::V1).build();
            options.server_api = Some(server_api);

            let client = Client::with_options(options).expect("Unable to create the client.");
            let database = client.database(db);

            Ok(database)
        }
        Err(error) => Err(format!("No database URI found: {:?}", error).to_string()),
    }
}
