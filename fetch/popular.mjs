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

    console.log(`STATUS ${response.status} #${index}.`);
  } catch (err) {
    console.log(`ERROR #${index}: ${err}`);
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

  for (const element of itemIds) {
    const id = element["index"];

    try {
      let product = await processId(id);
      if (!product) {
        console.log(`NONEXISTING #${id}. Aborting.`);
        break;
      } else {
        items.push(product);

        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    } catch (err) {
      console.log(`ERROR #${id}. Aborting. ${err}`);
      break;
    }

    // Upsert to the database every 10 items.
    if (items.length >= 10) {
      console.log(`UPDATING ${items.length} records.`);
      const result = await updateDatabase(items);
      console.log(` Modified ${result.modifiedCount}. Upserted ${result.upsertedCount}.`);

      items = [];
    }

    current++;

    if (current % 10 === 0) {
      console.log(`PROGRESS: ${Math.floor((current / total) * 100)} %`);
    }
  }

  // Insert the remaining products, if any.
  if (items.length === 0) {
    return;
  }
  console.log(`UPDATING ${items.length} final records.`);
  const result = await updateDatabase(items);
  console.log(` Modified ${result.modifiedCount}. Upserted ${result.upsertedCount}.`);
}

const session = axios.create();

async function main() {
  // Reset stores prior to fetching new data.
  await itemCollection.updateMany({ stores: { $exists: true } }, { $set: { stores: [] } });

  // Fetch products with discount.
  const itemIds = await itemCollection
    .find({ discount: { $lt: -2.5 } })
    .project({ index: 1, _id: 0 })
    .toArray();
  await updateStores(itemIds);

  // Store the time of the last update.
  await visitCollection.updateOne(
    { class: "stores" },
    { $set: { date: new Date() } },
    { upsert: true },
  );
}

await main();

client.close();
