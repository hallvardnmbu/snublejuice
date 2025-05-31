// fetch/taxfree/stock.mjs
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import * as errorHandler from '../lib/errorHandler.mjs';

dotenv.config();

const SCRIPT_NAME = 'tax-stock';

const log = (level, message) => {
  const msgStr = (message !== null && message !== undefined) ? message.toString() : "";
  console.log(`${level} [${SCRIPT_NAME}] ${msgStr}`);
};

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true, // Kept as true from original
      deprecationErrors: true,
    },
  },
);

// Constants for TaxFree API
const TAXFREE_API_CONFIG = {
  url: process.env.TAXFREE_URL,
  headers: JSON.parse(process.env.TAXFREE_HEADERS || '{}'),
  requests: [
    JSON.parse(process.env.TAXFREE_REQUESTS_1 || '{}'),
    JSON.parse(process.env.TAXFREE_REQUESTS_2 || '{}')
  ].filter(req => Object.keys(req).length > 0),
};

const STORES_MAP = {
  5135: "Stavanger, Avgang & Ankomst", 5136: "Stavanger, Bagasjehall (?)",
  5145: "Bergen, Avgang", 5148: "Bergen, Ankomst",
  5155: "Trondheim, Avgang & Ankomst", 5111: "Oslo, Ankomst",
  5114: "Oslo, Avgang", 5115: "Oslo, Videreforbindelse",
  5110: null, 5104: null, 5149: null,
};

function processStockProduct(product, alreadyProcessedIndexes) {
  const index = parseInt(product.code, 10) || null;
  if (!index || alreadyProcessedIndexes.includes(index)) {
    return null; // Skip if no index or already processed
  }
  return {
    index: index,
    stores: product.inPhysicalStockInCodes
      ?.map((code) => STORES_MAP[code])
      .filter((store) => store !== null) || [], // Default to empty array if null/undefined
  };
}

