import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const log = (level, message) => {
  console.log(`[viv rat] [${level}] ${message}`);
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
  max: 1,
  delay: 25, // seconds
};
const THRESHOLDS = {
  short: 0.75,
  long: 0.5,
};

async function updateDatabase(data, upsert = false) {
  const operations = data.map((record) => ({
    updateOne: {
      filter: { index: record.index },
      update: { $set: { rating: record.rating } },
      upsert: upsert,
    },
  }));

  await itemCollection.bulkWrite(operations);

  return;
}

async function searchRatings(items) {
  log("?", `Starting search for ${items.length} products on Vivino.`);

  function process(products, target) {
    if (!target.index || !products) {
      return null;
    }

    // Iterate through search results to find a match.
    for (const product of products) {
      const processed = {
        index: target.index,
        rating: {
          name: product.name,
          manufacturer: product.manufacturer.name,
          url: product["@id"],

          value: product.aggregateRating.ratingValue,
          count: product.aggregateRating.reviewCount,

          updated: new Date(),
        },
      };

      // Exact match.
      if (product.name.toLowerCase() === target.name.toLowerCase()) {
        return processed;
      }

      // Partial match within description.
      const description = product.description.toLowerCase().split(" ");
      const truth = target.name.toLowerCase().split(" ");
      if (
        truth.reduce(
          (acc, word) => acc + (description.includes(word) ? 1 : 0),
          0,
        ) /
          truth.length >
        (description.length > 5 || truth.length > 5)
          ? THRESHOLDS.long
          : THRESHOLDS.short
      ) {
        return processed;
      }
    }

    // In case of no match, return the top three results from search.
    // For easy access later.
    return {
      index: target.index,
      rating: {
        value: null,
        response:
          products.length > 0
            ? JSON.stringify(products.slice(0, Math.min(3, products.length)))
            : null,
      },
    };
  }

  async function search(target, retry = 0) {
    const response = await fetch(SEARCH.replace("{}", target.name), {
      method: "GET",
      headers: HEADERS,
      timeout: 10000,
    });

    if (response.status === 429) {
      if (retry < TRIES.max) {
        log(
          "!",
          `Timed out after ${retry + 1} retries. Retrying in ${TRIES.delay} seconds.`,
        );

        await new Promise((resolve) => setTimeout(resolve, TRIES.delay * 1000));
        return search(target, retry + 1);
      }

      throw new Error(`Timed out for ${retry + 1} tries.`);
    } else if (response.status !== 200) {
      throw new Error(`Status ${response.status}: ${response.statusText}.`);
    }

    const text = await response.text();
    const match = text.match(PATTERNS.search);

    if (!match) {
      return {
        index: target.index,
        rating: {
          value: null,
          response: null,
        },
      };
    }

    return process(JSON.parse(match[1]), target);
  }

  let products = [];

  for (const item of items) {
    try {
      let product = (await search(item)) || {
        index: item.index,
        rating: {
          value: null,
          response: null,
        },
      };
      products = products.concat(product);
    } catch (err) {
      log(
        "!",
        `Error when searching for ${item.name} (${item.index}): ${err.message}`,
      );
    }

    // To comply with vivino.com/robots.txt and avoid rate limiting.
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (products.length >= 25) {
      await updateDatabase(products, false);
      products = [];
    }
  }

  // Insert the remaining products, if any.
  if (products.length !== 0) {
    await updateDatabase(products, false);
  }

  log("?", `Finished searching for ${items.length} products on Vivino.`);
  return;
}

async function aggregatedRatings(items) {
  log(
    "?",
    `Extracting aggregated ratings for ${items.length} products on Vivino.`,
  );

  async function search(item, retry = 0) {
    const response = await fetch(item.rating.url, {
      method: "GET",
      headers: HEADERS,
      timeout: 10000,
    });

    if (response.status === 429) {
      if (retry < TRIES.max) {
        log(
          "!",
          `Timed out after ${retry + 1} retries. Retrying in ${TRIES.delay} seconds.`,
        );

        await new Promise((resolve) => setTimeout(resolve, TRIES.delay * 1000));
        return search(item, retry + 1);
      }

      throw new Error(`Timed out for ${retry + 1} tries.`);
    } else if (response.status !== 200) {
      throw new Error(`Status ${response.status}: ${response.statusText}.`);
    }

    const text = await response.text();
    const match = text.match(PATTERNS.vintages);

    if (!match) {
      throw new Error(`No pattern match found.`);
    }

    return {
      index: item.index,
      rating: {
        value: parseFloat(match[1]),
        count: match[2],
      },
    };
  }

  let products = [];

  for (const item of items) {
    try {
      let product = await search(item);
      if (!product) continue;
      products = products.concat(product);
    } catch (err) {
      log(
        "!",
        `Error when searching for ${item.name} (${item.index}): ${err.message}`,
      );
    }

    // To comply with vivino.com/robots.txt and avoid rate limiting.
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (products.length >= 25) {
      await updateDatabase(products, false);
      products = [];
    }
  }

  // Insert the remaining products, if any.
  if (products.length !== 0) {
    await updateDatabase(products, false);
  }

  log(
    "?",
    `Finished extracting aggregated ratings for ${items.length} products on Vivino.`,
  );
  return;
}

