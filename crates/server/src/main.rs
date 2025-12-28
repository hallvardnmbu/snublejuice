use {database, routes};

fn main() {
    println!("Hello from server!");

    database::fetch::database();
    routes::router::router();

    match database::fetch::process() {
        Ok(_) => {}
        Err(err) => println!("{}", err),
    }
}
