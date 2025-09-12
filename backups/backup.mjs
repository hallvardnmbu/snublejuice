import fs from "fs";
import path from "path";
import { BSON } from "bson";
import { MongoClient, ServerApiVersion } from "mongodb";

const log = (level, message) => {
  console.log(`${level} [backup] ${message}`);
};

const DIRECTORY = "./backups/backup/";
const COLLECTIONS = ["users", "metadata", "products"];

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR.trim()}:${process.env.MONGO_PWD.trim()}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  },
);

try {
  await client.connect();
  log("?", "Connected to database.");
} catch (error) {
  log("!", `Failed to connect to database: ${error.message}`);
  process.exit(1);
}

const database = client.db("snublejuice");

async function backup(suffix = "") {
  const today = new Date().toISOString().slice(0, 10);

  for (const name of COLLECTIONS) {
    log("?", `Creating a backup of ${name}.`);

    const collection = database.collection(name);
    const fileStream = fs.createWriteStream(
      path.join(DIRECTORY, `${today}-${name}${suffix}.bson`),
    );
    const cursor = collection.find({}).project({ _id: 0 });

    for await (const doc of cursor) {
      fileStream.write(BSON.serialize(doc));
    }
    fileStream.end();
  }
}

async function stringToDate() {
  const collection = database.collection("products");
  log("?", "Converting timestamp strings to date objects.");

  const cursor = collection.find(
    {
      "rating.updated": { $exists: true, $ne: null, $not: { $type: "date" } },
    },
    {
      projection: { index: 1, "rating.updated": 1, _id: 0 },
    },
  );

  const operations = [];
  for await (const item of cursor) {
    const dateValue = item.rating?.updated;
    if (!dateValue || ["", "None"].includes(dateValue)) {
      continue;
    }

    const newDate = new Date(dateValue);
    if (isNaN(newDate.getTime())) {
      log("!", `Skipping invalid date for index ${item.index}: "${dateValue}"`);
      continue;
    }

    operations.push({
      updateOne: {
        filter: { index: item.index },
        update: { $set: { "rating.updated": newDate } },
      },
    });
  }

  if (operations.length === 0) {
    log("?", "No documents required an update.");
    return;
  }

  log("?", `Updating ${operations.length} documents...`);
  return await collection.bulkWrite(operations);
}

async function restore(date) {
  log("?", "Creating a backup before restoring.");
  await backup(".bak");

  for (const name of COLLECTIONS.slice(0, 1)) {
    log("?", `Restoring ${name} from ${date}.`);

    const buffer = fs.readFileSync(
      path.join(DIRECTORY, `${date}-${name}.bson`),
    );

    const documents = [];
    let index = 0;
    while (index < buffer.length) {
      const docSize = buffer.readInt32LE(index);
      const docBuffer = buffer.subarray(index, index + docSize);
      documents.push(BSON.deserialize(docBuffer));
      index += docSize;
    }

    if (documents.length === 0) {
      log("!", `No data in ${name} backup! Aborting restore.`);
      return;
    }

    const collection = database.collection(name);
    await collection.deleteMany({});
    await collection.insertMany(documents, { ordered: false });
  }
}

async function main() {
  await backup();

  // Convert string dates to date objects.
  // await stringToDate();

  // [!] PERFORM A ROLLBACK [!]
  // await restore("2025-09-12");
}

try {
  await main();
  log("?", "Script completed successfully.");
} catch (error) {
  log("!", `Script failed: ${error.message}`);
  process.exit(1);
} finally {
  await client.close();
  log("?", "Database connection closed.");
}

process.exit(0);
