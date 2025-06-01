import { MongoClient, ServerApiVersion } from "mongodb";

export async function databaseConnection() {
  try {
    const client = await MongoClient.connect(
      `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
      {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: false,
          deprecationErrors: true,
        },
      },
    );
    const db = client.db("snublejuice");

    return {
      metadata: db.collection("metadata"),
      users: db.collection("users"),
      products: db.collection("products"),
    };
  } catch (err) {
    console.error("Failed to connect to database", err);
    process.exit(1);
  }
}
