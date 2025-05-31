// fetch/vivino/rating.mjs
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import * as errorHandler from '../lib/errorHandler.mjs'; // Added

dotenv.config();

const SCRIPT_NAME = 'viv-rating'; // Added

const log = (level, message) => {
  const msgStr = (message !== null && message !== undefined) ? message.toString() : "";
  console.log(`${level} [${SCRIPT_NAME}] ${msgStr}`);
};

log("?", "Starting Vivino rating script.");

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
);

// DATABASE CONNECTION is handled in the main IIFE

const VIVINO_SEARCH_URL = "https://www.vivino.com/search/wines?q={}";
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9", // Added to potentially stabilize Vivino responses
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
};
const JSON_LD_PATTERN = /<script type='application\/ld\+json'>([\s\S]*?)<\/script>/;

const _SECOND = 1000;
const CONFIG = {
  batchSize: 10, // Reduced batch size for potentially better stability
  requestDelay: 15 * _SECOND, // Increased delay
  maxRatingAge: 14,
  maxRetries: 2, // Reduced max retries for fetchVivinoPage
  retryDelay: 30,
  noWorkDelay: 60 * 60 * _SECOND,
  errorDelay: 5 * 60 * _SECOND, // Increased error delay
  minProcessingDelay: _SECOND,
  categories: [
    "Rødvin", "Hvitvin", "Vin", "Musserende vin", "Perlende vin",
    "Rosévin", "Aromatisert vin", "Fruktvin", "Sterkvin",
  ],
  // Threshold for consecutive batches failing before a longer pause
  maxConsecutiveErrorBatches: 3,
};