async function fetchTaxFreeStockPageData(order, alreadyProcessedIndexes, isPartOfMainRetryLoop = false) {
  const requestBody = JSON.stringify({
    requests: TAXFREE_API_CONFIG.requests.map((req) => ({
      ...req,
      indexName: req.indexName.replace("{}", order),
    })),
  });
  let firstAttemptErrorMessage = "";

  try {
    const response = await fetch(TAXFREE_API_CONFIG.url, {
      method: "POST",
      headers: TAXFREE_API_CONFIG.headers,
      body: requestBody,
    });

    if (response.ok) {
      const data = await response.json();
      const hits = data.results?.reduce((acc, curr) => acc.concat(curr.hits), []) || [];
      return hits.map(p => processStockProduct(p, alreadyProcessedIndexes)).filter(p => p !== null);
    }
    firstAttemptErrorMessage = `Status ${response.status} for tax-free stock order ${order}.`;
    log("!", firstAttemptErrorMessage);
  } catch (err) {
    firstAttemptErrorMessage = `Exception for tax-free stock order ${order}. Error: ${err.message}`;
    log("!", firstAttemptErrorMessage);
  }

  if (isPartOfMainRetryLoop) {
    errorHandler.addItemToErrorList({ type: 'taxFreeStockPage', order: order, requestBody: requestBody }, SCRIPT_NAME, `Failed on main retry: ${firstAttemptErrorMessage}`);
    return [];
  } else {
    log("?", `Tax-free stock order ${order}. Internal retry. Initial error: ${firstAttemptErrorMessage}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const response = await fetch(TAXFREE_API_CONFIG.url, { method: "POST", headers: TAXFREE_API_CONFIG.headers, body: requestBody });
      if (response.ok) {
        const data = await response.json();
        const hits = data.results?.reduce((acc, curr) => acc.concat(curr.hits), []) || [];
        log("?", `Successfully fetched tax-free stock order ${order} on internal retry.`);
        return hits.map(p => processStockProduct(p, alreadyProcessedIndexes)).filter(p => p !== null);
      }
      const retryFailMessage = `Internal retry for tax-free stock order ${order} failed: Status ${response.status}.`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'taxFreeStockPage', order: order, requestBody: requestBody }, SCRIPT_NAME, retryFailMessage);
      return [];
    } catch (retryErr) {
      const retryFailMessage = `Internal retry for tax-free stock order ${order} failed with exception. Error: ${retryErr.message}`;
      log("!", retryFailMessage);
      errorHandler.addItemToErrorList({ type: 'taxFreeStockPage', order: order, requestBody: requestBody }, SCRIPT_NAME, retryFailMessage);
      return [];
    }
  }
}

async function updateStockInDB(productStockData) {
  if (!productStockData || productStockData.length === 0) return { modifiedCount: 0, upsertedCount: 0 }; // Use upsertedCount for consistency if some are new

  const operations = productStockData.map((record) => ({
    updateOne: {
      filter: { "taxfree.index": record.index }, // Match item by its taxfree.index
      update: { $set: { "taxfree.stores": record.stores } },
      // Do not upsert here; stock info is for existing tax-free items.
      // If a taxfree.index doesn't exist, it means price.mjs hasn't run or missed it.
    },
  }));

  try {
    const result = await itemCollection.bulkWrite(operations);
    log("+", `DB Stock Update: Matched ${result.matchedCount}, Modified ${result.modifiedCount}.`);
    return { modifiedCount: result.modifiedCount, upsertedCount: result.upsertedCount }; // Keep structure, though upserted may be 0
  } catch (dbError) {
    log("!", `DATABASE ERROR during stock update: ${dbError.message}`);
    throw dbError;
  }
}

async function fetchTaxFreeStockWorkflow() {
  let allFetchedStockData = [];
  let processedIndexesThisRun = []; // Keep track of taxfree indexes processed in this run

  for (const order of ["asc", "desc"]) {
    log("?", `Fetching tax-free stock with order: ${order}`);
    let stockDataFromPage = await fetchTaxFreeStockPageData(order, processedIndexesThisRun, false);

    if (stockDataFromPage.length === 0 && !errorHandler.getErrorList().find(e => e.item.order === order && e.scriptName === SCRIPT_NAME)) {
        log("?", `No stock data returned for order ${order}. Assuming end of data for this sort order.`);
    } else if (stockDataFromPage.length === 0 && errorHandler.getErrorList().find(e => e.item.order === order && e.scriptName === SCRIPT_NAME)) {
        log("!", `Skipping DB update for stock order ${order} due to prior fetch error.`);
        continue;
    }

    if (stockDataFromPage.length > 0) {
        allFetchedStockData = allFetchedStockData.concat(stockDataFromPage);
        stockDataFromPage.forEach(p => processedIndexesThisRun.push(p.index));
    }

    // Update DB per order
    if (allFetchedStockData.length > 0) {
        log("+", `Updating DB with ${allFetchedStockData.length} tax-free stock entries from order '${order}'.`);
        try {
            const dbResult = await updateStockInDB(allFetchedStockData);
            log("+", `DB stock results for order '${order}': Modified ${dbResult.modifiedCount}.`);
        } catch (dbError) {
            log("!", `DB ERROR during stock update for order ${order}: ${dbError.message}.`);
        }
        allFetchedStockData = []; // Clear after update
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  log("?", "Tax-free stock workflow finished.");
}

const database = client.db("snublejuice"); // Define database
const itemCollection = database.collection("products"); // Define itemCollection

async function main() {
  log("?", "Script starting: tax-stock");
  const metaCollection = database.collection("metadata");

  try {
    // Set taxfree.stores to an empty array for all items that have a taxfree part.
    // This clears old stock data before new data is fetched.
    const resetResult = await itemCollection.updateMany(
      { "taxfree.index": { $exists: true } }, // Target only docs with a taxfree subdocument
      { $set: { "taxfree.stores": [] } }
    );
    log("?", `Reset 'taxfree.stores' to [] for ${resetResult.modifiedCount} products.`);
  } catch (dbError) {
    log("!", `DB ERROR resetting taxfree.stores: ${dbError.message}. Attempting to continue.`);
  }

  await fetchTaxFreeStockWorkflow();

  // --- Error Handling and Retry Logic ---
  let persistentErrorCountAfterRetries = 0;
  const initialErrors = errorHandler.getErrorList();

  if (initialErrors.length > 0) {
    log("!", `Initial tax-free stock fetch completed with ${initialErrors.length} errors.`);
    if (initialErrors.length > errorHandler.getErrorThreshold()) {
      log("!", `Error count (${initialErrors.length}) exceeds threshold. Aborting retries.`);
      persistentErrorCountAfterRetries = initialErrors.length;
    } else {
      log("?", `Attempting to retry ${initialErrors.length} failed tax-free stock pages/items.`);
      errorHandler.clearErrorList();
      let successfullyRetriedStockData = [];

      for (const errorEntry of initialErrors) {
        if (errorEntry.item.type === 'taxFreeStockPage') {
          log("?", `Retrying tax-free stock page for order: ${errorEntry.item.order}.`);
          const stockData = await fetchTaxFreeStockPageData(errorEntry.item.order, [], true); // Pass empty processedIndexes for retry simplicity
          if (stockData.length > 0) {
            log("+", `Successfully retried tax-free stock page for order ${errorEntry.item.order}, got ${stockData.length} items.`);
            successfullyRetriedStockData = successfullyRetriedStockData.concat(stockData);
          }
        }
      }

      if (successfullyRetriedStockData.length > 0) {
        log("+", `Updating DB with ${successfullyRetriedStockData.length} successfully retried tax-free stock items.`);
        try {
            const dbResult = await updateStockInDB(successfullyRetriedStockData);
            log("+", `DB results for retried tax-free stock: Modified ${dbResult.modifiedCount}.`);
        }
        catch (dbError) { log("!", `DB Error saving retried tax-free stock: ${dbError.message}`); }
      }
      persistentErrorCountAfterRetries = errorHandler.getErrorCount();
    }
  }

  // Metadata update (original just set 'taxfree: new Date()', maybe should be more specific)
  try {
    await metaCollection.updateOne(
      { id: "stock" },
      { $set: { "status.taxfree_stock_last_updated": new Date() } }, // More specific field
      { upsert: true }
    );
    log("?", "Updated tax-free stock last update timestamp in metadata.");
  } catch(metaError) {
    log("!", `Failed to update metadata for tax-free stock: ${metaError.message}`);
  }

  // Final Exit Code
  if (initialErrors.length > errorHandler.getErrorThreshold()) {
    log("!", `EXITING: Initial error count (${initialErrors.length}) for tax-free stock exceeded threshold.`);
    process.exit(1);
  } else if (persistentErrorCountAfterRetries > 0) {
    log("!", `EXITING: Script tax-stock finished with ${persistentErrorCountAfterRetries} unresolved errors after retries.`);
    errorHandler.getErrorList().forEach(err => {
         log("!", `  Unresolved: ${JSON.stringify(err.item)}, Msg: ${err.errorMessage}`);
    });
    process.exit(1);
  } else {
    log("?", "Script tax-stock completed successfully.");
    process.exit(0);
  }
}

(async () => {
  try {
    await client.connect();
    log("?", "MongoDB client connected for tax-stock script.");
    await main();
  } catch (error) {
    log("!", `Unhandled error in tax-stock main execution: ${error.message} ${error.stack}`);
    process.exit(1);
  } finally {
    try {
      await client.close();
      log("?", "Database connection closed (tax-stock).");
    } catch (closeError) {
      log("!", `Failed to close database connection (tax-stock): ${closeError.message}`);
    }
  }
})();
