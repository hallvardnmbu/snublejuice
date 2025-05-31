// fetch/taxfree/price.mjs
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import * as errorHandler from '../lib/errorHandler.mjs';

dotenv.config();

const SCRIPT_NAME = 'tax-price';

const log = (level, message) => {
  const msgStr = (message !== null && message !== undefined) ? message.toString() : "";
  console.log(`${level} [${SCRIPT_NAME}] ${msgStr}`);
};

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false, // Original was false
      deprecationErrors: true,
    },
  },
);

// Constants for TaxFree API
const TAXFREE_API_CONFIG = {
  url: process.env.TAXFREE_URL,
  headers: JSON.parse(process.env.TAXFREE_HEADERS || '{}'), // Ensure headers is an object
  requests: [
    JSON.parse(process.env.TAXFREE_REQUESTS_1 || '{}'),
    JSON.parse(process.env.TAXFREE_REQUESTS_2 || '{}')
  ].filter(req => Object.keys(req).length > 0), // Filter out empty request objects
};

const STORES_MAP = {
  5135: "Stavanger, Avgang & Ankomst", 5136: "Stavanger, Bagasjehall (?)",
  5145: "Bergen, Avgang", 5148: "Bergen, Ankomst",
  5155: "Trondheim, Avgang & Ankomst", 5111: "Oslo, Ankomst",
  5114: "Oslo, Avgang", 5115: "Oslo, Videreforbindelse",
  5110: null, 5104: null, 5149: null,
};
const VALID_CATEGORIES = ["Brennevin", "Musserende vin", "Øl", "Sider"];
const WINE_SUBCATEGORIES_MAP = {
  Hvitvin: "Hvitvin", Rødvin: "Rødvin",
  "Perlende vin": "Perlende vin", Rosévin: "Rosévin", Hetvin: "Sterkvin",
};
const TAXFREE_LINKS = { image: "https://cdn.tax-free.no", product: "https://www.tax-free.no" };
const DEFAULT_IMAGE = { thumbnail: "https://bilder.vinmonopolet.no/bottle.png", product: "https://bilder.vinmonopolet.no/bottle.png" };

function processFetchedImages(images) {
  if (!images) return DEFAULT_IMAGE;
  return Object.fromEntries(
    Object.entries(images).map(([format, urlEnd]) => [format, `${TAXFREE_LINKS.image}${urlEnd}`])
  );
}

function processProductCategories(category, subcategory) {
  if (!category) return { category: category, subcategory: subcategory };
  if (VALID_CATEGORIES.includes(category)) return { category: category, subcategory: subcategory };
  return { category: "Vin", subcategory: WINE_SUBCATEGORIES_MAP[subcategory] || subcategory };
}

function processTaxFreeProduct(product, alreadyProcessedIndexes) {
  const index = parseInt(product.code, 10) || null;
  if (alreadyProcessedIndexes.includes(index)) {
    return null; // Skip if already processed (e.g. from a previous order in the same run)
  }

  return {
    volume: product.salesAmount * 100, // Assuming salesAmount is in liters
    taxfree: {
      index: index,
      updated: true,
      name: product.name?.no || null,
      url: product.url ? `${TAXFREE_LINKS.product}${product.url}` : null,
      images: product.picture ? processFetchedImages(product.picture) : DEFAULT_IMAGE,
      description: product.description?.no || null,
      price: product.price?.NOK,
      literprice: product.fullUnitPrice?.NOK || (product.price?.NOK && product.salesAmount > 0 ? product.price.NOK / product.salesAmount : null),
      alcohol: product.alcoholByVolume || null,
      alcoholprice: (product.fullUnitPrice?.NOK && product.alcoholByVolume > 0 ? product.fullUnitPrice.NOK / product.alcoholByVolume :
                    (product.price?.NOK && product.salesAmount > 0 && product.alcoholByVolume > 0 ? (product.price.NOK / product.salesAmount) / product.alcoholByVolume : null)),
      ...processProductCategories(
        product.categoriesLevel1?.no?.at(0)?.split(" > ").at(-1) || null,
        product.categoriesLevel2?.no?.at(0)?.split(" > ").at(-1) || null
      ),
      subsubcategory: product.categoriesLevel3?.no?.at(0)?.split(" > ").at(-1) || null,
      country: product.country?.no || null,
      district: product.region?.no || product.wineGrowingAhreaDetail?.no || null,
      subdistrict: product.wineGrowingAhreaDetail?.no || null,
      taste: { taste: product.taste?.no || null, fill: product.tasteFill?.no, intensity: product.tasteIntensity?.no },
      ingredients: product.wineGrapes?.no || null,
      characteristics: [product.sweetness?.no].filter(c => c),
      allergens: product.allergens?.no || null,
      pair: product.suitableFor?.no || null,
      year: product.year ? parseInt(product.year.no, 10) : null,
      sugar: product.suggarContent || null,
      acid: product.tasteTheAcid?.no || null,
      colour: product.colour?.no || null,
      instores: product.onlineExclusive || false, // This seems reversed, usually true means online only
      stores: product.inPhysicalStockInCodes?.map(code => STORES_MAP[code]).filter(store => store !== null) || [],
    },
  };
}

