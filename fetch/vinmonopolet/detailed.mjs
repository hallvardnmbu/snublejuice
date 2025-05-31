// fetch/vinmonopolet/detailed.mjs
import axios from "axios";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import * as errorHandler from '../lib/errorHandler.mjs';

dotenv.config();

const SCRIPT_NAME = 'vmp-detailed';

const log = (level, message) => {
  const msgStr = (message !== null && message !== undefined) ? message.toString() : "";
  console.log(`${level} [${SCRIPT_NAME}] ${msgStr}`);
};

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
);

try {
  await client.connect();
  log("?", "Connected to database.");
} catch (error) {
  log("!", `Failed to connect to database: ${error.message}`);
  process.exit(1); // Early exit if DB connection fails
}

const database = client.db("snublejuice");
const itemCollection = database.collection("products");

const NEW_PRODUCTS_URL_TEMPLATE =
  "https://www.vinmonopolet.no/vmpws/v2/vmp/search?fields=FULL&searchType=product&currentPage={}&q=%3Arelevance%3AnewProducts%3Atrue";
const PRODUCT_DETAIL_URL_TEMPLATE =
  "https://www.vinmonopolet.no/vmpws/v3/vmp/products/{}?fields=FULL";
const LINK_BASE = "https://www.vinmonopolet.no{}";
const DEFAULT_IMAGE = {
  thumbnail: "https://bilder.vinmonopolet.no/bottle.png",
  product: "https://bilder.vinmonopolet.no/bottle.png",
};

// --- Helper: Process Images ---
function processFetchedImages(images) {
  return images
    ? images.reduce((acc, img) => ({ ...acc, [img.format]: img.url }), {})
    : DEFAULT_IMAGE;
}

// --- Part 1: New Products ---

function processNewProductData(product, existingItemIds) {
  const index = parseInt(product.code, 10) || null;
  // if (existingItemIds.includes(index)) { // This check might be redundant if API truly gives only new
  //   return null;
  // }
  return {
    index: index,
    updated: true, // Marked as updated by this script part
    name: product.name || null,
    price: product.price?.value || 0.0,
    volume: product.volume?.value || 0.0,
    literprice:
      product.price?.value && product.volume?.value && product.volume.value > 0
        ? product.price.value / (product.volume.value / 100.0)
        : 0.0,
    url: product.url ? LINK_BASE.replace("{}", product.url) : null,
    images: product.images ? processFetchedImages(product.images) : DEFAULT_IMAGE,
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
    orderable: product.productAvailability?.deliveryAvailability?.availableForPurchase || false,
    orderinfo: product.productAvailability?.deliveryAvailability?.infos?.[0]?.readableValue || null,
    instores: product.productAvailability?.storesAvailability?.availableForPurchase || false,
    storeinfo: product.productAvailability?.storesAvailability?.infos?.[0]?.readableValue || null,
    // Detailed fields like description, alcohol, etc., will be fetched by the next part
  };
}