// --- Utility Functions (normalizeString, extractWineKeywords, calculateMatchScore, findBestMatch) ---
// These functions remain unchanged from the original script.
function normalizeString(str) {
  return str.toLowerCase().replace(/[àáâãäåæ]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i").replace(/[òóôõöø]/g, "o").replace(/[ùúûü]/g, "u").replace(/[ýÿ]/g, "y").replace(/[ñ]/g, "n").replace(/[ç]/g, "c").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function extractWineKeywords(name) {
  const normalized = normalizeString(name); const words = normalized.split(" ");
  const stopWords = new Set(["wine", "vin", "vino", "de", "la", "le", "du", "des", "di", "del", "della", "von", "vom", "der", "das", "den"]);
  return words.filter(word => word.length > 2 && !stopWords.has(word));
}
function calculateMatchScore(target, candidate) {
  const targetKeywords = extractWineKeywords(target.name); const candidateName = normalizeString(candidate.name);
  const candidateDescription = normalizeString(candidate.description || ""); const candidateManufacturer = normalizeString(candidate.manufacturer?.name || "");
  let score = 0; let maxScore = targetKeywords.length;
  for (const keyword of targetKeywords) {
    if (candidateName.includes(keyword)) score += 1.0;
    else if (candidateDescription.includes(keyword)) score += 0.7;
    else if (candidateManufacturer.includes(keyword)) score += 0.5;
  }
  if (normalizeString(target.name) === candidateName) { score += 2; maxScore += 2; }
  const targetWords = extractWineKeywords(target.name);
  if (targetWords.length > 0 && candidateManufacturer.includes(targetWords[0])) { score += 0.5; maxScore += 0.5; }
  return maxScore > 0 ? score / maxScore : 0;
}
function findBestMatch(target, products) {
  if (!products?.length) return null;
  let bestMatch = null; let bestScore = 0; const threshold = 0.6;
  for (const product of products) {
    const score = calculateMatchScore(target, product);
    if (score > bestScore && score >= threshold) { bestScore = score; bestMatch = product; }
  }
  return bestMatch ? { product: bestMatch, score: bestScore } : null;
}
// --- End Utility Functions ---

async function updateDatabase(recordsToUpdate, dbCollection) { // Added dbCollection parameter
  if (!recordsToUpdate.length) return;
  const operations = recordsToUpdate.map((record) => ({
    updateOne: {
      filter: { index: record.index },
      update: { $set: { rating: { ...record.rating, updated: new Date() } } },
      upsert: false, // Ratings are for existing products
    },
  }));
  try {
    await dbCollection.bulkWrite(operations);
    log("?", `Updated ${recordsToUpdate.length} records in database.`);
  } catch (dbError) {
    log("!", `DB BULK WRITE ERROR: ${dbError.message}. ${recordsToUpdate.length} records might not have been updated.`);
    // This is a DB error, not a fetch error. Could be added to errorHandler with a different type.
    errorHandler.addItemToErrorList({ type: 'vivinoDbUpdateFail', count: recordsToUpdate.length, details: dbError.message }, SCRIPT_NAME, `DB bulkWrite failed: ${dbError.message}`);
  }
}

// Modified fetchVivinoPage to integrate errorHandler
async function fetchVivinoPage(url, currentRetry = 0) {
  try {
    const response = await fetch(url, { method: "GET", headers: REQUEST_HEADERS}); // Removed timeout for now, rely on fetch's default or signal
    if (response.status === 429) { // Rate limited
      if (currentRetry < CONFIG.maxRetries) {
        log("!", `Rate limited by Vivino. Retrying in ${CONFIG.retryDelay}s (attempt ${currentRetry + 1}/${CONFIG.maxRetries}). URL: ${url}`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay * 1000));
        return fetchVivinoPage(url, currentRetry + 1);
      } else {
        const errMsg = `Vivino rate limited after ${CONFIG.maxRetries} retries. URL: ${url}`;
        log("!", errMsg);
        errorHandler.addItemToErrorList({ type: 'vivinoRateLimit', url: url }, SCRIPT_NAME, errMsg);
        throw new Error(errMsg);
      }
    }
    if (!response.ok) { // Other HTTP errors
      const errorText = await response.text().catch(() => response.statusText);
      const errMsg = `Vivino HTTP ${response.status}: ${errorText}. URL: ${url}`;
      if (currentRetry < CONFIG.maxRetries) {
        log("!", `Vivino HTTP error. Retrying in ${CONFIG.retryDelay}s (attempt ${currentRetry + 1}/${CONFIG.maxRetries}). Error: ${errMsg}`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay * 1000));
        return fetchVivinoPage(url, currentRetry + 1);
      } else {
        log("!", `Vivino HTTP error after ${CONFIG.maxRetries} retries: ${errMsg}`);
        errorHandler.addItemToErrorList({ type: 'vivinoHttpError', url: url, status: response.status }, SCRIPT_NAME, errMsg);
        throw new Error(errMsg);
      }
    }
    return response.text();
  } catch (err) { // Network errors or errors thrown from above
    if (currentRetry < CONFIG.maxRetries) {
      log("!", `Vivino fetch error: ${err.message}. Retrying in ${CONFIG.retryDelay}s (attempt ${currentRetry + 1}/${CONFIG.maxRetries}). URL: ${url}`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay * 1000));
      return fetchVivinoPage(url, currentRetry + 1);
    } else {
      const finalErrMsg = `Failed to fetch Vivino page after ${CONFIG.maxRetries} retries. URL: ${url}. Last error: ${err.message}`;
      log("!", finalErrMsg);
      // Check if it's a timeout error specifically, as fetch might not always throw a specific timeout type easily
      if (err.name === 'AbortError' || err.message.toLowerCase().includes('timeout')) {
         errorHandler.addItemToErrorList({ type: 'vivinoTimeout', url: url }, SCRIPT_NAME, finalErrMsg);
      } else {
         errorHandler.addItemToErrorList({ type: 'vivinoFetchFail', url: url }, SCRIPT_NAME, finalErrMsg);
      }
      throw err; // Re-throw original error or a new error wrapping it
    }
  }
}

function parseVivinoData(html) {
  const match = html.match(JSON_LD_PATTERN);
  if (!match || !match[1]) {
    log("?", "No JSON-LD script tag found in Vivino HTML.");
    return null;
  }
  try {
    const data = JSON.parse(match[1]);
    return Array.isArray(data) ? data : [data]; // Ensure it's always an array
  } catch (error) {
    log("!", `Failed to parse Vivino JSON-LD data: ${error.message}. Data: ${match[1].substring(0,100)}`);
    return null;
  }
}

function createRatingRecord(index, product, matchScore = null) { /* Unchanged */ return { index, rating: { name: product.name, manufacturer: product.manufacturer?.name || "", url: product["@id"], value: parseFloat(product.aggregateRating?.ratingValue || 0), count: parseInt(product.aggregateRating?.reviewCount || 0), ...(matchScore && { matchScore }) } }; }
function createEmptyRatingRecord(index, errorMsg = null) { /* Unchanged */ return { index, rating: { value: null, response: null, ...(errorMsg && { error: errorMsg }) } }; }