async function fetchTaxFreePageData(order, alreadyProcessedIndexes, isPartOfMainRetryLoop = false) {
  const requestBody = JSON.stringify({
    requests: TAXFREE_API_CONFIG.requests.map((req) => ({
      ...req,
      indexName: req.indexName.replace("{}", order), // Insert sort order into indexName
    })),
  });
  let firstAttemptErrorMessage = "";

  try {
    const response = await fetch(TAXFREE_API_CONFIG.url, {
      method: "POST",
      headers: TAXFREE_API_CONFIG.headers,
      body: requestBody,
    });

    if (response.ok) { // status 200-299
      const data = await response.json();
      const hits = data.results?.reduce((acc, curr) => acc.concat(curr.hits), []) || [];
      return hits.map(p => processTaxFreeProduct(p, alreadyProcessedIndexes)).filter(p => p !== null);
    }
    firstAttemptErrorMessage = `Status ${response.status} for tax-free order ${order}.`;
    log("!", firstAttemptErrorMessage);
  } catch (err) {
    firstAttemptErrorMessage = `Exception for tax-free order ${order}. Error: ${err.message}`;
    log("!", firstAttemptErrorMessage);
  }

  if (isPartOfMainRetryLoop) {
    errorHandler.addItemToErrorList({ type: 'taxFreePage', order: order, requestBody: requestBody }, SCRIPT_NAME, `Failed on main retry: ${firstAttemptErrorMessage}`);
    return []; // Return empty array on error, as per original script's behavior on retry fail
  } else {
    log("?", `Tax-free order ${order}. Internal retry. Initial error: ${firstAttemptErrorMessage}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const response = await fetch(TAXFREE_API_CONFIG.url, { method: "POST", headers: TAXFREE_API_CONFIG.headers, body: requestBody });
      if (response.ok) {
        const data = await response.json();
        const hits = data.results?.reduce((acc, curr) => acc.concat(curr.hits), []) || [];
        log("?", `Successfully fetched tax-free order ${order} on internal retry.`);
        return hits.map(p => processTaxFreeProduct(p, alreadyProcessedIndexes)).filter(p => p !== null);
      }
      const retryFailMessage = `Internal retry for tax-free order ${order} failed: Status ${response.status}.`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'taxFreePage', order: order, requestBody: requestBody }, SCRIPT_NAME, retryFailMessage);
      return [];
    } catch (retryErr) {
      const retryFailMessage = `Internal retry for tax-free order ${order} failed with exception. Error: ${retryErr.message}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'taxFreePage', order: order, requestBody: requestBody }, SCRIPT_NAME, retryFailMessage);
      return [];
    }
  }
}