async function fetchNewProductsPage(page, existingItemIds, isPartOfMainRetryLoop = false) {
  const requestUrl = NEW_PRODUCTS_URL_TEMPLATE.replace("{}", page);
  let firstAttemptErrorMessage = "";

  try {
    const response = await session.get(requestUrl, { timeout: 10000 });
    if (response.status === 200) {
      if (response.data && response.data["productSearchResult"] && response.data["productSearchResult"]["products"]) {
        const productsData = response.data["productSearchResult"]["products"];
        return productsData.map(p => processNewProductData(p, existingItemIds)).filter(p => p !== null);
      } else {
        firstAttemptErrorMessage = `No product data in new-product response for page ${page}. URL: ${requestUrl}`;
        log("!", firstAttemptErrorMessage);
      }
    } else {
      firstAttemptErrorMessage = `Status code ${response.status} for new-product page ${page}. URL: ${requestUrl}`;
      log("!", firstAttemptErrorMessage);
    }
  } catch (err) {
    firstAttemptErrorMessage = `Exception during new-product fetch for page ${page}. URL: ${requestUrl}. Error: ${err.message}`;
    log("!", firstAttemptErrorMessage);
  }

  if (isPartOfMainRetryLoop) {
    errorHandler.addItemToErrorList({ type: 'newProductPage', pageNumber: page, url: requestUrl }, SCRIPT_NAME, `Failed on main retry loop: ${firstAttemptErrorMessage}`);
    return null;
  } else {
    log("?", `New-product page ${page}. Attempting one internal retry. Initial error: ${firstAttemptErrorMessage}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const response = await session.get(requestUrl, { timeout: 10000 });
      if (response.status === 200) {
        if (response.data && response.data["productSearchResult"] && response.data["productSearchResult"]["products"]) {
          log("?", `Successfully fetched new-product page ${page} on internal retry.`);
          const productsData = response.data["productSearchResult"]["products"];
          return productsData.map(p => processNewProductData(p, existingItemIds)).filter(p => p !== null);
        } else {
          const retryFailMessage = `No product data in new-product response for page ${page} on internal retry. URL: ${requestUrl}`;
          log("!", retryFailMessage);
          errorHandler.addItemToErrorList({ type: 'newProductPage', pageNumber: page, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
          return null;
        }
      }
      const retryFailMessage = `Internal retry for new-product page ${page} failed: Status ${response.status}. URL: ${requestUrl}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'newProductPage', pageNumber: page, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
      return null;
    } catch (retryErr) {
      const retryFailMessage = `Internal retry for new-product page ${page} failed with exception. URL: ${requestUrl}. Error: ${retryErr.message}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'newProductPage', pageNumber: page, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
      return null;
    }
  }
}

async function updateNewProductsInDB(data) {
  if (!data || data.length === 0) return { insertedCount: 0 };
  try {
    log("?", `Inserting ${data.length} new products into the database...`);
    // Using updateOne with upsert to avoid duplicates if a product somehow appears new but exists
    const operations = data.map(product => ({
        updateOne: {
            filter: { index: product.index },
            update: { $setOnInsert: product }, // Only insert if new, don't overwrite existing details
            upsert: true,
        }
    }));
    const result = await itemCollection.bulkWrite(operations);
    log("?", `Successfully upserted ${result.upsertedCount} new products (inserted: ${result.insertedCount}, matched: ${result.matchedCount}, modified: ${result.modifiedCount}).`);
    return { insertedCount: result.upsertedCount }; // count upserts as "inserted" for this context
  } catch (error) {
    log("!", `Failed to insert/upsert new products into the database: ${error.message}`);
    // This is a DB error, not a fetch error. Could be added to a separate error list if needed.
    throw error; // Propagate for now
  }
}

async function discoverNewProductsWorkflow(existingItemIds) {
  log("?", "Starting new product discovery workflow...");
  let allNewProducts = [];
  for (let page = 0; page < 20; page++) { // Limit pages to avoid infinite loops on new products
    let products = await fetchNewProductsPage(page, existingItemIds, false);
    if (!products) {
      log("?", `New-product page ${page} fetch failed ultimately. Continuing.`);
    } else if (products.length === 0) {
      log("?", `No new products found on page ${page}. Assuming end of new products.`);
      break;
    }
    if (products) {
      allNewProducts = allNewProducts.concat(products);
    }
    if (page % 5 === 0 && page !== 0) { // Update DB periodically
        if (allNewProducts.length > 0) {
            log("+" , `Updating DB with ${allNewProducts.length} discovered new products (batch)...`);
            await updateNewProductsInDB(allNewProducts);
            allNewProducts = [];
        }
    }
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  if (allNewProducts.length > 0) {
    log("+" , `Updating DB with ${allNewProducts.length} final discovered new products...`);
    await updateNewProductsInDB(allNewProducts);
  }
  log("?", "New product discovery workflow finished.");
}

// --- Part 2: Detailed Information ---

function processDetailedProductData(product) {
  const processed = {
    index: parseInt(product.code, 10) || null,
    updated: true, // Mark as updated by this part of the script
    volume: product.volume?.value || 0.0,
    price: product.price?.value || 0.0, // Price might be updated here too
    colour: product.color || null,
    characteristics: product.content?.characteristics?.map(c => c.readableValue) || [],
    ingredients: product.content?.ingredients?.map(i => i.readableValue) || [],
    ...(product.content?.traits?.reduce((acc, trait) => ({ ...acc, [trait.name.toLowerCase().replace(/\s+/g, '_')]: trait.readableValue }), {})),
    smell: product.smell || null,
    taste: product.taste || null,
    allergens: product.allergens || null,
    pair: product.content?.isGoodFor?.map(e => e.name) || [],
    storage: product.content?.storagePotential?.formattedValue || null,
    cork: product.cork || null,
    alcohol: null, // Will be parsed
    sugar: product.traits?.find(t => t.name === "Sukker")?.readableValue || null,
    acid: product.traits?.find(t => t.name === "Syre")?.readableValue || null,
    description: {
      lang: product.content?.style?.description || null,
      short: product.content?.style?.name || null,
    },
    method: product.method || null,
    year: product.year || null,
  };

  const alcoholTrait = product.traits?.find(t => t.name === "Alkohol")?.readableValue;
  if (alcoholTrait) {
    processed.alcohol = parseFloat(alcoholTrait.split(" ")[0].replace(",", "."));
  }

  if (processed.volume > 0 && processed.price > 0) {
    processed.literprice = (processed.price / processed.volume) * 100;
    if (processed.alcohol > 0) {
      processed.alcoholprice = processed.literprice / processed.alcohol;
    } else {
      processed.alcoholprice = null;
    }
  } else {
    processed.literprice = null;
    processed.alcoholprice = null;
  }
  return processed;
}

async function fetchProductDetails(productId, isPartOfMainRetryLoop = false) {
  const requestUrl = PRODUCT_DETAIL_URL_TEMPLATE.replace("{}", productId);
  let firstAttemptErrorMessage = "";

  try {
    const response = await session.get(requestUrl, { timeout: 10000 });
    if (response.status === 200 && response.data) {
      return processDetailedProductData(response.data);
    }
    firstAttemptErrorMessage = `Status ${response.status} for product detail ${productId}. URL: ${requestUrl}`;
    log("!", firstAttemptErrorMessage);
  } catch (err) {
    firstAttemptErrorMessage = `Exception for product detail ${productId}. URL: ${requestUrl}. Error: ${err.message}`;
    log("!", firstAttemptErrorMessage);
  }

  if (isPartOfMainRetryLoop) {
    errorHandler.addItemToErrorList({ type: 'productDetail', productId: productId, url: requestUrl }, SCRIPT_NAME, `Failed on main retry: ${firstAttemptErrorMessage}`);
    return null;
  } else {
    log("?", `Product detail ${productId}. Internal retry. Initial error: ${firstAttemptErrorMessage}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const response = await session.get(requestUrl, { timeout: 10000 });
      if (response.status === 200 && response.data) {
        log("?", `Successfully fetched product detail ${productId} on internal retry.`);
        return processDetailedProductData(response.data);
      }
      const retryFailMessage = `Internal retry for product detail ${productId} failed: Status ${response.status}. URL: ${requestUrl}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'productDetail', productId: productId, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
      return null;
    } catch (retryErr) {
      const retryFailMessage = `Internal retry for product detail ${productId} failed with exception. URL: ${requestUrl}. Error: ${retryErr.message}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'productDetail', productId: productId, url: requestUrl }, SCRIPT_NAME, retryFailMessage);
      return null;
    }
  }
}

