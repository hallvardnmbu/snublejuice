// fetch/vinmonopolet/popular.mjs
import axios from "axios";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import * as errorHandler from '../lib/errorHandler.mjs';

dotenv.config();

const SCRIPT_NAME = 'vmp-popular';

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
  process.exit(1); // Early exit
}

const database = client.db("snublejuice");
const itemCollection = database.collection("products");
const metaCollection = database.collection("metadata");

const PRODUCT_INFO_URL_TEMPLATE =
  "https://www.vinmonopolet.no/vmpws/v2/vmp/products/search?fields=FULL&pageSize=1&currentPage=0&q={}%3Arelevance";

async function fetchPopularProductInfo(productId, isPartOfMainRetryLoop = false) {
  const requestUrl = PRODUCT_INFO_URL_TEMPLATE.replace("{}", productId);
  let firstAttemptErrorMessage = "";

  try {
    const response = await session.get(requestUrl, { timeout: 10000 });

    if (response.status === 200) {
      const responseData = response.data || {};
      const storeFacet = responseData.facets
        ? responseData.facets.find((element) => element.code === "availableInStores")
        : null;
      const stores = storeFacet ? (storeFacet.values || []).map(val => val.name) : [];

      if (
        !responseData.products ||
        responseData.products.length === 0 ||
        parseInt(responseData.products[0].code) !== productId // Ensure the product returned matches the ID queried
      ) {
        // Product likely discontinued or data mismatch
        log("?", `Product ID ${productId} not found or mismatched in popular search. Marking as expired.`);
        return {
          index: productId,
          updated: true, // Processed, even if to mark as expired
          status: "utgått",
          buyable: false,
          orderable: false,
          orderinfo: null,
          instores: false,
          storeinfo: null,
          stores: [], // No stores if expired
        };
      }

      const product = responseData.products[0];
      return {
        index: productId,
        updated: true,
        stores: stores,
        status: product.status || null,
        buyable: product.buyable || false,
        expired: product.expired || true,
        orderable: product.productAvailability?.deliveryAvailability?.availableForPurchase || false,
        orderinfo: product.productAvailability?.deliveryAvailability?.infos?.[0]?.readableValue || null,
        instores: product.productAvailability?.storesAvailability?.availableForPurchase || false,
        storeinfo: product.productAvailability?.storesAvailability?.infos?.[0]?.readableValue || null,
      };
    }
    firstAttemptErrorMessage = `Status ${response.status} for popular product ${productId}. URL: ${requestUrl}`;
    log("!", firstAttemptErrorMessage);
  } catch (err) {
    firstAttemptErrorMessage = `Exception for popular product ${productId}. URL: ${requestUrl}. Error: ${err.message}`;
    log("!", firstAttemptErrorMessage);
  }

  if (isPartOfMainRetryLoop) {
    errorHandler.addItemToErrorList({ type: 'popularProduct', productId: productId, url: requestUrl }, SCRIPT_NAME, `Failed on main retry: ${firstAttemptErrorMessage}`);
    return null;
  } else {
    log("?", `Popular product ${productId}. Internal retry. Initial error: ${firstAttemptErrorMessage}`);
    await new Promise((resolve) => setTimeout(resolve, 15000)); // Longer delay as per original script
    try {
      const response = await session.get(requestUrl, { timeout: 10000 });
      if (response.status === 200) {
        const responseData = response.data || {};
        const storeFacet = responseData.facets ? responseData.facets.find(el => el.code === "availableInStores") : null;
        const stores = storeFacet ? (storeFacet.values || []).map(val => val.name) : [];

        if (!responseData.products || responseData.products.length === 0 || parseInt(responseData.products[0].code) !== productId) {
          log("!", `Popular product ID ${productId} not found/mismatched on retry. Marking expired.`);
          errorHandler.addItemToErrorList({ type: 'popularProduct', productId: productId, url: requestUrl }, SCRIPT_NAME, "Not found/mismatched on retry");
          // Still return the "expired" object for DB update rather than null, as this isn't a connection failure
          return { index: productId, updated: true, status: "utgått", buyable: false, orderable: false, orderinfo: null, instores: false, storeinfo: null, stores: [] };
        }
        const product = responseData.products[0];
        log("?", `Successfully fetched popular product ${productId} on internal retry.`);
        return {
            index: productId, updated: true, stores: stores, status: product.status || null,
            buyable: product.buyable || false, expired: product.expired || true,
            orderable: product.productAvailability?.deliveryAvailability?.availableForPurchase || false,
            orderinfo: product.productAvailability?.deliveryAvailability?.infos?.[0]?.readableValue || null,
            instores: product.productAvailability?.storesAvailability?.availableForPurchase || false,
            storeinfo: product.productAvailability?.storesAvailability?.infos?.[0]?.readableValue || null,
        };
      }
      const retryFailMessage = `Internal retry for popular product ${productId} failed: Status ${response.status}. URL: ${requestUrl}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'popularProduct', productId: productId, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
      return null;
    } catch (retryErr) {
      const retryFailMessage = `Internal retry for popular product ${productId} failed with exception. URL: ${requestUrl}. Error: ${retryErr.message}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'popularProduct', productId: productId, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
      return null;
    }
  }
}

async function updateProductsInDB(data) {
  if (!data || data.length === 0) return { modifiedCount: 0, upsertedCount: 0 };
  const operations = data.map((record) => ({
    updateOne: {
      filter: { index: record.index },
      update: { $set: record },
      upsert: true, // Product should exist, but upsert for safety
    },
  }));
  try {
    const result = await itemCollection.bulkWrite(operations);
    log("+", `DB Update (Popular): Matched ${result.matchedCount}, Modified ${result.modifiedCount}, Upserted ${result.upsertedCount}.`);
    return result;
  } catch (dbError) {
    log("!", `DATABASE ERROR during popular product update: ${dbError.message}`);
    throw dbError; // Propagate to be caught by main try/catch if necessary
  }
}

