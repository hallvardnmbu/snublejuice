import { MongoClient } from "mongodb";

const log = (level, message) => {
  console.log(`${level} [ratings] ${message}`);
};

log("?", "Starting Vivino rating script.");

const client = new MongoClient(
  `mongodb+srv://${process.env.MONGO_USR}:${process.env.MONGO_PWD}@snublejuice.faktu.mongodb.net/?retryWrites=true&w=majority&appName=snublejuice`,
);

try {
  await client.connect();
  log("?", "Connected to database.");
} catch (error) {
  log("!", `Failed to connect to database: ${error.message}`);
  process.exit(1);
}

const database = client.db("snublejuice");
const collection = database.collection("products");

const VIVINO_SEARCH_URL = "https://www.vivino.com/search/wines?q={}";
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};
const JSON_LD_PATTERN =
  /<script type='application\/ld\+json'>([\s\S]*?)<\/script>/;

const _SECOND = 1000;  // seconds in milliseconds
const CONFIG = {
  requestDelay: 10 * _SECOND, // 10 seconds between requests
  retryDelay: 25, // seconds
  noWorkDelay: 4 * 24 * 60 * 60 * _SECOND, // 4 days when no work found
  errorDelay: 2 * 60 * _SECOND, // 2 minutes on error
  minProcessingDelay: _SECOND / 10, // 100ms between operations
  batchSize: 25,
  maxRatingAge: 60, // ~2 months
  maxRetries: 3,
  categories: [
    "Rødvin",
    "Hvitvin",
    "Vin",
    "Musserende vin",
    "Perlende vin",
    "Rosévin",
    "Aromatisert vin",
    "Fruktvin",
    "Sterkvin",
  ],
};

function normalizeString(str) {
  return str
    .toLowerCase()
    .replace(/[àáâãäåæ]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõöø]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[ýÿ]/g, "y")
    .replace(/[ñ]/g, "n")
    .replace(/[ç]/g, "c")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractWineKeywords(name) {
  const normalized = normalizeString(name);
  const words = normalized.split(" ");
  const stopWords = new Set([
    "wine",
    "vin",
    "vino",
    "de",
    "la",
    "le",
    "du",
    "des",
    "di",
    "del",
    "della",
    "von",
    "vom",
    "der",
    "das",
    "den",
  ]);
  return words.filter((word) => word.length > 2 && !stopWords.has(word));
}

function calculateMatchScore(target, candidate) {
  const targetKeywords = extractWineKeywords(target.name);
  const candidateName = normalizeString(candidate.name);
  const candidateDescription = normalizeString(candidate.description || "");
  const candidateManufacturer = normalizeString(
    candidate.manufacturer?.name || "",
  );

  let score = 0;
  let maxScore = targetKeywords.length;

  for (const keyword of targetKeywords) {
    if (candidateName.includes(keyword)) {
      score += 1.0;
    } else if (candidateDescription.includes(keyword)) {
      score += 0.7;
    } else if (candidateManufacturer.includes(keyword)) {
      score += 0.5;
    }
  }

  if (normalizeString(target.name) === candidateName) {
    score += 2;
    maxScore += 2;
  }

  const targetWords = extractWineKeywords(target.name);
  if (
    targetWords.length > 0 &&
    candidateManufacturer.includes(targetWords[0])
  ) {
    score += 0.5;
    maxScore += 0.5;
  }

  return maxScore > 0 ? score / maxScore : 0;
}

function findBestMatch(target, products) {
  if (!products?.length) return null;

  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.6;

  for (const product of products) {
    const score = calculateMatchScore(target, product);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = product;
    }
  }

  return bestMatch ? { product: bestMatch, score: bestScore } : null;
}

async function updateDatabase(records) {
  if (!records.length) return;

  const operations = records.map((record) => ({
    updateOne: {
      filter: { index: record.index },
      update: {
        $set: {
          rating: {
            ...record.rating,
            updated: new Date(),
          },
        },
      },
      upsert: false,
    },
  }));

  await collection.bulkWrite(operations);
  log("?", `Updated ${records.length} records in database.`);
}

