import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const log = (level, message) => {
  console.log(
    `${new Date().toISOString()} ${level} [vivino-ratings] ${message}`,
  );
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
const itemCollection = database.collection("products");

const SEARCH = "https://www.vivino.com/search/wines?q={}";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};
const PATTERNS = {
  search: /<script type='application\/ld\+json'>([\s\S]*?)<\/script>/,
  vintages:
    /<div class="vivinoRating_averageValue.*?">([\d.]+)<\/div>.*?<div class="vivinoRating_caption.*?">(.+?)<\/div>/,
};
const TRIES = {
  max: 3,
  delay: 25, // seconds
};
const CONFIG = {
  batchSize: 25,
  requestDelay: 10000, // 10 seconds
  maxRatingAge: 14, // days
  sleepDuration: 3600000, // 1 hour in ms
  noWorkSleepDuration: 86400000, // 24 hours in ms
};

// Improved string matching utility functions
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

  // Common wine-related stop words to ignore
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

  // Check exact matches in name
  for (const keyword of targetKeywords) {
    if (candidateName.includes(keyword)) {
      score += 1.0;
    } else if (candidateDescription.includes(keyword)) {
      score += 0.7;
    } else if (candidateManufacturer.includes(keyword)) {
      score += 0.5;
    }
  }

  // Bonus for exact name match
  if (normalizeString(target.name) === candidateName) {
    score += 2;
    maxScore += 2;
  }

  // Bonus for manufacturer match if we can extract it from target
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
  if (!products || products.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.6; // Minimum match threshold

  for (const product of products) {
    const score = calculateMatchScore(target, product);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = product;
    }
  }

  return bestMatch ? { product: bestMatch, score: bestScore } : null;
}

async function updateDatabase(data, upsert = false) {
  if (data.length === 0) return;

  const operations = data.map((record) => ({
    updateOne: {
      filter: { index: record.index },
      update: { $set: { rating: record.rating } },
      upsert: upsert,
    },
  }));

  await itemCollection.bulkWrite(operations);
  log("?", `Updated ${data.length} records in database.`);
}

async function processStoredResults() {
  log("?", "Processing stored search results without matches.");

  const itemsWithStoredResults = await itemCollection
    .find({
      "rating.response": { $exists: true, $ne: null },
      "rating.value": null,
    })
    .project({ index: 1, name: 1, rating: 1, _id: 0 })
    .toArray();

  if (itemsWithStoredResults.length === 0) {
    log("?", "No stored results to process.");
    return;
  }

  log(
    "?",
    `Processing ${itemsWithStoredResults.length} items with stored results.`,
  );

  const processed = [];

  for (const item of itemsWithStoredResults) {
    try {
      const storedProducts = JSON.parse(item.rating.response);
      const match = findBestMatch(item, storedProducts);

      if (match) {
        const processed_item = {
          index: item.index,
          rating: {
            name: match.product.name,
            manufacturer: match.product.manufacturer?.name || "",
            url: match.product["@id"],
            value: parseFloat(match.product.aggregateRating?.ratingValue || 0),
            count: parseInt(match.product.aggregateRating?.reviewCount || 0),
            matchScore: match.score,
            updated: new Date(),
          },
        };
        processed.push(processed_item);
        log(
          "?",
          `Found delayed match for ${item.name} (score: ${match.score.toFixed(2)})`,
        );
      }
    } catch (error) {
      log(
        "!",
        `Error processing stored result for ${item.name}: ${error.message}`,
      );
    }
  }

  if (processed.length > 0) {
    await updateDatabase(processed, false);
    log("?", `Successfully processed ${processed.length} stored results.`);
  }
}