async function updateDetailedProductsInDB(data) {
  if (!data || data.length === 0) return { modifiedCount: 0, upsertedCount: 0 };
  const operations = data.map(record => ({
    updateOne: {
      filter: { index: record.index },
      update: { $set: record },
      upsert: true, // Should mostly be updates, but upsert for safety
    },
  }));
  try {
    const result = await itemCollection.bulkWrite(operations);
    log("+", `DB Detail Update: Matched ${result.matchedCount}, Modified ${result.modifiedCount}, Upserted ${result.upsertedCount}.`);
    return result;
  } catch (dbError) {
     log("!", `DATABASE ERROR during detailed product update: ${dbError.message}`);
     throw dbError;
  }
}

async function updateDetailedInformationWorkflow(itemIdsToUpdate) {
  log("?", `Starting update for detailed information of ${itemIdsToUpdate.length} products.`);
  let fetchedDetailsBatch = [];
  let count = 0;
  const total = itemIdsToUpdate.length;

  for (const productId of itemIdsToUpdate) {
    count++;
    if (!productId) continue; // Skip if productId is somehow null/undefined

    let productDetail = await fetchProductDetails(productId, false);
    if (productDetail) {
      fetchedDetailsBatch.push(productDetail);
    } else {
      log("?", `Product detail fetch for ${productId} failed ultimately. Continuing.`);
    }

    if (fetchedDetailsBatch.length >= 10 || (count === total && fetchedDetailsBatch.length > 0)) {
      log("+", `Updating DB with ${fetchedDetailsBatch.length} product details.`);
      try {
        await updateDetailedProductsInDB(fetchedDetailsBatch);
      } catch (dbError) {
        log("!", `DB Error during batch update of details for ${fetchedDetailsBatch.length} items. These items' details were not saved.`);
        // These specific items could be added to a "failed_db_update" list if critical
      }
      fetchedDetailsBatch = [];
      log("?", `Progress (Details): ${Math.floor((count / total) * 100)} % (${count}/${total})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1100)); // API delay
  }
  log("?", "Detailed information workflow finished.");
}

const session = axios.create();

async function main() {
  log("?", "Script starting: vmp-detailed");

  // Mark all products as not updated by this specific script run initially
  // This helps differentiate from price.mjs updates.
  // Or, use a different field e.g., { details_updated_timestamp: new Date() }
  // For now, let's assume 'updated' field is general for any script run.
  // The price.mjs already sets {updated: false} for all items at its start.
  // This script will set {updated: true} only for items it successfully processes.

  const allProductIndexes = await itemCollection.distinct("index");
  await discoverNewProductsWorkflow(allProductIndexes);

  let productIdsForDetails = await itemCollection
    .find({ index: { $exists: true }, description: null }) // Example: fetch details if description is missing
    .project({ index: 1, _id: 0 })
    .map(item => item.index)
    .toArray();
  productIdsForDetails = productIdsForDetails.filter(id => id != null && !isNaN(id)); // Ensure valid IDs

  await updateDetailedInformationWorkflow(productIdsForDetails);

  // --- Error Handling and Retry Logic ---
  let persistentErrorCountAfterRetries = 0;
  const initialErrors = errorHandler.getErrorList();

  if (initialErrors.length > 0) {
    log("!", `Initial fetch phases completed with ${initialErrors.length} errors.`);
    if (initialErrors.length > errorHandler.getErrorThreshold()) {
      log("!", `Error count (${initialErrors.length}) exceeds threshold of ${errorHandler.getErrorThreshold()}. Aborting retries.`);
      persistentErrorCountAfterRetries = initialErrors.length;
    } else {
      log("?", `Attempting to retry ${initialErrors.length} failed items.`);
      errorHandler.clearErrorList();
      let retriedNewProductPages = [];
      let retriedDetailedProducts = [];

      for (const errorEntry of initialErrors) {
        if (errorEntry.item.type === 'newProductPage') {
          log("?", `Retrying new-product page: ${errorEntry.item.pageNumber}.`);
          const products = await fetchNewProductsPage(errorEntry.item.pageNumber, allProductIndexes, true);
          if (products && products.length > 0) {
            log("+", `Successfully retried new-product page ${errorEntry.item.pageNumber}, got ${products.length} products.`);
            retriedNewProductPages = retriedNewProductPages.concat(products);
          }
        } else if (errorEntry.item.type === 'productDetail') {
          log("?", `Retrying product detail for ID: ${errorEntry.item.productId}.`);
          const detail = await fetchProductDetails(errorEntry.item.productId, true);
          if (detail) {
            log("+", `Successfully retried product detail for ID: ${errorEntry.item.productId}.`);
            retriedDetailedProducts.push(detail);
          }
        }
      }

      if (retriedNewProductPages.length > 0) {
        log("+", `Updating DB with ${retriedNewProductPages.length} successfully retried new products.`);
        try { await updateNewProductsInDB(retriedNewProductPages); }
        catch (dbError) { log("!", `DB Error saving retried new products: ${dbError.message}`); }
      }
      if (retriedDetailedProducts.length > 0) {
        log("+", `Updating DB with ${retriedDetailedProducts.length} successfully retried product details.`);
        try { await updateDetailedProductsInDB(retriedDetailedProducts); }
        catch (dbError) { log("!", `DB Error saving retried product details: ${dbError.message}`); }
      }
      persistentErrorCountAfterRetries = errorHandler.getErrorCount();
    }
  }

  // Final Exit Code Determination
  if (initialErrors.length > errorHandler.getErrorThreshold()) {
    log("!", `EXITING: Initial error count (${initialErrors.length}) exceeded threshold.`);
    process.exit(1);
  } else if (persistentErrorCountAfterRetries > 0) {
    log("!", `EXITING: Script finished with ${persistentErrorCountAfterRetries} unresolved errors after retries.`);
    errorHandler.getErrorList().forEach(err => {
         log("!", `  Unresolved: ${JSON.stringify(err.item)}, Msg: ${err.errorMessage}`);
    });
    process.exit(1);
  } else {
    log("?", "Script vmp-detailed completed successfully.");
    process.exit(0);
  }
}

// Main execution block
(async () => {
  try {
    await main();
  } catch (error) {
    log("!", `Unhandled error in main execution: ${error.message} ${error.stack}`);
    process.exit(1); // Ensure exit on unhandled main error
  } finally {
    try {
      await client.close();
      log("?", "Database connection closed.");
    } catch (closeError) {
      log("!", `Failed to close database connection: ${closeError.message}`);
    }
  }
})();
