import axios from "axios";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const log = (level, message) => {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
};

const abort = (error) => {
  log("ERROR", error.message || error);
  process.exit(1);
};

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
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
  log("INFO", "Connected to MongoDB.");
} catch (error) {
  abort(`Failed to connect to MongoDB: ${error.message}`);
}

const database = client.db("snublejuice");
const itemCollection = database.collection("products");
const metaCollection = database.collection("metadata");

const URL =
  "https://www.vinmonopolet.no/vmpws/v2/vmp/search?fields=FULL&searchType=product&q={}:relevance";

async function processId(index, retry = false) {
  try {
    const response = await session.get(URL.replace("{}", index), {
      timeout: 10000,
    });

    if (response.status === 200) {
      const responseData = response.data.productSearchResult || {};

      const store = responseData.facets
        ? responseData.facets
            .filter((element) => element.name.toLowerCase() === "butikker")
            .map((element) => element.values || [])
        : [];

      if (!responseData.products || responseData.products.length === 0) {
        return {
          index: index,
          updated: false,
          status: "utgått",
          buyable: false,
          orderable: false,
          orderinfo: null,
          instores: false,
          storeinfo: null,
          stores: null,
        };
      }

      const product = responseData.products[0];

      return {
        index: index,

        updated: true,

        stores: store.flat().map((element) => element.name),

        status: product.status || null,
        buyable: product.buyable || false,
        expired: product.expired || true,

        orderable: product.productAvailability?.deliveryAvailability?.availableForPurchase || false,
        orderinfo:
          product.productAvailability?.deliveryAvailability?.infos?.[0]?.readableValue || null,
        instores: product.productAvailability?.storesAvailability?.availableForPurchase || false,
        storeinfo:
          product.productAvailability?.storesAvailability?.infos?.[0]?.readableValue || null,
      };
    }

    log("INFO", `STATUS | ${response.status} | Item: ${index}.`);
  } catch (err) {
    if (retry) {
      return null;
    }

    log("WARN", `ERROR | Item: ${index} | Retrying. ${err.message}`);

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return processId(index, true);
    } catch (err) {
      log("ERROR", `ERROR | Item: ${index} | Failed. ${err.message}`);
    }
  }
}

async function updateDatabase(data) {
  const operations = data.map((record) => ({
    updateOne: {
      filter: { index: record.index },
      update: { $set: record },
      upsert: true,
    },
  }));

  return await itemCollection.bulkWrite(operations);
}

async function updateStores(itemIds) {
  let items = [];
  let current = 0;
  const total = itemIds.length;

  log("INFO", `UPDATING | ${total} discounted items.`);

  for (const element of itemIds) {
    const id = element["index"];

    try {
      let product = await processId(id);
      if (!product) {
        log("ERROR", `ERROR | Item: ${id} | Aborting.`);
        break;
      } else {
        items.push(product);

        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    } catch (err) {
      log("ERROR", `ERROR | Item: ${id} | Aborting. | ${err.message}`);
      break;
    }

    // Upsert to the database every 10 items.
    if (items.length >= 10) {
      log("INFO", `UPDATING | ${items.length} records.`);
      const result = await updateDatabase(items);
      log("INFO", `Modified ${result.modifiedCount} records.`);
      log("INFO", `Upserted ${result.upsertedCount} records.`);

      items = [];
    }

    current++;

    if (current % 10 === 0) {
      log("INFO", `Progress: ${Math.floor((current / total) * 100)} %`);
    }
  }

  // Insert the remaining products, if any.
  if (items.length === 0) {
    return;
  }
  log("INFO", `UPDATING | ${items.length} records.`);
  const result = await updateDatabase(items);
  log("INFO", `Modified ${result.modifiedCount} records.`);
  log("INFO", `Upserted ${result.upsertedCount} records.`);
}

const session = axios.create();

async function main() {
  // Reset stores prior to fetching new data.
  await itemCollection.updateMany({ stores: { $exists: true } }, { $set: { stores: [] } });

  // Fetch products with discount.
  const itemIds = await itemCollection
    .find({ discount: { $lt: 0.0 } })
    .project({ index: 1, _id: 0 })
    .toArray();
  await updateStores(itemIds);

  // Store the time of the last update.
  await metaCollection.updateOne(
    { id: "stock" },
    { $set: { vinmonopolet: new Date() } },
    { upsert: true },
  );
}

try {
  await main();
  log("INFO", "Script completed successfully.");
} catch (error) {
  abort(`Script failed: ${error.message}`);
} finally {
  await client.close();
  log("INFO", "MongoDB connection closed.");
}

client.close();