async function fetchVivinoPage(url, retry = 0) {
  const response = await fetch(url, {
    method: "GET",
    headers: REQUEST_HEADERS,
    timeout: 15000,
  });

  if (response.status === 429) {
    if (retry < CONFIG.maxRetries) {
      log(
        "!",
        `Rate limited. Retrying in ${CONFIG.retryDelay} seconds (attempt ${retry + 1}/${CONFIG.maxRetries}).`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, CONFIG.retryDelay * 1000),
      );
      return fetchVivinoPage(url, retry + 1);
    }
    throw new Error(`Rate limited after ${CONFIG.maxRetries} retries.`);
  }

  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

function parseVivinoData(html) {
  const match = html.match(JSON_LD_PATTERN);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    return Array.isArray(data) ? data : [data];
  } catch (error) {
    log("!", `Failed to parse JSON-LD data: ${error.message}`);
    return null;
  }
}

function createRatingRecord(index, product, match) {
  return {
    index,
    rating: {
      name: product.name,
      manufacturer: product.manufacturer?.name || "",
      url: product["@id"],
      value: parseFloat(product.aggregateRating?.ratingValue || 0),
      count: parseInt(product.aggregateRating?.reviewCount || 0),
      matchScore: match,
    },
  };
}

function createEmptyRatingRecord(index, error = null) {
  // Used in the database to mark items that have been processed but not matched.
  return {
    index,
    rating: {
      value: null,
      response: null,
      ...(error && { error }),
    },
  };
}

async function searchNewRatings(items) {
  if (!items.length) return;
  log("?", `Searching ratings for ${items.length} products.`);

  const results = [];

  for (const item of items) {
    try {
      const encodedName = encodeURIComponent(item.name);
      const searchUrl = VIVINO_SEARCH_URL.replace("{}", encodedName);
      const html = await fetchVivinoPage(searchUrl);
      const products = parseVivinoData(html);

      if (!products) {
        results.push(createEmptyRatingRecord(item.index));
        continue;
      }

      const match = findBestMatch(item, products);
      if (match) {
        results.push(
          createRatingRecord(item.index, match.product, match.score),
        );
      } else {
        // Store top 3 results for later processing
        const storedResults = products.slice(0, Math.min(3, products.length));
        results.push({
          index: item.index,
          rating: {
            value: null,
            response: JSON.stringify(storedResults),
          },
        });
      }
    } catch (error) {
      log("!", `Error searching for ${item.name}: ${error.message}`);
      results.push(createEmptyRatingRecord(item.index, error.message));
    }

    await new Promise((resolve) => setTimeout(resolve, CONFIG.requestDelay));

    if (results.length >= CONFIG.batchSize) {
      await updateDatabase(results.splice(0, CONFIG.batchSize));
    }
  }

  if (results.length > 0) {
    await updateDatabase(results);
  }
}

async function processStoredResults(items) {
  if (!items.length) return;
  log("?", `Processing ${items.length} stored results.`);

  const results = [];

  for (const item of items) {
    try {
      const storedProducts = JSON.parse(item.rating.response);
      const match = findBestMatch(item, storedProducts);

      if (match) {
        results.push(
          createRatingRecord(item.index, match.product, match.score),
        );
        log(
          "?",
          `Found delayed match for ${item.name} (score: ${match.score.toFixed(2)})`,
        );
      } else {
        // Mark as processed without match
        results.push({
          index: item.index,
          rating: {
            ...item.rating,
            response: null,
          },
        });
      }
    } catch (error) {
      log(
        "!",
        `Error processing stored result for ${item.name}: ${error.message}`,
      );
      results.push({
        index: item.index,
        rating: {
          ...item.rating,
          response: null,
          error: error.message,
        },
      });
    }
  }

  if (results.length > 0) {
    await updateDatabase(results);
  }
}

