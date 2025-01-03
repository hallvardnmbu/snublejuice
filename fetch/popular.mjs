import axios from "axios";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

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
await client.connect();

const database = client.db("snublejuice");
const itemCollection = database.collection("products");
const visitCollection = database.collection("visits");

const URL =
  "https://www.vinmonopolet.no/vmpws/v2/vmp/search?fields=FULL&searchType=product&q={}:relevance";

async function processId(index) {
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

    console.log(`Status code ${response.status} at page ${page}; ${err}`);
  } catch (err) {
    console.log(`Request failed with for index ${index}: ${err}`);
  }

  throw new Error(`Failed to fetch index ${index} after 5 attempts.`);
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

  for (const element of itemIds) {
    const id = element["index"];
    console.log(`Id ${id}.`);

    try {
      let product = await processId(id);
      if (!product) {
        console.log(`Unable to find product of Id ${id}. Aborting.`);
        break;
      } else {
        items.push(product);

        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    } catch (err) {
      console.log(`Error: Id ${id}. Skipping this. ${err}`);
      break;
    }

    // Upsert to the database every 10 items.
    if (items.length >= 10) {
      console.log(`Adding ${items.length} products.`);
      const result = await updateDatabase(items);
      console.log(` Modified ${result.modifiedCount} records`);
      console.log(` Upserted ${result.upsertedCount} records`);

      items = [];
    }
  }

  // Insert the remaining products, if any.
  if (items.length === 0) {
    return;
  }
  console.log(`Adding ${items.length} final products.`);
  const result = await updateDatabase(items);
  console.log(` Modified ${result.modifiedCount} records`);
  console.log(` Upserted ${result.upsertedCount} records`);
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

  // Display the number of items to be updated.
  console.log(`Updating ${itemIds.length} items.`);
  await updateStores(itemIds);

  // Store the time of the last update.
  await visitCollection.updateOne(
    { class: "updated" },
    { $set: { date: new Date() } },
    { upsert: true },
  );
}

await main();

client.close();
