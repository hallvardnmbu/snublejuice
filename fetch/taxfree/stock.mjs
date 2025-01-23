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
const itemCollection = database.collection("taxfree");
const visitCollection = database.collection("visits");

const URL = JSON.parse(process.env.TAXFREE);

const STORES = {
  5135: "Stavanger",
  5136: "Stavanger, Tyrkia ankomst",
  5145: "Bergen, Avgang",
  5148: "Bergen, Ankomst",
  5155: "Trondheim",
  5111: "Oslo, Ankomst",
  5114: "Oslo, Avgang",
  5115: "Oslo, Domestic Transfer",

  5110: null,
  5104: null,
  5149: null,
};

const LINKS = {
  image: "https://cdn.tax-free.no",
  product: "https://www.tax-free.no",
};
const IMAGE = {
  thumbnail: "https://bilder.vinmonopolet.no/bottle.png",
  product: "https://bilder.vinmonopolet.no/bottle.png",
};
function processImages(images) {
  if (!images) return IMAGE;

  return Object.fromEntries(
    Object.entries(images).map(([format, urlEnd]) => [format, `${LINKS.image}${urlEnd}`]),
  );
}

function processProducts(products, alreadyUpdated) {
  const processed = [];

  for (const product of products) {
    const index = parseInt(product.code, 10) || null;

    // Extra check to avoid duplicates.
    // The alreadyUpdated is set in the main function below.
    // Only used if the scraping crashes and needs to be restarted.
    // In this way, it skips the already processed products (before crash).
    if (alreadyUpdated.includes(index)) {
      continue;
    }

    processed.push({
      index: index,

      stores: product.inPhysicalStockInCodes
        ? product.inPhysicalStockInCodes
            .map((code) => STORES[code])
            .filter((store) => store !== null)
        : null,
      // stores: {
      //   online: product.inOnlineStockInCodes
      //     ? product.inOnlineStockInCodes
      //         .map((code) => STORES[code])
      //         .filter((store) => store !== null)
      //     : null,
      //   physical: product.inPhysicalStockInCodes
      //     ? product.inPhysicalStockInCodes
      //         .map((code) => STORES[code])
      //         .filter((store) => store !== null)
      //     : null,
      // },
    });
  }

  return processed;
}

async function getPage(order, alreadyUpdated) {
  try {
    const response = await fetch(URL.url, {
      method: "POST",
      headers: URL.headers,
      body: JSON.stringify({
        requests: URL.requests.map((req) => ({
          ...req,
          indexName: req.indexName.replace("{}", order),
        })),
      }),
    });

    if (response.status === 200) {
      const data = await response.json();
      return processProducts(data.results[0].hits, alreadyUpdated);
    }

    console.log(`STATUS | ${response.status} | Order: ${order}.`);
  } catch (err) {
    console.log(`ERROR | Order: ${order} | ${err.message}`);
  }
}

async function updateDatabase(data) {
  const operations = data.map((record) => ({
    updateOne: {
      filter: { index: record.index },
      update: [{ $set: record }],
    },
  }));

  return await itemCollection.bulkWrite(operations);
}

async function getStock() {
  let items = [];
  let alreadyUpdated = [];

  let count = 0;

  for (const order of ["asc", "desc"]) {
    try {
      let products = await getPage(order, alreadyUpdated);
      if (products.length === 0) {
        console.log(`DONE | Final order: ${order}.`);
        break;
      }

      items = items.concat(products);
      alreadyUpdated = alreadyUpdated.concat(items.map((item) => item.index));

      await new Promise((resolve) => setTimeout(resolve, 900));
    } catch (err) {
      console.log(`ERROR | Order: ${order} | ${err}`);
      break;
    }

    if (items.length === 0) {
      throw new Error(`No items. Aborting.`);
    }

    count += items.length;

    console.log(`UPDATING | ${items.length} records.`);
    const result = await updateDatabase(items);
    console.log(`         | Modified ${result.modifiedCount}.`);
    console.log(`         | Upserted ${result.upsertedCount}.`);

    items = [];
  }

  console.log(`DONE | Total items: ${count}.`);
  return;
}

async function main() {
  await itemCollection.updateMany({}, { $set: { stores: null } });
  await getStock();

  await visitCollection.updateOne({ class: "taxfree" }, { $set: { date: new Date() } });
}

await main();

client.close();