async function searchNewRatings(items, dbCollection) {
  if (!items.length) return false; // Return value indicates if any errors occurred in batch
  log("?", `Searching ratings for ${items.length} products.`);
  const results = []; let batchHadHardError = false;

  for (const item of items) {
    try {
      const encodedName = encodeURIComponent(item.name);
      const searchUrl = VIVINO_SEARCH_URL.replace("{}", encodedName);
      const html = await fetchVivinoPage(searchUrl); // errorHandler passed via closure/scope
      const products = parseVivinoData(html);

      if (!products) {
        results.push(createEmptyRatingRecord(item.index, "No products parsed from Vivino page"));
        continue;
      }
      const match = findBestMatch(item, products);
      if (match) {
        results.push(createRatingRecord(item.index, match.product, match.score));
        log("?", `Found rating for ${item.name}: ${match.product.aggregateRating?.ratingValue} (score: ${match.score.toFixed(2)})`);
      } else {
        results.push({ index: item.index, rating: { value: null, response: JSON.stringify(products.slice(0, 3)) } });
      }
    } catch (error) { // Error from fetchVivinoPage (already logged to errorHandler) or other logic
      log("!", `Error searching for ${item.name}: ${error.message}`);
      results.push(createEmptyRatingRecord(item.index, error.message));
      batchHadHardError = true; // Mark that this item specifically failed hard
    }
    await new Promise(resolve => setTimeout(resolve, CONFIG.requestDelay));
    if (results.length >= CONFIG.batchSize) {
      await updateDatabase(results.splice(0, CONFIG.batchSize), dbCollection);
    }
  }
  if (results.length > 0) await updateDatabase(results, dbCollection);
  return batchHadHardError;
}

async function processStoredResults(items, dbCollection) { /* Mostly unchanged, ensure dbCollection is passed */
  if (!items.length) return; log("?", `Processing ${items.length} stored results.`); const results = [];
  for (const item of items) {
    try {
      const storedProducts = JSON.parse(item.rating.response); const match = findBestMatch(item, storedProducts);
      if (match) { results.push(createRatingRecord(item.index, match.product, match.score)); log("?", `Found delayed match for ${item.name} (score: ${match.score.toFixed(2)})`); }
      else { results.push({ index: item.index, rating: { ...item.rating, response: null } }); }
    } catch (error) { log("!", `Error processing stored result for ${item.name}: ${error.message}`); results.push({ index: item.index, rating: { ...item.rating, response: null, error: error.message } }); }
  }
  if (results.length > 0) await updateDatabase(results, dbCollection);
}

async function updateExistingRatings(items, dbCollection) {
  if (!items.length) return false;
  log("?", `Updating ${items.length} existing ratings.`);
  const results = []; let batchHadHardError = false;

  for (const item of items) {
    try {
      if (!item.rating || !item.rating.url) { // Ensure URL exists
        log("!", `Skipping update for ${item.name} due to missing rating URL.`);
        results.push(createEmptyRatingRecord(item.index, "Missing rating URL for update"));
        continue;
      }
      const html = await fetchVivinoPage(item.rating.url);
      const products = parseVivinoData(html);
      if (products?.[0]) {
        const product = products[0];
        results.push({ index: item.index, rating: { ...item.rating, description: product.description, value: parseFloat(product.aggregateRating?.ratingValue || 0), count: parseInt(product.aggregateRating?.reviewCount || 0) } });
        log("?", `Updated rating for ${item.name}: ${product.aggregateRating?.ratingValue}`);
      } else {
        results.push(createEmptyRatingRecord(item.index, "No data found in Vivino update response"));
      }
    } catch (error) {
      log("!", `Error updating rating for ${item.name}: ${error.message}`);
      results.push(createEmptyRatingRecord(item.index, error.message));
      batchHadHardError = true;
    }
    await new Promise(resolve => setTimeout(resolve, CONFIG.requestDelay));
    if (results.length >= CONFIG.batchSize) {
      await updateDatabase(results.splice(0, CONFIG.batchSize), dbCollection);
    }
  }
  if (results.length > 0) await updateDatabase(results, dbCollection);
  return batchHadHardError;
}

