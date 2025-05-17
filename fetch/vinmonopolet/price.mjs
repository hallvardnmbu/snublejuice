import axios from "axios";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const log = (level, message) => {
  console.log(`[vmp pri] [${level}] ${message}`);
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
  log("?", "Connected to database.");
} catch (error) {
  log("!", `Failed to connect to database: ${error.message}`);
  process.exit(1);
}

const database = client.db("snublejuice");
const itemCollection = database.collection("products");
const metaCollection = database.collection("metadata");

const URL =
  "https://www.vinmonopolet.no/vmpws/v2/vmp/search?fields=FULL&searchType=product&currentPage={}&q=%3Arelevance";
const LINK = "https://www.vinmonopolet.no{}";

const IMAGE = {
  thumbnail: "https://bilder.vinmonopolet.no/bottle.png",
  product: "https://bilder.vinmonopolet.no/bottle.png",
};

function processImages(images) {
  return images
    ? images.reduce((acc, img) => ({ ...acc, [img.format]: img.url }), {})
    : IMAGE;
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

      updated: true,

      name: product.name || null,
      price: product.price?.value || 0.0,

      volume: product.volume?.value || 0.0,
      literprice:
        product.price?.value && product.volume?.value
          ? product.price.value / (product.volume.value / 100.0)
          : 0.0,

      url: product.url ? LINK.replace("{}", product.url) : null,
      images: product.images ? processImages(product.images) : IMAGE,

      category: product.main_category?.name || null,
      subcategory: product.main_sub_category?.name || null,

      country: product.main_country?.name || null,
      district: product.district?.name || null,
      subdistrict: product.sub_District?.name || null,

      selection: product.product_selection || null,
      sustainable: product.sustainable || false,

      buyable: product.buyable || false,
      expired: product.expired || true,
      status: product.status || null,

      orderable:
        product.productAvailability?.deliveryAvailability
          ?.availableForPurchase || false,
      orderinfo:
        product.productAvailability?.deliveryAvailability?.infos?.[0]
          ?.readableValue || null,

      instores:
        product.productAvailability?.storesAvailability?.availableForPurchase ||
        false,
      storeinfo:
        product.productAvailability?.storesAvailability?.infos?.[0]
          ?.readableValue || null,
    });
  }

  return processed;
}

async function getPage(page, alreadyUpdated, retry = false) {
  try {
    const response = await session.get(URL.replace("{}", page), {
      timeout: 10000,
    });

    if (response.status === 200) {
      return processProducts(
        response.data["productSearchResult"]["products"],
        alreadyUpdated,
      );
    }

    log("!", `Status code ${response.status} for page ${page}.`);
  } catch (err) {
    if (retry) {
      return null;
    }

    log("!", `Page: ${page}. Retrying. ${err.message}`);

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return getPage(page, alreadyUpdated, true);
    } catch (err) {
      log("!", `Page: ${page} failed: ${err.message}`);
    }
  }
}

async function updateDatabase(data) {
  const operations = data.map((record) => ({
    updateOne: {
      filter: { index: record.index },
      update: [
        { $set: { oldprice: "$price" } },
        { $set: record },
        { $set: { prices: { $ifNull: ["$prices", []] } } },
        { $set: { prices: { $concatArrays: ["$prices", ["$price"]] } } },
        {
          $set: {
            discount: {
              $cond: {
                if: {
                  $and: [
                    { $gt: ["$oldprice", 0] },
                    { $gt: ["$price", 0] },
                    { $ne: ["$oldprice", null] },
                    { $ne: ["$price", null] },
                  ],
                },
                then: {
                  $multiply: [
                    {
                      $divide: [
                        { $subtract: ["$price", "$oldprice"] },
                        "$oldprice",
                      ],
                    },
                    100,
                  ],
                },
                else: 0,
              },
            },
            literprice: {
              $cond: {
                if: {
                  $and: [
                    { $gt: ["$price", 0] },
                    { $gt: ["$volume", 0] },
                    { $ne: ["$price", null] },
                    { $ne: ["$volume", null] },
                  ],
                },
                then: {
                  $multiply: [
                    {
                      $divide: ["$price", "$volume"],
                    },
                    100,
                  ],
                },
                else: null,
              },
            },
          },
        },
        {
          $set: {
            alcoholprice: {
              $cond: {
                if: {
                  $and: [
                    { $gt: ["$literprice", 0] },
                    { $gt: ["$alcohol", 0] },
                    { $ne: ["$literprice", null] },
                    { $ne: ["$alcohol", null] },
                  ],
                },
                then: {
                  $divide: ["$literprice", "$alcohol"],
                },
                else: null,
              },
            },
          },
        },
      ],
      upsert: true,
    },
  }));

  return await itemCollection.bulkWrite(operations);
}