async function updatePopularItemsWorkflow(productIds) {
  let itemsToUpdateInDB = [];
  let currentCount = 0;
  const totalCount = productIds.length;

  log("?", `Starting update for ${totalCount} popular/discounted items.`);

  for (const productId of productIds) {
    currentCount++;
    let productInfo = await fetchPopularProductInfo(productId, false);

    if (productInfo) { // This includes the "utgått" object for items not found
      itemsToUpdateInDB.push(productInfo);
    } else {
      // Error was already logged and added to errorHandler by fetchPopularProductInfo
      log("?", `Popular product fetch for ${productId} failed ultimately. Continuing.`);
    }

    if (itemsToUpdateInDB.length >= 10 || (currentCount === totalCount && itemsToUpdateInDB.length > 0)) {
      log("+", `Updating DB with ${itemsToUpdateInDB.length} popular product info items.`);
      try {
        await updateProductsInDB(itemsToUpdateInDB);
      } catch (dbError) {
        log("!", `DB error during batch update for popular items. These ${itemsToUpdateInDB.length} items were not saved.`);
      }
      itemsToUpdateInDB = [];
    }

    if (currentCount % 20 === 0 || currentCount === totalCount) { // Log progress periodically
        log("?", `Progress (Popular): ${Math.floor((currentCount / totalCount) * 100)} % (${currentCount}/${totalCount})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1100)); // API delay
  }
  log("?", "Popular items workflow finished.");
}

const session = axios.create();

async function main() {
  log("?", "Script starting: vmp-popular");

  try {
    await itemCollection.updateMany(
      { stores: { $exists: true } }, // Only reset if stores array exists
      { $set: { stores: [] } },
    );
    log("?", "Cleared existing 'stores' array for relevant products.");
  } catch (dbError) {
    log("!", `DB ERROR clearing stores: ${dbError.message}`);
    // Potentially critical, but attempt to continue
  }

  const date = new Date();
  const discountLimit = (date.getFullYear() === 2025 && date.getMonth() === 4) ? -2.0 : -0.0001; // month is 0-indexed, May is 4. Ensure it's less than 0.

  const productIdsToFetch = await itemCollection
    .find({ discount: { $lt: discountLimit } })
    .project({ index: 1, _id: 0 })
    .map(item => item.index)
    .toArray();

  await updatePopularItemsWorkflow(productIdsToFetch.filter(id => id != null)); // Filter out any null IDs

  // --- Error Handling and Retry Logic ---
  let persistentErrorCountAfterRetries = 0;
  const initialErrors = errorHandler.getErrorList();

  if (initialErrors.length > 0) {
    log("!", `Initial popular items fetch completed with ${initialErrors.length} errors.`);
    if (initialErrors.length > errorHandler.getErrorThreshold()) {
      log("!", `Error count (${initialErrors.length}) exceeds threshold. Aborting retries.`);
      persistentErrorCountAfterRetries = initialErrors.length;
    } else {
      log("?", `Attempting to retry ${initialErrors.length} failed popular items.`);
      errorHandler.clearErrorList();
      let successfullyRetriedItems = [];

      for (const errorEntry of initialErrors) {
        if (errorEntry.item.type === 'popularProduct') {
          log("?", `Retrying popular product ID: ${errorEntry.item.productId}.`);
          const productInfo = await fetchPopularProductInfo(errorEntry.item.productId, true);
          if (productInfo) { // Includes "utgått" objects
            log("+", `Successfully retried popular product ID: ${errorEntry.item.productId}.`);
            successfullyRetriedItems.push(productInfo);
          }
        }
      }

      if (successfullyRetriedItems.length > 0) {
        log("+", `Updating DB with ${successfullyRetriedItems.length} successfully retried popular items.`);
        try { await updateProductsInDB(successfullyRetriedItems); }
        catch (dbError) { log("!", `DB Error saving retried popular items: ${dbError.message}`); }
      }
      persistentErrorCountAfterRetries = errorHandler.getErrorCount();
    }
  }

  try {
    await metaCollection.updateOne(
      { id: "stock" }, // Assuming 'stock' is the correct ID for this metadata doc
      { $set: { "status.vinmonopolet_popular_last_updated": new Date() } }, // More specific field name
      { upsert: true },
    );
    log("?", "Updated popular items last update timestamp in metadata.");
  } catch (metaError) {
    log("!", `Failed to update metadata for popular items: ${metaError.message}`);
  }

  // Final Exit Code
  if (initialErrors.length > errorHandler.getErrorThreshold()) {
    log("!", `EXITING: Initial error count (${initialErrors.length}) for popular items exceeded threshold.`);
    process.exit(1);
  } else if (persistentErrorCountAfterRetries > 0) {
    log("!", `EXITING: Script vmp-popular finished with ${persistentErrorCountAfterRetries} unresolved errors after retries.`);
    errorHandler.getErrorList().forEach(err => {
         log("!", `  Unresolved: ${JSON.stringify(err.item)}, Msg: ${err.errorMessage}`);
    });
    process.exit(1);
  } else {
    log("?", "Script vmp-popular completed successfully.");
    process.exit(0);
  }
}

(async () => {
  try {
    await main();
  } catch (error) {
    log("!", `Unhandled error in vmp-popular main execution: ${error.message} ${error.stack}`);
    process.exit(1);
  } finally {
    try {
      await client.close();
      log("?", "Database connection closed (vmp-popular).");
    } catch (closeError) {
      log("!", `Failed to close database connection (vmp-popular): ${closeError.message}`);
    }
  }
})();