async function updateExistingRatings(items) {
  if (!items.length) return;
  log("?", `Updating ${items.length} existing ratings.`);

  const results = [];

  for (const item of items) {
    try {
      const html = await fetchVivinoPage(item.rating.url);
      const products = parseVivinoData(html);

      if (products?.[0]) {
        const product = products[0];
        results.push({
          index: item.index,
          rating: {
            ...item.rating,
            description: product.description,
            value: parseFloat(product.aggregateRating?.ratingValue || 0),
            count: parseInt(product.aggregateRating?.reviewCount || 0),
          },
        });
        log(
          "?",
          `Updated rating for ${item.name}: ${product.aggregateRating?.ratingValue}`,
        );
      } else {
        results.push({
          index: item.index,
          rating: {
            ...item.rating,
            error: "No data found in update",
          },
        });
      }
    } catch (error) {
      log("!", `Error updating ${item.name}: ${error.message}`);
      results.push({
        index: item.index,
        rating: {
          ...item.rating,
          error: error.message,
        },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, CONFIG.requestDelay));

    if (results.length >= CONFIG.batchSize) {
      await updateDatabase(results.splice(0, CONFIG.batchSize));
    }
  }

  if (results.length > 0) {
    await updateDatabase(results);
  }
}

async function getWorkItems() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.maxRatingAge);

  // Priority 1: Items without any rating
  const newItems = await collection
    .find({
      index: { $exists: true, $ne: null },
      name: { $exists: true },
      $or: [
        { rating: null },
        { rating: { $exists: false } },
        { "rating.value": null },
      ],
      category: { $in: CONFIG.categories },
    })
    .project({ index: 1, name: 1, _id: 0 })
    .toArray();

  if (newItems.length > 0) {
    return { type: "search", items: newItems };
  }

  // // Priority 2: Items with stored results to process
  // const storedItems = await collection
  //   .find({
  //     "rating.response": { $exists: true, $ne: null },
  //     "rating.value": null,
  //   })
  //   .project({ index: 1, name: 1, rating: 1, _id: 0 })
  //   .limit(CONFIG.batchSize)
  //   .toArray();

  // if (storedItems.length > 0) {
  //   return { type: "stored", items: storedItems };
  // }

  // Priority 3: Items with old ratings
  const oldItems = await collection
    .find({
      "rating.url": { $exists: true, $ne: null },
      $or: [
        { "rating.updated": { $exists: false } },
        { "rating.updated": null },
        { "rating.updated": { $lt: cutoffDate } },
      ],
    })
    .project({ index: 1, name: 1, rating: 1, _id: 0 })
    .sort({ "rating.updated": 1 })
    .toArray();

  if (oldItems.length > 0) {
    return { type: "update", items: oldItems };
  }

  return { type: "none", items: [] };
}

async function convertUpdatedToDate() {
  // Convert all `rating.updated` from string to date.
  // This is done every loop iteration, in case a restore has been done.
  await collection.updateMany(
    { "rating.updated": { $type: "string", $ne: null } },
    [
      { $set: { "rating.updated": { $toDate: "$rating.updated" } } }
    ]
  );
}

async function continuousLoop() {
  log("?", "Starting continuous rating update loop.");

  while (true) {
    try {
      const work = await getWorkItems();

      switch (work.type) {
        case "search":
          log("?", `Processing ${work.items.length} items for search.`);
          await searchNewRatings(work.items);
          break;

        case "stored":
          log("?", `Processing ${work.items.length} stored results.`);
          await processStoredResults(work.items);
          break;

        case "update":
          log("?", `Updating ${work.items.length} existing ratings.`);
          await updateExistingRatings(work.items);
          break;

        case "none":
          log("?", "No work found. Waiting before next check.");
          await new Promise((resolve) =>
            setTimeout(resolve, CONFIG.noWorkDelay),
          );
          break;
      }

      if (work.type !== "none") {
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.minProcessingDelay),
        );
      }
    } catch (error) {
      log("!", `Error in continuous loop: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, CONFIG.errorDelay));
    }
  }
}

async function main() {
  try {
    await convertUpdatedToDate();
  } catch (error) {
    log("!", `Failed to convert updated 'rating.updated' to date: ${error.message}`);
  }

  await continuousLoop();
}

try {
  await main();
} catch (error) {
  log("!", `Script failed: ${error.message}`);
  console.error(error);
} finally {
  await client.close();
  log("?", "Database connection closed.");
}