async function findMatchingVinmonopoletProduct(taxFreeRecord) {
  const name = taxFreeRecord.taxfree.name.replace(/\d+(?:[,\.]\d+)?\s*[a-zA-Z]l/gi, "").replace(/\s+/g, " ").trim();
  const nWords = name.split(" ").filter(Boolean).length;
  let aggregation = [];

  // Simplified aggregation based on original logic for brevity
  if (nWords <= 3) {
    aggregation.push({
      $search: { index: "name", compound: { must: [ { text: { query: name.split(" ").pop(), path: "name", score: { boost: { value: 2 } } } }, { text: { query: name, path: "name", fuzzy: { maxEdits: Math.max(nWords - 1, 1) } } } ] } }
    });
  } else {
    aggregation.push({
      $search: { index: "name", compound: { should: [ { phrase: { query: name, path: "name", score: { boost: { value: 2 } } } }, { text: { query: name, path: "name", fuzzy: { maxEdits: Math.min(nWords, 2) } } } ] } }
    });
  }
  aggregation.push(
    { $addFields: { score: { $meta: "searchScore" } } },
    { $match: { score: { $gt: 20.0 }, volume: taxFreeRecord.volume } },
    // { $match: { volume: taxFreeRecord.volume, ...(taxFreeRecord.taxfree.category && { category: taxFreeRecord.taxfree.category }) } }, // Original had category match
    { $sort: { score: -1 } },
    { $limit: 1 }
  );
  const match = await itemCollection.aggregate(aggregation).toArray();
  return match[0] || null;
}

async function updateProductsInDB(productDataList, existingVmpIndexesForMatching) {
  if (!productDataList || productDataList.length === 0) return { matched: 0, unmatchedButUpserted: 0, modifiedCount: 0, upsertedCount: 0 };

  const operations = [];
  let counts = { matched: 0, unmatchedButUpserted: 0 };

  for (const record of productDataList) {
    const vinmonopoletMatch = existingVmpIndexesForMatching.includes(record.taxfree.index) ? false : await findMatchingVinmonopoletProduct(record);

    if (vinmonopoletMatch) {
      counts.matched++;
      operations.push({
        updateOne: {
          filter: { index: vinmonopoletMatch.index },
          update: [
            { $set: { "taxfree.oldprice": "$taxfree.price" } },
            { $set: { taxfree: record.taxfree } },
            { $set: { "taxfree.score": vinmonopoletMatch.score } },
            { $set: { "taxfree.prices": { $ifNull: ["$taxfree.prices", []] } } },
            { $set: { "taxfree.prices": { $concatArrays: ["$taxfree.prices", [record.taxfree.price]] } } },
            { $set: { "taxfree.discount": { $cond: { if: { $and: [{$ne: ["$price", null]}, {$ne: [record.taxfree.price, null]}, { $gt: ["$price", 0] }, { $gt: [record.taxfree.price, 0] } ] }, then: { $multiply: [ { $divide: [ { $subtract: [record.taxfree.price, "$price"] }, "$price" ] }, 100 ] }, else: 0 } } } },
          ],
        },
      });
    } else {
      counts.unmatchedButUpserted++;
      operations.push({
        updateOne: {
          filter: { "taxfree.index": record.taxfree.index }, // Match on taxfree index if no vmp match
          update: [
            { $set: { "taxfree.oldprice": "$taxfree.price", "taxfree.discount": 0 } },
            { $set: { taxfree: record.taxfree } }, // Set the whole taxfree object
            { $set: { "taxfree.prices": { $ifNull: ["$taxfree.prices", []] } } },
            { $set: { "taxfree.prices": { $concatArrays: ["$taxfree.prices", [record.taxfree.price]] } } },
          ],
          upsert: true, // Create new doc if no taxfree.index matches
        },
      });
    }
  }
  log("?", `DB Update: Matched to VMP: ${counts.matched}, Unmatched (Upserted as TaxFree-only): ${counts.unmatchedButUpserted}`);
  if (operations.length === 0) return { matched: counts.matched, unmatchedButUpserted: counts.unmatchedButUpserted, modifiedCount: 0, upsertedCount: 0 };

  const result = await itemCollection.bulkWrite(operations);
  return { ...counts, modifiedCount: result.modifiedCount, upsertedCount: result.upsertedCount };
}