async function searchRatings(items) {
  if (items.length === 0) return;

  log("?", `Starting search for ${items.length} products on Vivino.`);

  function processSearchResults(products, target) {
    if (!target.index || !products) {
      return {
        index: target.index,
        rating: {
          value: null,
          response: null,
        },
      };
    }

    // Try to find best match using improved algorithm
    const match = findBestMatch(target, products);

    if (match) {
      return {
        index: target.index,
        rating: {
          name: match.product.name,
          manufacturer: match.product.manufacturer?.name || "",
          url: match.product["@id"],
          value: parseFloat(match.product.aggregateRating?.ratingValue || 0),
          count: parseInt(match.product.aggregateRating?.reviewCount || 0),
          matchScore: match.score,
          updated: new Date(),
        },
      };
    }

    // Store top 3 results for later processing if not matched
    return {
      index: target.index,
      rating: {
        value: null,
        response:
          products.length > 0
            ? JSON.stringify(products.slice(0, Math.min(3, products.length)))
            : null,
        lastSearched: new Date(),
      },
    };
  }

  async function search(target, retry = 0) {
    const encodedName = encodeURIComponent(target.name);
    const response = await fetch(SEARCH.replace("{}", encodedName), {
      method: "GET",
      headers: HEADERS,
      timeout: 15000,
    });

    if (response.status === 429) {
      if (retry < TRIES.max) {
        log(
          "!",
          `Rate limited. Retrying in ${TRIES.delay} seconds (attempt ${retry + 1}/${TRIES.max}).`,
        );
        await new Promise((resolve) => setTimeout(resolve, TRIES.delay * 1000));
        return search(target, retry + 1);
      }
      throw new Error(`Rate limited after ${TRIES.max} retries.`);
    } else if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const match = text.match(PATTERNS.search);

    if (!match) {
      return {
        index: target.index,
        rating: {
          value: null,
          response: null,
          lastSearched: new Date(),
        },
      };
    }

    const searchData = JSON.parse(match[1]);
    return processSearchResults(
      Array.isArray(searchData) ? searchData : [searchData],
      target,
    );
  }

  let products = [];

  for (const item of items) {
    try {
      const product = await search(item);
      products.push(product);

      if (product.rating.value) {
        log(
          "?",
          `Found rating for ${item.name}: ${product.rating.value} (${product.rating.count} reviews)`,
        );
      }
    } catch (err) {
      log(
        "!",
        `Error searching for ${item.name} (${item.index}): ${err.message}`,
      );
      products.push({
        index: item.index,
        rating: {
          value: null,
          response: null,
          error: err.message,
          lastSearched: new Date(),
        },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, CONFIG.requestDelay));

    if (products.length >= CONFIG.batchSize) {
      await updateDatabase(products, false);
      products = [];
    }
  }

  if (products.length > 0) {
    await updateDatabase(products, false);
  }

  log("?", `Finished searching for ${items.length} products on Vivino.`);
}

async function updateRatings(items) {
  if (items.length === 0) return;

  log("?", `Updating ratings for ${items.length} products on Vivino.`);

  async function search(item, retry = 0) {
    const response = await fetch(item.rating.url, {
      method: "GET",
      headers: HEADERS,
      timeout: 15000,
    });

    if (response.status === 429) {
      if (retry < TRIES.max) {
        log(
          "!",
          `Rate limited. Retrying in ${TRIES.delay} seconds (attempt ${retry + 1}/${TRIES.max}).`,
        );
        await new Promise((resolve) => setTimeout(resolve, TRIES.delay * 1000));
        return search(item, retry + 1);
      }
      throw new Error(`Rate limited after ${TRIES.max} retries.`);
    } else if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const match = text.match(PATTERNS.search);

    if (!match) {
      throw new Error(`No JSON-LD data found`);
    }

    const data = JSON.parse(match[1]);

    return {
      index: item.index,
      rating: {
        ...item.rating,
        description: data.description,
        value: parseFloat(data.aggregateRating?.ratingValue || 0),
        count: parseInt(data.aggregateRating?.ratingCount || 0),
        reviews: parseInt(data.aggregateRating?.reviewCount || 0),
        updated: new Date(),
      },
    };
  }

  let products = [];

  for (const item of items) {
    try {
      const product = await search(item);
      products.push(product);
      log("?", `Updated rating for ${item.name}: ${product.rating.value}`);
    } catch (err) {
      log("!", `Error updating ${item.name} (${item.index}): ${err.message}`);
      // Keep the existing rating but update the timestamp to avoid immediate retry
      products.push({
        index: item.index,
        rating: {
          ...item.rating,
          updated: new Date(),
          lastError: err.message,
        },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, CONFIG.requestDelay));

    if (products.length >= CONFIG.batchSize) {
      await updateDatabase(products, false);
      products = [];
    }
  }

  if (products.length > 0) {
    await updateDatabase(products, false);
  }

  log("?", `Finished updating ratings for ${items.length} products on Vivino.`);
}

async function getWorkItems() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.maxRatingAge);

  // Priority 1: Items without any rating
  const newItems = await itemCollection
    .find({
      index: { $exists: true, $ne: null },
      name: { $exists: true },
      $or: [
        { rating: null },
        { rating: { $exists: false } },
        { $and: [{ rating: { $exists: true } }, { "rating.value": null }] },
      ],
      category: {
        $in: [
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
      },
    })
    .project({ index: 1, name: 1, _id: 0 })
    .limit(100)
    .toArray();

  if (newItems.length > 0) {
    log("?", `Found ${newItems.length} items without ratings.`);
    return { type: "search", items: newItems };
  }

  // Priority 2: Items with stored results to process
  const storedResults = await itemCollection
    .find({
      "rating.response": { $exists: true, $ne: null },
      "rating.value": null,
    })
    .countDocuments();

  if (storedResults > 0) {
    log("?", `Found ${storedResults} stored results to process.`);
    return { type: "stored", items: [] };
  }

  // Priority 3: Items with old ratings
  const oldRatings = await itemCollection
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
    .limit(50)
    .toArray();

  if (oldRatings.length > 0) {
    log("?", `Found ${oldRatings.length} items with old ratings.`);
    return { type: "update", items: oldRatings };
  }

  return { type: "none", items: [] };
}

async function continuousLoop() {
  log("?", "Starting continuous rating update loop.");

  while (true) {
    try {
      const work = await getWorkItems();

      switch (work.type) {
        case "search":
          await searchRatings(work.items);
          await new Promise((resolve) =>
            setTimeout(resolve, CONFIG.sleepDuration),
          );
          break;

        case "stored":
          await processStoredResults();
          await new Promise((resolve) =>
            setTimeout(resolve, CONFIG.sleepDuration),
          );
          break;

        case "update":
          await updateRatings(work.items);
          await new Promise((resolve) =>
            setTimeout(resolve, CONFIG.sleepDuration),
          );
          break;

        case "none":
          log(
            "?",
            `No work found. Sleeping for ${CONFIG.noWorkSleepDuration / 3600000} hours.`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, CONFIG.noWorkSleepDuration),
          );
          break;
      }
    } catch (error) {
      log("!", `Error in continuous loop: ${error.message}`);
      log(
        "?",
        `Sleeping for ${CONFIG.sleepDuration / 60000} minutes before retry.`,
      );
      await new Promise((resolve) => setTimeout(resolve, CONFIG.sleepDuration));
    }
  }
}

async function main() {
  // First, process any existing stored results
  await processStoredResults();

  // Then start the continuous loop
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
