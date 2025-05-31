// fetch/vinmonopolet/price.mjs
import axios from "axios";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import * as errorHandler from '../lib/errorHandler.mjs';

dotenv.config();

const SCRIPT_NAME = 'vmp-price';

const log = (level, message) => {
  const msgStr = (message !== null && message !== undefined) ? message.toString() : "";
  console.log(`${level} [${SCRIPT_NAME}] ${msgStr}`);
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
  if (!products || !Array.isArray(products)) {
    log("!", "processProducts received invalid products data.");
    return processed;
  }
  for (const product of products) {
    const index = parseInt(product.code, 10) || null;
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
        product.price?.value && product.volume?.value && product.volume.value > 0
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

async function getPage(page, alreadyUpdated, isPartOfMainRetryLoop = false) {
  const requestUrl = URL.replace("{}", page);
  let firstAttemptErrorMessage = "";

  try {
    const response = await session.get(requestUrl, { timeout: 10000 });
    if (response.status === 200) {
      if (response.data && response.data["productSearchResult"] && response.data["productSearchResult"]["products"]) {
        return processProducts(response.data["productSearchResult"]["products"], alreadyUpdated);
      } else {
        firstAttemptErrorMessage = `No product data in response for page ${page}. URL: ${requestUrl}`;
        log("!", firstAttemptErrorMessage);
      }
    } else {
      firstAttemptErrorMessage = `Status code ${response.status} for page ${page}. URL: ${requestUrl}`;
      log("!", firstAttemptErrorMessage);
    }
  } catch (err) {
    firstAttemptErrorMessage = `Exception during initial fetch for page ${page}. URL: ${requestUrl}. Error: ${err.message}`;
    log("!", firstAttemptErrorMessage);
  }

  if (isPartOfMainRetryLoop) {
    errorHandler.addItemToErrorList({ type: 'page', pageNumber: page, url: requestUrl }, SCRIPT_NAME, `Failed on main retry loop: ${firstAttemptErrorMessage}`);
    return null;
  } else {
    log("?", `Page ${page}. Attempting one internal retry. Initial error: ${firstAttemptErrorMessage}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const response = await session.get(requestUrl, { timeout: 10000 });
      if (response.status === 200) {
        if (response.data && response.data["productSearchResult"] && response.data["productSearchResult"]["products"]) {
          log("?", `Successfully fetched page ${page} on internal retry.`);
          return processProducts(response.data["productSearchResult"]["products"], alreadyUpdated);
        } else {
          const retryFailMessage = `No product data in response for page ${page} on internal retry. URL: ${requestUrl}`;
          log("!", retryFailMessage);
          errorHandler.addItemToErrorList({ type: 'page', pageNumber: page, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
          return null;
        }
      }
      const retryFailMessage = `Internal retry failed: Status code ${response.status} for page ${page}. URL: ${requestUrl}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'page', pageNumber: page, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
      return null;
    } catch (retryErr) {
      const retryFailMessage = `Internal retry failed with exception: Page ${page}. URL: ${requestUrl}. Error: ${retryErr.message}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'page', pageNumber: page, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
      return null;
    }
  }
}

async function getProducts(startPage = 0, alreadyUpdated = []) {
  let items = [];
  let currentTotalProcessed = 0;
  const estimatedTotalProducts = 36000;

  for (let page = startPage; page < 10000; page++) {
    let products = await getPage(page, alreadyUpdated, false);

    if (!products) {
        log("?", `Page ${page} fetch failed ultimately and error was recorded by getPage. Continuing to next page.`);
    } else if (products.length === 0) {
        log("?", `No products returned for page ${page}. Assuming end of data. Final page attempted: ${page}.`);
        break;
    }

    if (products) {
        items = items.concat(products);
    }

    await new Promise((resolve) => setTimeout(resolve, 900));

    if (page % 10 === 0 && page !== startPage) {
      if (items.length > 0) {
        log("+", `Updating ${items.length} records from pages ${page - 9}-${page}.`);
        try {
            const result = await updateDatabase(items);
            log("+", `DB Update: Modified ${result.modifiedCount}. Upserted ${result.upsertedCount}.`);
            currentTotalProcessed += items.length;
        } catch (dbError) {
            log("!", `DATABASE ERROR during periodic update for pages ${page - 9}-${page}: ${dbError.message}.`);
        }
        items = [];
      } else {
        log("?", `No new items to update for batch ending at page ${page}.`);
      }
      log("?", `Progress: ${Math.floor((currentTotalProcessed / estimatedTotalProducts) * 100)} % (${currentTotalProcessed}/${estimatedTotalProducts})`);
    }
  }

  if (items.length > 0) {
    log("+", `Updating ${items.length} final records.`);
    try {
        const result = await updateDatabase(items);
        log("+", `DB Update (Final): Modified ${result.modifiedCount}. Upserted ${result.upsertedCount}.`);
        currentTotalProcessed += items.length;
    } catch (dbError) {
        log("!", `DATABASE ERROR during final update: ${dbError.message}.`);
    }
  }
  log("?", `Total products processed in getProducts: ${currentTotalProcessed}`);
}

async function updateDatabase(data) {
  if (!data || data.length === 0) return { modifiedCount: 0, upsertedCount: 0 };
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
                    { $ne: ["$oldprice", null] }, { $ne: ["$price", null] },
                    { $gt: ["$oldprice", 0] }, { $gt: ["$price", 0] },
                    { $ne: ["$oldprice", "$price"] }
                  ],
                },
                then: { $multiply: [ { $divide: [ { $subtract: ["$price", "$oldprice"] }, "$oldprice" ] }, 100 ] },
                else: 0,
              },
            },
            literprice: {
              $cond: {
                if: { $and: [ { $ne: ["$price", null] }, { $ne: ["$volume", null] }, { $gt: ["$price", 0] }, { $gt: ["$volume", 0] } ] },
                then: { $multiply: [ { $divide: ["$price", "$volume"] }, 100 ] },
                else: null,
              },
            },
          },
        },
        {
          $set: {
            alcoholprice: {
              $cond: {
                if: { $and: [ { $ne: ["$literprice", null] }, { $ne: ["$alcohol", null] }, { $gt: ["$literprice", 0] }, { $gt: ["$alcohol", 0] } ] },
                then: { $divide: ["$literprice", "$alcohol"] },
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

async function syncUnupdatedProducts() {
  const unupdatedCount = await itemCollection.countDocuments({
    index: { $exists: true },
    updated: false,
  });
  log("?", `Sync: Found ${unupdatedCount} products not marked as 'updated' by this script run.`);

  if (unupdatedCount === 0) {
    log("?", "Sync: No products require price preservation via syncUnupdatedProducts.");
    return;
  }

  try {
    const result = await itemCollection.updateMany(
      { index: { $exists: true }, updated: false },
      [
        { $set: { oldprice: "$price" } },
        { $set: { discount: 0 } },
        { $set: { prices: { $ifNull: ["$prices", []] } } },
        { $set: { prices: { $concatArrays: ["$prices", ["$price"]] } } },
      ],
    );
    log("+", `Sync: Processed ${result.modifiedCount} products to preserve their last known price and reset discount.`);
  } catch (err) {
    log("!", `Sync: Error during syncUnupdatedProducts: ${err.message}`);
  }
}

const session = axios.create();

async function main() {
  log("?", "Script starting.");
  try {
    await metaCollection.updateOne(
      { id: "stock" },
      { $set: { "prices.vinmonopolet": false } }, { upsert: true }
    );
    log("+", "Metadata: prices.vinmonopolet set to false.");
  } catch (error) {
    log("!", `Failed to update initial metadata: ${error.message}. Continuing...`);
  }

  log("?", "Marking all products as not updated for this run...");
  try {
    const updateResult = await itemCollection.updateMany({}, { $set: { updated: false } });
    log("?", `Marked ${updateResult.modifiedCount} products as {updated: false}.`);
  } catch (dbError) {
    log("!", `DATABASE ERROR while marking products as not updated: ${dbError.message}. Exiting.`);
    process.exit(1);
  }

  const alreadyUpdated = [];

  const startPage = 0;
  await getProducts(startPage, alreadyUpdated);

  let persistentErrorCountAfterRetries = 0;
  const initialErrors = errorHandler.getErrorList();

  if (initialErrors.length > 0) {
    log("!", `Initial fetch phase completed with ${initialErrors.length} errors.`);

    if (initialErrors.length > errorHandler.getErrorThreshold()) {
      log("!", `Error count (${initialErrors.length}) exceeds threshold of ${errorHandler.getErrorThreshold()}. Aborting retries.`);
      persistentErrorCountAfterRetries = initialErrors.length;
    } else {
      log("?", `Attempting to retry ${initialErrors.length} failed items.`);
      errorHandler.clearErrorList();
      let successfullyRetriedProducts = [];

      for (const errorEntry of initialErrors) {
        if (errorEntry.item.type === 'page') {
          log("?", `Retrying page: ${errorEntry.item.pageNumber}. Original error: ${errorEntry.errorMessage}`);
          const products = await getPage(errorEntry.item.pageNumber, alreadyUpdated, true);

          if (products && products.length > 0) {
            log("+", `Successfully retried and fetched ${products.length} products from page ${errorEntry.item.pageNumber}.`);
            successfullyRetriedProducts = successfullyRetriedProducts.concat(products);
          } else {
            log("!", `Failed to fetch page ${errorEntry.item.pageNumber} even after explicit retry in main loop.`);
          }
        }
      }

      if (successfullyRetriedProducts.length > 0) {
        log("+", `Updating database with ${successfullyRetriedProducts.length} successfully retried records.`);
        try {
            const result = await updateDatabase(successfullyRetriedProducts);
            log("+", `Retried DB Update - Modified ${result.modifiedCount}. Upserted ${result.upsertedCount}.`);
        } catch (dbError) {
            log("!", `DATABASE ERROR during update of retried items: ${dbError.message}`);
        }
      }
      persistentErrorCountAfterRetries = errorHandler.getErrorCount();
    }
  }

  if (initialErrors.length > errorHandler.getErrorThreshold()) {
    log("!", `Skipping syncUnupdatedProducts due to initial error count (${initialErrors.length}) exceeding threshold.`);
  } else {
    log("?", "Proceeding with syncUnupdatedProducts.");
    await syncUnupdatedProducts();
  }

  try {
    await metaCollection.updateOne(
      { id: "stock" },
      { $set: { "prices.vinmonopolet": true } }
    );
    log("+", "Metadata: prices.vinmonopolet set to true (final step).");
  } catch (error) {
    log("!", `Failed to update final metadata: ${error.message}.`);
  }

  if (initialErrors.length > errorHandler.getErrorThreshold()) {
    log("!", `EXITING: Initial error count (${initialErrors.length}) exceeded threshold (${errorHandler.getErrorThreshold()}).`);
    process.exit(1);
  } else if (persistentErrorCountAfterRetries > 0) {
    log("!", `EXITING: Script finished with ${persistentErrorCountAfterRetries} unresolved errors after retry attempts.`);
    errorHandler.getErrorList().forEach(err => {
         log("!", `Unresolved: Script: ${err.scriptName}, Item: ${JSON.stringify(err.item)}, Msg: ${err.errorMessage}`);
    });
    process.exit(1);
  } else {
    log("?", "Script completed successfully with no unresolved errors.");
    process.exit(0);
  }
}

await main();

try {
  await client.close();
  log("?", "Database connection closed.");
} catch (error) {
  log("!", `Failed to close database connection: ${error.message}`);
}