async function getWorkItems(dbCollection) { /* Unchanged, ensure dbCollection is passed */
  const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - CONFIG.maxRatingAge);
  const newItems = await dbCollection.find({ index: { $exists: true, $ne: null }, name: { $exists: true }, $or: [{ rating: null }, { rating: { $exists: false } }, { "rating.value": null }], category: { $in: CONFIG.categories } }).project({ index: 1, name: 1, _id: 0 }).limit(CONFIG.batchSize).toArray();
  if (newItems.length > 0) return { type: "search", items: newItems };
  const storedItems = await dbCollection.find({ "rating.response": { $exists: true, $ne: null }, "rating.value": null }).project({ index: 1, name: 1, rating: 1, _id: 0 }).limit(CONFIG.batchSize).toArray();
  if (storedItems.length > 0) return { type: "stored", items: storedItems };
  const oldItems = await dbCollection.find({ "rating.url": { $exists: true, $ne: null }, $or: [{ "rating.updated": { $exists: false } }, { "rating.updated": null }, { "rating.updated": { $lt: cutoffDate } }] }).project({ index: 1, name: 1, rating: 1, _id: 0 }).sort({ "rating.updated": 1 }).limit(CONFIG.batchSize).toArray();
  if (oldItems.length > 0) return { type: "update", items: oldItems };
  return { type: "none", items: [] };
}

async function continuousLoop(dbCollection) {
  log("?", "Starting continuous rating update loop.");
  let consecutiveBatchesWithHardErrors = 0;

  while (true) {
    try {
      if (errorHandler.getErrorCount() > errorHandler.getErrorThreshold()) {
        log("!", `Vivino script error threshold (${errorHandler.getErrorThreshold()}) reached with ${errorHandler.getErrorCount()} accumulated errors. Terminating script.`);
        errorHandler.getErrorList().forEach(err => { log("!", `  Unresolved: Type: ${err.item.type}, URL/Detail: ${err.item.url || err.item.detail}, Msg: ${err.errorMessage}`); });
        process.exit(1); // Terminate
      }

      const work = await getWorkItems(dbCollection);
      let currentBatchHadHardError = false;

      switch (work.type) {
        case "search":
          currentBatchHadHardError = await searchNewRatings(work.items, dbCollection);
          break;
        case "stored": // This typically doesn't have hard fetch errors, mostly parsing.
          await processStoredResults(work.items, dbCollection);
          break;
        case "update":
          currentBatchHadHardError = await updateExistingRatings(work.items, dbCollection);
          break;
        case "none":
          log("?", "No rating work found. Waiting before next check.");
          await new Promise(resolve => setTimeout(resolve, CONFIG.noWorkDelay));
          consecutiveBatchesWithHardErrors = 0; // Reset on no work
          break;
      }

      if (currentBatchHadHardError) {
        consecutiveBatchesWithHardErrors++;
      } else if (work.type !== "none") {
        consecutiveBatchesWithHardErrors = 0;
      }

      if (consecutiveBatchesWithHardErrors >= CONFIG.maxConsecutiveErrorBatches) {
          log("!", `${CONFIG.maxConsecutiveErrorBatches} consecutive Vivino batches had hard errors. Pausing for a longer duration.`);
          await new Promise(resolve => setTimeout(resolve, CONFIG.noWorkDelay * 2));
          consecutiveBatchesWithHardErrors = 0;
      }

      if (work.type !== "none" && !currentBatchHadHardError) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.minProcessingDelay));
      }
    } catch (loopError) {
      log("!", `Critical error in continuous_loop: ${loopError.message} ${loopError.stack}`);
      errorHandler.addItemToErrorList({ type: 'vivinoLoopError', detail: loopError.message }, SCRIPT_NAME, loopError.message);
      await new Promise(resolve => setTimeout(resolve, CONFIG.errorDelay));
    }
  }
}

async function main(dbCollection) { // Takes dbCollection
  await continuousLoop(dbCollection); // Passes dbCollection
}

(async () => {
  let dbCollection;
  try {
    await client.connect();
    log("?", "MongoDB client connected for viv-rating script.");
    const database = client.db("snublejuice"); // Define database after connect
    dbCollection = database.collection("products"); // Define collection after connect
    await main(dbCollection); // Pass collection to main
  } catch (error) {
    log("!", `Unhandled error in viv-rating main execution: ${error.message} ${error.stack}`);
    // If errorHandler is available and error is critical before loop starts
    if (errorHandler && errorHandler.addItemToErrorList) {
        errorHandler.addItemToErrorList({ type: 'vivinoStartupError', detail: error.message }, SCRIPT_NAME, error.message);
    }
    process.exit(1); // Ensure exit
  } finally {
    try {
      await client.close();
      log("?", "Database connection closed (viv-rating).");
    } catch (closeError) {
      log("!", `Failed to close database connection (viv-rating): ${closeError.message}`);
    }
  }
})();