async function updateRatings(items) {
  log("?", `Updating ratings for ${items.length} products on Vivino.`);

  async function search(item, retry = 0) {
    const response = await fetch(item.rating.url, {
      method: "GET",
      headers: HEADERS,
      timeout: 10000,
    });

    if (response.status === 429) {
      if (retry < TRIES.max) {
        log(
          "!",
          `Timed out after ${retry + 1} retries. Retrying in ${TRIES.delay} seconds.`,
        );

        await new Promise((resolve) => setTimeout(resolve, TRIES.delay * 1000));
        return search(item, retry + 1);
      }

      throw new Error(`Timed out for ${retry + 1} tries.`);
    } else if (response.status !== 200) {
      throw new Error(`Status ${response.status}: ${response.statusText}.`);
    }

    const text = await response.text();
    let match = text.match(PATTERNS.search);
    if (!match) {
      throw new Error(`No pattern match found.`);
    }
    match = JSON.parse(match[1]);

    return {
      index: item.index,
      rating: {
        description: match.description,
        value: parseFloat(match.aggregateRating.ratingValue),
        count: parseInt(match.aggregateRating.ratingCount),
        reviews: parseInt(match.aggregateRating.reviewCount),
        updated: new Date(),
      },
    };
  }

  let products = [];

  for (const item of items) {
    try {
      let product = await search(item);
      if (!product) continue;
      products = products.concat(product);
    } catch (err) {
      log(
        "!",
        `Error when searching for ${item.name} (${item.index}): ${err.message}`,
      );
    }

    // To comply with vivino.com/robots.txt and avoid rate limiting.
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (products.length >= 25) {
      await updateDatabase(products, false);
      products = [];
    }
  }

  // Insert the remaining products, if any.
  if (products.length !== 0) {
    await updateDatabase(products, false);
  }

  log("?", `Finished updating ratings for ${items.length} products on Vivino.`);
  return;
}

async function main() {
  let items;
  let processed = [];

  // Search and extract ratings for products without ratings.
  items = (
    await itemCollection
      .find({
        // Ensure that only vinmonopolet products are included.
        // Tax-free-only products are through this filtered out.
        index: { $exists: true, $ne: null },
        name: { $exists: true },

        // Specific filter for products to update.
        $or: [{ rating: null }, { rating: { $exists: false } }],
        // "rating.updated": null,
        // "rating.updated": { $lt: new Date("2025-01-01") },
        // "rating.value": { $exists: true, $eq: 0 },

        // Vivino products are exclusively these categories.
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
      .toArray()
  ).filter(
    (item) =>
      item.index !== undefined &&
      item.index !== null &&
      !isNaN(Number(item.index)),
  );
  await searchRatings(items);

  processed = [...processed, ...items.map((item) => item.index)];
  log("?", `Processed items: ${processed}`);

  // Extract ratings for products with zero ratings.
  // I.e., products with no rating for specific vintage.
  // Vivino thus aggregates ratings for all vintages.
  items = await itemCollection
    .find({
      index: { $nin: processed },
      rating: { $exists: true, $ne: null },
      $or: [
        { "rating.value": { $exists: false } },
        { "rating.value": { $eq: 0 } },
        { "rating.value": { $eq: null } },
      ],
      "rating.url": { $exists: true, $ne: null },
    })
    .project({ index: 1, name: 1, rating: 1, _id: 0 })
    .toArray();
  await aggregatedRatings(items);

  processed = [...processed, ...items.map((item) => item.index)];

  // Update ratings for products with url.
  const delta = new Date();
  delta.setDate(delta.getDate() - 7);
  while (delta < new Date()) {
    items = await itemCollection
      .find({
        index: { $nin: processed },
        "rating.url": { $exists: true, $ne: null },
        "rating.updated": {
          $or: [{ $exists: false }, { $eq: null }, { $lte: delta }],
        },
      })
      .project({ index: 1, name: 1, rating: 1, _id: 0 })
      .toArray();
    await updateRatings(items);

    delta.setDate(delta.getDate() + 2);
    processed = [...processed, ...items.map((item) => item.index)];
  }
}

try {
  await main();
  log("?", "Vivino rating script completed successfully.");
} catch (error) {
  log("!", `Script failed: ${error.message}`);
  process.exit(1);
} finally {
  await client.close();
  log("?", "Database connection closed.");
}

process.exit(1);