async function fetchTaxFreeProductsWorkflow(existingVmpIndexesForMatching) {
  let allFetchedProducts = [];
  let processedTaxFreeIndexesThisRun = []; // To avoid processing same taxfree item from asc/desc orders

  for (const order of ["asc", "desc"]) {
    log("?", `Fetching tax-free products with order: ${order}`);
    let productsFromPage = await fetchTaxFreePageData(order, processedTaxFreeIndexesThisRun, false);

    if (productsFromPage.length === 0 && !errorHandler.getErrorList().find(e => e.item.order === order)) {
      log("?", `No more products for order ${order}, or fetch failed and was logged. Moving to next order or finishing.`);
      // If it's an error, it's logged. If genuinely no products, this break is fine.
      // The original script broke here. We'll rely on error handler for actual errors.
      // If productsFromPage is empty due to error, error is in list. If empty because no data, this is fine.
      if (errorHandler.getErrorList().find(e => e.item.order === order && e.scriptName === SCRIPT_NAME)) {
        // There was an error for this order, skip trying to update DB with empty list
        log("!", `Skipping DB update for order ${order} due to prior fetch error.`);
        continue;
      } else if (productsFromPage.length === 0) {
        log("?", `No products returned for order ${order}. Assuming end of data for this sort order.`);
        // This is not an error, just end of data for this sort.
      }
    }

    if (productsFromPage.length > 0) {
        allFetchedProducts = allFetchedProducts.concat(productsFromPage);
        productsFromPage.forEach(p => processedTaxFreeIndexesThisRun.push(p.taxfree.index));
    }

    // Update DB per order to somewhat mimic original behavior of batching
    if (allFetchedProducts.length > 0) {
        log("+", `Updating DB with ${allFetchedProducts.length} tax-free products from order '${order}'.`);
        try {
            const dbResult = await updateProductsInDB(allFetchedProducts, existingVmpIndexesForMatching);
            log("+", `DB results for order '${order}': Modified: ${dbResult.modifiedCount}, Upserted: ${dbResult.upsertedCount}. Matched VMP: ${dbResult.matched}, Unmatched: ${dbResult.unmatchedButUpserted}`);
        } catch (dbError) {
            log("!", `DB ERROR during update for order ${order}: ${dbError.message}. These items were not saved.`);
        }
        allFetchedProducts = []; // Clear after update
    }
    await new Promise((resolve) => setTimeout(resolve, 900)); // Delay between orders
  }
  log("?", "Tax-free products workflow finished.");
}

async function syncUnupdatedTaxFreeProducts() {
  const unupdatedCount = await itemCollection.countDocuments({ "taxfree.updated": false, "taxfree.name": { $exists: true } });
  log("?", `Sync: Found ${unupdatedCount} tax-free products not marked as 'updated' this run.`);
  if (unupdatedCount === 0) return;

  try {
    const result = await itemCollection.updateMany(
      { "taxfree.updated": false, "taxfree.name": { $exists: true } },
      [
        { $set: { "taxfree.oldprice": "$taxfree.price" } },
        { $set: { "taxfree.price": "$taxfree.oldprice", "taxfree.discount": 0 } }, // Preserve price, reset discount
        { $set: { "taxfree.prices": { $ifNull: ["$taxfree.prices", []] } } },
        { $set: { "taxfree.prices": { $concatArrays: ["$taxfree.prices", ["$taxfree.price"]] } } },
      ]
    );
    log("+", `Sync: Processed ${result.modifiedCount} unupdated tax-free products.`);
  } catch (err) {
    log("!", `Sync: Error during syncUnupdatedTaxFreeProducts: ${err.message}`);
  }
}