async function getProducts(startPage = 0, alreadyUpdated = []) {
  let items = [];
  let current = 0;
  const total = 1500;

  for (let page = startPage; page < 10000; page++) {
    try {
      let products = await getPage(page, alreadyUpdated);
      if (products.length === 0) {
        log("?", `Done. Final page: ${page - 1}.`);
        break;
      }

      items = items.concat(products);

      await new Promise((resolve) => setTimeout(resolve, 900));
    } catch (err) {
      log("!", `Page: ${page}. ${err}`);
      break;
    }

    // Upsert to the database every 10 pages.
    if (page % 10 === 0) {
      if (items.length === 0) {
        throw new Error(`No items for the last 10 pages. Aborting.`);
      }

      current += items.length;

      log("+", ` Updating ${items.length} records.`);
      const result = await updateDatabase(items);
      log("+", ` Modified ${result.modifiedCount}.`);
      log("+", ` Upserted ${result.upsertedCount}.`);

      items = [];

      log("?", `Progress: ${Math.floor((current / (total * 24)) * 100)} %`);
    }
  }

  // Upsert the remaining products, if any.
  if (items.length === 0) {
    return;
  }
  log("+", ` Updating ${items.length} final records.`);
  const result = await updateDatabase(items);
  log("+", ` Modified ${result.modifiedCount}.`);
  log("+", ` Upserted ${result.upsertedCount}.`);
}

async function syncUnupdatedProducts(threshold = null) {
  const unupdatedCount = await itemCollection.countDocuments({
    index: { $exists: true },
    updated: false,
  });
  log("?", `Non-updated items: ${unupdatedCount}`);
  if (threshold && unupdatedCount >= threshold) {
    log("!", `Above threshold (${unupdatedCount} >= ${threshold}). Aborting.`);
    return;
  }

  try {
    const result = await itemCollection.updateMany(
      { index: { $exists: true }, updated: false },
      [
        { $set: { oldprice: "$price" } },
        {
          $set: {
            price: "$oldprice",
            discount: 0,
            literprice: 0,
            alcoholprice: null,
          },
        },
        { $set: { prices: { $ifNull: ["$prices", []] } } },
        { $set: { prices: { $concatArrays: ["$prices", ["$price"]] } } },
      ],
    );

    log(
      "+",
      `Modified ${result.modifiedCount} empty prices to unupdated products.`,
    );
  } catch (err) {
    log("!", `Adding unupdated prices: ${err.message}`);
  }
}

const session = axios.create();

async function main() {
  try {
    await metaCollection.updateOne(
      { id: "stock" },
      { $set: { "prices.vinmonopolet": false } },
    );
    log("+", "Set prices.vinmonopolet to false in metadata.");
  } catch (error) {
    log("!", `Failed to update metadata: ${error.message}`);
    process.exit(1);
  }

  await itemCollection.updateMany({}, { $set: { updated: false } });
  const alreadyUpdated = await itemCollection
    .find({ updated: true })
    .map((item) => item.index)
    .toArray();

  const startPage = 0;
  await getProducts(startPage, alreadyUpdated);

  // [!] ONLY RUN THIS AFTER ALL PRICES HAVE BEEN UPDATED [!]
  await syncUnupdatedProducts();

  try {
    await metaCollection.updateOne(
      { id: "stock" },
      { $set: { "prices.vinmonopolet": true } },
    );
    log("+", "Set prices.vinmonopolet to true in metadata.");
  } catch (error) {
    abort(`Failed to update metadata: ${error.message}`);
  }
}

await main();

try {
  await client.close();
  log("?", "Database connection closed.");
} catch (error) {
  log("!", `Failed to close database connection: ${error.message}`);
}