async function main() {
  log("?", "Script starting: tax-price");
  try {
    await metaCollection.updateOne({ id: "stock" }, { $set: { "prices.taxfree": false } }, { upsert: true });
    log("?", "Metadata: prices.taxfree set to false.");
  } catch (e) { log("!", `Meta update fail: ${e.message}`);}

  try {
    await itemCollection.updateMany({ "taxfree.index": { $exists: true } }, { $set: { "taxfree.updated": false } });
    log("?", "Marked existing tax-free products as not updated for this run.");
  } catch (e) { log("!", `Taxfree products update fail: ${e.message}`);}

  const existingVmpIndexes = await itemCollection.distinct("index", { index: { $exists: true } }); // For matching

  await fetchTaxFreeProductsWorkflow(existingVmpIndexes);

  // --- Error Handling and Retry Logic ---
  let persistentErrorCountAfterRetries = 0;
  const initialErrors = errorHandler.getErrorList();

  if (initialErrors.length > 0) {
    log("!", `Initial tax-free fetch completed with ${initialErrors.length} errors.`);
    if (initialErrors.length > errorHandler.getErrorThreshold()) {
      log("!", `Error count (${initialErrors.length}) exceeds threshold. Aborting retries.`);
      persistentErrorCountAfterRetries = initialErrors.length;
    } else {
      log("?", `Attempting to retry ${initialErrors.length} failed tax-free pages/items.`);
      errorHandler.clearErrorList();
      let successfullyRetriedProducts = [];

      for (const errorEntry of initialErrors) {
        if (errorEntry.item.type === 'taxFreePage') {
          log("?", `Retrying tax-free page for order: ${errorEntry.item.order}.`);
          // For retries, pass empty alreadyProcessedIndexes as we are retrying specific failed pages,
          // and their original alreadyProcessed context might be complex to reconstruct.
          // The processTaxFreeProduct will handle its own internal alreadyProcessed if needed from a prior step in retry.
          const products = await fetchTaxFreePageData(errorEntry.item.order, [], true);
          if (products.length > 0) {
            log("+", `Successfully retried tax-free page for order ${errorEntry.item.order}, got ${products.length} products.`);
            successfullyRetriedProducts = successfullyRetriedProducts.concat(products);
          }
        }
      }

      if (successfullyRetriedProducts.length > 0) {
        log("+", `Updating DB with ${successfullyRetriedProducts.length} successfully retried tax-free products.`);
        try {
            const dbResult = await updateProductsInDB(successfullyRetriedProducts, existingVmpIndexes);
            log("+", `DB results for retried tax-free: Modified: ${dbResult.modifiedCount}, Upserted: ${dbResult.upsertedCount}. Matched VMP: ${dbResult.matched}, Unmatched: ${dbResult.unmatchedButUpserted}`);
        }
        catch (dbError) { log("!", `DB Error saving retried tax-free products: ${dbError.message}`); }
      }
      persistentErrorCountAfterRetries = errorHandler.getErrorCount();
    }
  }

  log("?", "Proceeding with syncUnupdatedTaxFreeProducts.");
  await syncUnupdatedTaxFreeProducts();

  try {
    await metaCollection.updateOne(
      { id: "stock" },
      { $set: { "prices.taxfree": true, "status.taxfree_last_updated": new Date() } }, // More specific field
      { upsert: true }
    );
    log("?", "Updated tax-free last update timestamp in metadata.");
  } catch (e) { log("!", `Meta update fail: ${e.message}`);}


  // Final Exit Code
  if (initialErrors.length > errorHandler.getErrorThreshold()) {
    log("!", `EXITING: Initial error count (${initialErrors.length}) for tax-free fetch exceeded threshold.`);
    process.exit(1);
  } else if (persistentErrorCountAfterRetries > 0) {
    log("!", `EXITING: Script tax-price finished with ${persistentErrorCountAfterRetries} unresolved errors after retries.`);
    errorHandler.getErrorList().forEach(err => {
         log("!", `  Unresolved: ${JSON.stringify(err.item)}, Msg: ${err.errorMessage}`);
    });
    process.exit(1);
  } else {
    log("?", "Script tax-price completed successfully.");
    process.exit(0);
  }
}

(async () => {
  try {
    await client.connect(); // Ensure client is connected before main logic
    log("?", "MongoDB client connected for tax-price script.");
    await main();
  } catch (error) {
    log("!", `Unhandled error in tax-price main execution: ${error.message} ${error.stack}`);
    process.exit(1);
  } finally {
    try {
      await client.close();
      log("?", "Database connection closed (tax-price).");
    } catch (closeError) {
      log("!", `Failed to close database connection (tax-price): ${closeError.message}`);
    }
  }
})();
